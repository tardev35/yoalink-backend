/* backend/scripts/clean-bot-stats.js — ล้างคลิกบอทออกจากสถิติย้อนหลัง โดยใช้ domain-proof.log เป็นหลักฐาน
 *
 * วิธีใช้ (บน VPS, ในโฟลเดอร์ backend):
 *   node scripts/clean-bot-stats.js            → dry-run: แสดงว่าจะลบอะไรบ้าง ไม่แตะ DB
 *   node scripts/clean-bot-stats.js --apply    → ลบจริง (สำรอง DB ก่อนเองด้วย sqlite3 .backup)
 *
 * ขั้นตอน:
 *  1) อ่าน log รอบแรก: ประเมินกฎเดียวกับ server.js ต่อ IP ต่อวัน → IP ไหนเข้ากฎวันใดวันหนึ่ง = บอท (ทุกคลิกของมันทั้ง log)
 *     + รายการ IP/prefix ที่พิสูจน์แล้ว (STATIC_BLOCK)
 *  2) อ่าน log รอบสอง: รวบรวมคลิกที่ถูกนับ (status=counted) ของ IP บอท
 *  3) ลบออกจาก DB: LinkClickLogs (จับคู่ linkId+referrer+เวลา ±3 วิ เพื่อรู้ช่องทาง), LinkReferrerStats,
 *     LinkChannelStats, LinkClickDevices, Links.clicks — ทำเป็นชุดเล็กๆ ไม่ล็อก DB นาน
 *  4) บันทึก IP บอทลงตาราง BlockedIps ให้ server.js บล็อกต่อ
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const sqlite3 = require('sqlite3');

const APPLY = process.argv.includes('--apply');
const LOG = path.join(__dirname, '..', 'domain-proof.log');
const DB = path.join(__dirname, '..', 'database.sqlite');
const MAX_REFERRERS_DESKTOP = 15;
const MAX_ALIASES_PER_DAY = 25;
const MAX_ALIASES_NO_REF = 15; // ไม่มี referrer เลย + alias >= นี้ = ฟาร์มกดตรง (เหมือน server.js)

// IP/prefix ที่พิสูจน์จากการวิเคราะห์ 30 ก.ค.–30 ต.ค. 2026 (datacenter + ฟาร์มกดลิงก์)
const STATIC_BLOCK = {
  '84.32.41.136': 'fakeRef (HOSTGNOME GB, 1,368 โดเมนปลอม)',
  '93.95.227.183': 'fakeRef', '104.168.65.125': 'fakeRef', '45.86.86.185': 'fakeRef', '192.227.221.88': 'fakeRef',
  '89.117.94.85': 'fakeRef (Hostinger)', '89.117.94.191': 'fakeRef (Hostinger)',
  '102.209.119.233': 'fakeRef', '102.209.118.123': 'fakeRef', '103.102.119.61': 'fakeRef',
  '205.147.27.0/24': 'fakeRef (datacenter range)',
  '2407:b1c0:0dc0:82af::/64': 'linuxFarm (133 alias/วัน)', '2407:b1c0:0dc1:15da::/64': 'linuxFarm',
  '2602:fa5d:0000:0000::/64': 'directFarm (1,010 คลิก/17 วัน ไม่มี referrer)',
};

const { ipKey, inCidr4 } = require('../utils/ip');
function platformOf(ua) {
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/android/i.test(ua)) return 'Android';
  if (/windows|macintosh|linux/i.test(ua)) return 'Desktop';
  return 'Other';
}
function staticReason(ip, key) {
  if (STATIC_BLOCK[ip]) return STATIC_BLOCK[ip];
  if (STATIC_BLOCK[key]) return STATIC_BLOCK[key];
  for (const [entry, reason] of Object.entries(STATIC_BLOCK)) if (entry.includes('/') && !entry.includes(':') && inCidr4(ip, entry)) return reason;
  return null;
}

async function scan(onEntry) {
  const rl = readline.createInterface({ input: fs.createReadStream(LOG) });
  for await (const line of rl) {
    let x; try { x = JSON.parse(line); } catch (e) { continue; }
    if (x.status !== 'counted') continue;
    const ip = String(x.ip).split(',')[0].trim();
    onEntry(x, ip, ipKey(ip));
  }
}

(async () => {
  // ---------- รอบ 1: หา IP บอท ----------
  const flagged = new Map(); // key → reason
  let day = null, dayMap = new Map();
  const flushDay = () => {
    for (const [key, b] of dayMap) {
      if (flagged.has(key)) continue;
      if (b.desktop && b.refs.size >= MAX_REFERRERS_DESKTOP) flagged.set(key, `fakeRef (${b.refs.size} โดเมน/วัน)`);
      else if (b.aliases.size >= MAX_ALIASES_PER_DAY) flagged.set(key, `manyAlias (${b.aliases.size} alias/วัน)`);
      else if (b.refs.size === 0 && b.aliases.size >= MAX_ALIASES_NO_REF) flagged.set(key, `directFarm (${b.aliases.size} alias/วัน ไม่มี referrer)`);
    }
    dayMap = new Map();
  };
  await scan((x, ip, key) => {
    const d = x.t.slice(0, 10);
    if (d !== day) { flushDay(); day = d; }
    const s = staticReason(ip, key);
    if (s && !flagged.has(key)) flagged.set(key, s);
    let b = dayMap.get(key);
    if (!b) { b = { refs: new Set(), aliases: new Set(), desktop: !/mobile|android|iphone|ipad/i.test(x.ua) }; dayMap.set(key, b); }
    if (x.ref && x.ref !== 'Direct, Email, SMS' && x.ref !== 'Unknown Domain') b.refs.add(x.ref);
    b.aliases.add(x.alias);
  });
  flushDay();
  flagged.delete('207.148.123.38'); // ตัวมอนิเตอร์เก่าของเราเอง (ก.ค.-ส.ค.) ไม่ใช่บอท

  // ---------- รอบ 2: รวบรวมคลิกบอท ----------
  const clicks = []; // { alias, ref, t, platform }
  await scan((x, ip, key) => {
    if (!flagged.has(key)) return;
    clicks.push({ alias: x.alias, ref: x.ref, t: x.t, platform: platformOf(x.ua) });
  });
  const byIp = {};
  console.log(`IP บอท ${flagged.size} รายการ · คลิกที่ถูกนับจากบอท ${clicks.length}`);
  const reasons = {}; for (const r of flagged.values()) { const k = r.split(' ')[0]; reasons[k] = (reasons[k] || 0) + 1; }
  console.log('แยกตามเหตุผล:', reasons);

  // ---------- รอบ 3: ลงมือใน DB ----------
  const db = new sqlite3.Database(DB);
  const all = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
  const run = (sql, p = []) => new Promise((res, rej) => db.run(sql, p, function (e) { e ? rej(e) : res(this); }));
  await run('PRAGMA busy_timeout=15000');

  const links = await all('SELECT id, alias FROM Links');
  const linkIdByAlias = Object.fromEntries(links.map(l => [l.alias.toLowerCase(), l.id]));
  const perLink = {}, perRef = {}, perPlat = {}, perChannel = {};
  let matchedLogs = 0, unmatchedLogs = 0, noLink = 0;
  const toDelete = [];

  const bump = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
  let i = 0;
  for (const c of clicks) {
    const linkId = linkIdByAlias[String(c.alias).toLowerCase()];
    if (!linkId) { noLink++; continue; }
    bump(perLink, linkId); bump(perRef, `${linkId}\t${c.ref}`); bump(perPlat, `${linkId}\t${c.platform}`);
    const t = new Date(c.t).getTime();
    const lo = new Date(t - 3000).toISOString().replace('T', ' ').replace('Z', ' +00:00');
    const hi = new Date(t + 3000).toISOString().replace('T', ' ').replace('Z', ' +00:00');
    // ClickLog เก็บ referrerDomain ตั้งแต่มีฟีเจอร์นี้ — ถ้าไม่ตรง ลองจับแค่เวลา
    let row = (await all('SELECT id, channel FROM LinkClickLogs WHERE linkId=? AND referrerDomain=? AND createdAt BETWEEN ? AND ? LIMIT 1', [linkId, c.ref, lo, hi]))[0]
      || (await all('SELECT id, channel FROM LinkClickLogs WHERE linkId=? AND referrerDomain IS NULL AND createdAt BETWEEN ? AND ? LIMIT 1', [linkId, lo, hi]))[0];
    if (row) {
      matchedLogs++; toDelete.push(row.id); bump(perChannel, `${linkId}\t${row.channel || 'organic/direct'}`);
      if (APPLY && toDelete.length >= 500) { await run(`DELETE FROM LinkClickLogs WHERE id IN (${toDelete.join(',')})`); toDelete.length = 0; }
    } else unmatchedLogs++;
    if (++i % 10000 === 0) console.log(`  ประมวลผล ${i}/${clicks.length} …`);
  }
  if (APPLY && toDelete.length) await run(`DELETE FROM LinkClickLogs WHERE id IN (${toDelete.join(',')})`);

  console.log(`\nClickLog: จับคู่ได้ ${matchedLogs} · จับคู่ไม่ได้ ${unmatchedLogs} (ไม่ลบ, ไม่หักช่องทาง) · alias ไม่มีในระบบ ${noLink}`);
  console.log(`จะหัก: Links ${Object.keys(perLink).length} ลิงก์ · ReferrerStats ${Object.keys(perRef).length} แถว · ChannelStats ${Object.keys(perChannel).length} · Devices ${Object.keys(perPlat).length}`);
  const topRef = Object.entries(perRef).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => k.split('\t')[1] + ':' + n).join(', ');
  console.log('referrer ที่โดนหักมากสุด:', topRef);

  if (!APPLY) { console.log('\n(dry-run) ใส่ --apply เพื่อลบจริง'); db.close(); return; }

  await run('BEGIN');
  let refDeleted = 0;
  for (const [k, n] of Object.entries(perRef)) {
    const [linkId, ref] = k.split('\t');
    await run('UPDATE LinkReferrerStats SET clicks = MAX(0, clicks - ?) WHERE linkId=? AND referrerDomain=?', [n, linkId, ref]);
    refDeleted += (await run('DELETE FROM LinkReferrerStats WHERE linkId=? AND referrerDomain=? AND clicks <= 0', [linkId, ref])).changes;
  }
  for (const [k, n] of Object.entries(perChannel)) { const [linkId, ch] = k.split('\t'); await run('UPDATE LinkChannelStats SET clicks = MAX(0, clicks - ?) WHERE linkId=? AND channel=?', [n, linkId, ch]); }
  for (const [k, n] of Object.entries(perPlat)) { const [linkId, p] = k.split('\t'); await run('UPDATE LinkClickDevices SET clicks = MAX(0, clicks - ?) WHERE linkId=? AND platform=?', [n, linkId, p]); }
  for (const [linkId, n] of Object.entries(perLink)) await run('UPDATE Links SET clicks = MAX(0, clicks - ?) WHERE id=?', [n, linkId]);
  const now = new Date().toISOString().replace('T', ' ').replace('Z', ' +00:00');
  let blocked = 0;
  for (const [key, reason] of flagged) blocked += (await run('INSERT OR IGNORE INTO BlockedIps (ipAddress, reason, createdAt, updatedAt) VALUES (?,?,?,?)', [key, ('auto:' + reason).slice(0, 200), now, now])).changes;
  await run('COMMIT');
  console.log(`\n✅ ลบแล้ว: ClickLog ${matchedLogs} แถว · ReferrerStats แถวที่เหลือ 0 ถูกลบ ${refDeleted} · เพิ่ม BlockedIps ${blocked} รายการ`);
  fs.writeFileSync(path.join(__dirname, '..', 'backups', `botclean-report-${Date.now()}.json`), JSON.stringify({ flagged: [...flagged], clicks: clicks.length, matchedLogs, unmatchedLogs, perLink, perRef, perChannel, perPlat }, null, 1));
  db.close();
})().catch(e => { console.error('❌', e); process.exit(1); });
