/* backend/server.js */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sequelize = require('./db');
const fs = require('fs');
const path = require('path');

// ==========================================
// 🔎 [ชั่วคราว] Domain Proof Log — เก็บ Referer ดิบ + IP + UA ทุกคลิก เพื่อพิสูจน์บอท (ถอดออกได้ทั้งบล็อก)
// ==========================================
const PROOF_KEY = 'yoaproof-7x9k2m';                        // กุญแจเปิดหน้า domain-proof
const MONITOR_KEY = 'yoalink-monitor-2f8k';                 // กุญแจให้ monitor.js เช็กลิงก์โดยไม่เขียนสถิติ (กันสถิติเฟ้อ + ลดโหลด DB)
const PROOF_LOG = path.join(__dirname, 'domain-proof.log'); // ไฟล์ log (อยู่ใน .gitignore ไม่ขึ้น git)
function recordProof(entry) {
  fs.appendFile(PROOF_LOG, JSON.stringify(entry) + '\n', (err) => {
    if (err) console.error('Proof log write error:', err.message);
  });
}

// 📦 นำเข้าตารางฐานข้อมูลทั้งหมด
const User = require('./models/User');
const Link = require('./models/Link');
const Domain = require('./models/Domain');
const LinkChannelStat = require('./models/LinkChannelStat'); 
const LinkClickLog = require('./models/LinkClickLog'); 
const LinkClickDevice = require('./models/LinkClickDevice'); 
const LinkReferrerStat = require('./models/LinkReferrerStat')
const AuditLog = require('./models/AuditLog'); 

// 🤝 ประกาศผูกความสัมพันธ์ระหว่างตาราง (Associations)
Link.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(Link, { foreignKey: 'userId' });
Link.belongsTo(Domain, { foreignKey: 'domainId' });
Domain.hasMany(Link, { foreignKey: 'domainId' });

Link.hasMany(LinkChannelStat, { foreignKey: 'linkId', onDelete: 'CASCADE' });
LinkChannelStat.belongsTo(Link, { foreignKey: 'linkId' });

Link.hasMany(LinkClickLog, { foreignKey: 'linkId', onDelete: 'CASCADE' });
LinkClickLog.belongsTo(Link, { foreignKey: 'linkId' });

Link.hasMany(LinkClickDevice, { foreignKey: 'linkId', onDelete: 'CASCADE' });
LinkClickDevice.belongsTo(Link, { foreignKey: 'linkId' });

Link.hasMany(LinkReferrerStat, { foreignKey: 'linkId', onDelete: 'CASCADE' });
LinkReferrerStat.belongsTo(Link, { foreignKey: 'linkId' });

const app = express();
app.set('trust proxy', 1);
app.use(helmet()); 
app.disable('x-powered-by'); 

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 150, 
  message: { message: '🛑 ยิงคำสั่งถี่เกินไปแล้วลูกพี่! กรุณารอ 15 นาทีค่อยลองใหม่นะ' },
  standardHeaders: true, 
  legacyHeaders: false, 
});

app.use(cors());
app.use(express.json());

app.use('/api/', apiLimiter); 
app.use('/api/auth', require('./routes/auth'));
app.use('/api/links', require('./routes/links'));
app.use('/api/domains', require('./routes/domains'));
app.use('/api/admin', require('./routes/admin'));

// 🚀 ระบบ Redirect ลิงก์ย่อ พร้อมรวบรวมข้อมูล 5 โมดูล
// ==========================================
// 🛡️ ระบบ Anti-Bot & Anti-Spam (แบบ In-Memory ปลอดภัย 100%)
// ==========================================
const BOT_USER_AGENTS = [
  'bot', 'spider', 'crawler', 'preview', 'facebookexternalhit', 'line', 'twitterbot',
  'telegrambot', 'whatsapp', 'googlebot', 'bingbot', 'yandexbot',
  // 🧰 HTTP library / headless / scraper ที่บอทชอบใช้ (แม้จะปลอม 'mozilla' บางตัวก็ยังโดนจับ เช่น headlesschrome)
  'headlesschrome', 'phantomjs', 'scrapy', 'python', 'curl/', 'wget', 'okhttp',
  'go-http-client', 'axios', 'node-fetch', 'java/', 'libwww', 'httpclient'
];

// ตัวแปรจำ IP และจำนวนคลิกในหน่วยความจำชั่วคราว
const ipClickTracker = new Map();

// ระบบล้างแคชอัตโนมัติ (เคลียร์ IP ที่เก่าเกิน 1 นาทีทิ้ง เพื่อไม่ให้กิน RAM)
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of ipClickTracker.entries()) {
    if (now - data.timestamp > 60000) ipClickTracker.delete(ip);
  }
}, 60000);

// ==========================================
// 🛡️ ด่านที่ 4-5 (เพิ่ม 2026-10-30): พฤติกรรม 24 ชม. + Blocklist
// ที่มา: proof log 3 เดือนพบบอทที่ผ่านด่าน 1-3 ได้หมด (UA ปกติ, มี accept-language, ไม่เกิน 30 คลิก/นาที)
//   - บอทใส่ Referer ปลอม: IP เดียว (UA เดสก์ท็อป จาก datacenter) สุ่ม Referer 20-119 โดเมน/วัน
//     → สถิติ "โดเมนต้นทาง" โผล่โดเมนที่ไม่เคยติดลิงก์เราเลย (84.32.41.136 ใช้ไป 1,368 โดเมน)
//   - ฟาร์มกดลิงก์: IPv6 /64 เดียว หรือ IP คลาวด์ กด 50-130 alias/วัน (ปั่นยอดคลิก ไม่ปลอม referrer)
// เกณฑ์ปรับจากข้อมูลจริง 30 วัน (185,017 IP): ผู้ใช้จริงบน CGNAT มือถือใช้ referrer สูงสุด ~17 โดเมน/วัน
// แต่เป็น UA มือถือ — บอททั้งหมดเป็น UA เดสก์ท็อป จึงแยกได้ชัด ส่วน alias/วัน ผู้ใช้จริงไม่ถึง 25
// ==========================================
const BlockedIp = require('./models/BlockedIp');
const BEHAVIOR_WINDOW_MS = 24 * 3600e3;
const MAX_REFERRERS_DESKTOP = 15; // UA เดสก์ท็อป + referrer ต่างกัน >= นี้ ใน 24 ชม. = บอทใส่ Referer ปลอม
const MAX_ALIASES_PER_DAY = 25;   // กดลิงก์ต่างกัน >= นี้ ใน 24 ชม. = ฟาร์มกดลิงก์
const MAX_ALIASES_NO_REF = 15;    // ไม่มี referrer เลยทั้งวัน + กด >= นี้ alias = ฟาร์มกดตรง (ฟาร์ม "Android 12; Pixel 6" บน Google Cloud กด 15-26 alias/วัน
                                  // ผู้ใช้จริงที่กดหลายลิงก์มักมาจากหน้าเว็บ → มี referrer; ข้อมูล 30 วัน: ลายเซ็นนี้ 15 IP เป็นบอททั้งหมด)
const ipBehavior = new Map();     // key → { refs:Set, aliases:Set, since }
const blockedCache = new Map();   // ipAddress/prefix/CIDR → reason (โหลดจากตาราง BlockedIps ทุก 60 วิ)

const { ipKey, inCidr4 } = require('./utils/ip'); // key IPv6 = /64 (เติม 0 ครบ 4 หลัก) — ต้องตรงกับที่ admin/สคริปต์บันทึก

function getBlockReason(ip, key) {
  if (blockedCache.has(ip)) return blockedCache.get(ip);
  if (blockedCache.has(key)) return blockedCache.get(key);
  for (const [entry, reason] of blockedCache) {
    if (entry.includes('/') && !entry.includes(':') && inCidr4(ip, entry)) return reason;
  }
  return null;
}

async function reloadBlocklist() {
  try {
    const rows = await BlockedIp.findAll({ attributes: ['ipAddress', 'reason'], raw: true });
    blockedCache.clear();
    rows.forEach(r => blockedCache.set(r.ipAddress, r.reason || 'blocklist'));
  } catch (err) { console.error('Blocklist reload error:', err.message); }
}
setInterval(reloadBlocklist, 60000);

// เข้ากฎแล้วจำไว้ในตาราง ให้โดนบล็อกต่อเนื่องแม้ restart (admin ปลดได้ที่ /api/admin/blocked-ips)
function autoBlock(key, reason) {
  blockedCache.set(key, reason);
  BlockedIp.findOrCreate({ where: { ipAddress: key }, defaults: { reason: `auto:${reason}` } })
    .catch(err => console.error('Auto-block save error:', err.message));
}

// ประเมินพฤติกรรมใน 24 ชม. — คืนเหตุผลถ้าเป็นบอท
function checkBehavior(key, ua, refHost, alias, now) {
  let b = ipBehavior.get(key);
  if (!b || now - b.since > BEHAVIOR_WINDOW_MS) { b = { refs: new Set(), aliases: new Set(), since: now }; ipBehavior.set(key, b); }
  if (refHost) b.refs.add(refHost);
  b.aliases.add(alias);
  const isDesktop = !/mobile|android|iphone|ipad/.test(ua);
  if (isDesktop && b.refs.size >= MAX_REFERRERS_DESKTOP) return 'fakeRef';
  if (b.aliases.size >= MAX_ALIASES_PER_DAY) return 'manyAlias';
  if (b.refs.size === 0 && b.aliases.size >= MAX_ALIASES_NO_REF) return 'directFarm';
  return null;
}
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of ipBehavior) if (now - b.since > BEHAVIOR_WINDOW_MS) ipBehavior.delete(key);
}, 10 * 60 * 1000);

// 🔎 [ชั่วคราว] หน้าดูหลักฐาน Domain Proof (เปิดผ่าน /api ให้ nginx proxy ไป backend แน่นอน) — ถอดออกเมื่อเทสเสร็จ
app.get('/api/domain-proof.html', (req, res) => {
  if (req.query.key !== PROOF_KEY) return res.status(403).send('Forbidden');
  // ผ่อน CSP เฉพาะหน้านี้ ให้ inline <script> รันได้ (helmet default บล็อก inline script)
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'");
  res.sendFile(path.join(__dirname, 'domain-proof.html'));
});
app.get('/api/domain-proof-data', (req, res) => {
  if (req.query.key !== PROOF_KEY) return res.status(403).json({ error: 'forbidden' });
  let entries = [];
  try {
    const raw = fs.readFileSync(PROOF_LOG, 'utf8');
    entries = raw.trim().split('\n').filter(Boolean).slice(-3000)
      .map(l => { try { return JSON.parse(l); } catch (e) { return null; } })
      .filter(Boolean)
      .reverse();
  } catch (e) { /* ยังไม่มีไฟล์ = ยังไม่มีคลิกถูกบันทึก */ }
  res.json({ count: entries.length, entries });
});

// 🚀 ระบบ Redirect ลิงก์ย่อ พร้อมรวบรวมข้อมูล 5 โมดูล
app.get('/:alias', async (req, res) => {
  try {
    // 🚫 ห้าม Google เก็บตัว "ลิงก์ย่อ" เข้าดัชนี
    //
    // ต้องตั้งก่อนทุกทางออกของ handler นี้ (redirect 3 จุด + 404 + 500) เพราะ Google
    // อ่าน X-Robots-Tag จาก header ของผลตอบ 3xx ด้วย ไม่ใช่แค่จากหน้า HTML
    //
    // ที่ต้องมี: เคยใช้ 302 ซึ่ง Google ถือว่าเป็นการย้ายชั่วคราว จึงเก็บ "URL ต้นทาง"
    // ไว้ในดัชนีแล้วเอาชื่อเรื่องของปลายทางมาแสดง ผลคือค้น site:yoalink.com แล้วเจอ
    // ลิงก์พนันเต็มไปหมด ทั้งที่โดเมนนี้เป็นโดเมนเดียวกับ gsc.yoalink.com และ
    // audit.yoalink.com — ถ้าโดนตีว่าเป็นฟาร์ม redirect subdomain เครื่องมือภายในโดนหางเลขด้วยทั้งหมด
    //
    // ⚠️ ห้ามไปใส่ Disallow ใน robots.txt แทน — บล็อกแล้ว Googlebot จะเข้ามาอ่าน
    // header นี้ไม่ได้ URL เก่าก็ค้างในดัชนีต่อไปแบบไม่มีเนื้อหา แย่กว่าเดิม
    res.set('X-Robots-Tag', 'noindex, nofollow');

    // 🔁 ตอบ 301 (ย้ายถาวร) ให้ Google ยุบ URL ลิงก์ย่อทิ้งแล้วนับเป็นปลายทางแทน
    //
    // ⚠️ 301 ต้องคู่กับ Cache-Control: no-store เสมอ ห้ามถอดออก —
    // ปกติเบราว์เซอร์ (และ Cloudflare หน้าเรา) แคช 301 ไว้ถาวร คนที่เคยกดลิงก์แล้ว
    // จะถูกพาไปปลายทาง "เดิม" ตลอดไปโดยไม่ผ่านเซิร์ฟเวอร์ แม้ทีมเปลี่ยนโดเมนปลายทาง
    // ใหม่แล้ว (ซึ่งทำบ่อยมาก) และคลิกซ้ำพวกนั้นจะไม่ถูกนับสถิติด้วย
    // no-store สั่งไม่ให้แคชทุกชั้น ⇒ ทุกคลิกยังวิ่งผ่านเซิร์ฟเวอร์ เปลี่ยนปลายทางได้ นับสถิติได้ครบ
    // ต้องตั้งก่อนทุกทางออกเหมือน X-Robots-Tag (redirect 3 จุด + 404 + 500)
    res.set('Cache-Control', 'no-store');

    const { alias } = req.params;
    const link = await Link.findOne({ where: { alias: alias.toLowerCase() } });
    
    if (!link) {
      return res.status(404).send(`<h1 style="text-align:center;margin-top:100px;">❌ 404 Not Found</h1>`);
    }

    // --- 🎯 เตรียม URL เป้าหมายและช่องทาง ---
    let rawS = (req.query.s || '').toString().trim();
    let rawSrc = (req.query.src || '').toLowerCase().trim();
    let targetChannel = 'organic/direct'; 
    let forwardParam = '';

    if (rawS === '1' || rawSrc === 'facebook' || rawSrc === 'fb') { targetChannel = 'facebook'; forwardParam = '1'; }
    else if (rawS === '2' || rawSrc === 'tiktok' || rawSrc === 'tt') { targetChannel = 'tiktok'; forwardParam = '2'; }
    else if (rawS === '3' || rawSrc === 'line') { targetChannel = 'line'; forwardParam = '3'; }
    else if (rawS === '4' || rawSrc === 'sms') { targetChannel = 'sms'; forwardParam = '4'; }
    else if (rawS === '5' || rawSrc === 'seo') { targetChannel = 'seo'; forwardParam = '5'; }

    let finalUrl = link.originalUrl + (link.parameter || '');
    if (targetChannel !== 'organic/direct') {
      const joinChar = finalUrl.includes('?') ? '&' : '?';
      finalUrl = `${finalUrl}${joinChar}s=${forwardParam}`;
    }

    // 🩺 ตัวมอนิเตอร์ (monitor.js) — ตอบ redirect ทันที ไม่เขียนสถิติ/log (กันสถิติเฟ้อ + ลดโหลด DB ตอนเช็ก 328 ลิงก์)
    if (req.get('X-Monitor-Key') === MONITOR_KEY) {
      return res.redirect(301, finalUrl);
    }

    // ==========================================
    // 🛡️ ด่านกรองบอท & สแปมคลิก (เริ่มทำงาน)
    // ==========================================
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
    const ua = (req.get('user-agent') || '').toLowerCase();
    const acceptLang = req.get('accept-language') || '';

    // ด่านที่ 1: ตรวจจับ Bot/Crawler และ HTTP library จากรายชื่อ User-Agent
    const inBotList = BOT_USER_AGENTS.some(b => ua.includes(b));
    // ด่านที่ 2: เบราว์เซอร์จริงทุกตัวมีคำว่า 'mozilla' ใน UA — ถ้าไม่มี = ไม่ใช่คนกดจากเบราว์เซอร์
    const notBrowser = !ua.includes('mozilla');
    // ด่านที่ 3: เบราว์เซอร์จริงส่ง header accept-language เสมอ — บอทส่วนใหญ่ไม่ส่ง
    const noAcceptLang = acceptLang === '';
    const isBot = inBotList || notBrowser || noAcceptLang;
    
    // ด่านที่ 2: ตรวจจับการกดสแปมคลิก (เกิน 30 ครั้ง ภายใน 1 นาที)
    let isSpam = false;
    const now = Date.now();
    
    if (ipClickTracker.has(clientIp)) {
      const data = ipClickTracker.get(clientIp);
      if (now - data.timestamp < 60000) {
        data.count += 1;
        if (data.count > 30) isSpam = true; // 🚨 สแปมแน่นอน!
      } else {
        ipClickTracker.set(clientIp, { count: 1, timestamp: now }); // รีเซ็ตเมื่อพ้น 1 นาที
      }
    } else {
      ipClickTracker.set(clientIp, { count: 1, timestamp: now });
    }

    // ด่านที่ 4: blocklist (IP / IPv6 prefix / CIDR ที่พิสูจน์แล้วว่าเป็นบอท + ที่ระบบ auto-add)
    // ด่านที่ 5: พฤติกรรม 24 ชม. (Referer ปลอมหลายโดเมน / กดหลาย alias) — ดู comment ด้านบน
    const firstIp = String(clientIp).split(',')[0].trim();
    const behaviorKey = ipKey(firstIp);
    let behaviorReason = null;
    if (!isBot && !isSpam) {
      behaviorReason = getBlockReason(firstIp, behaviorKey);
      if (!behaviorReason) {
        let refHost = '';
        try { refHost = new URL(req.get('Referer') || req.get('Referrer') || '').hostname.replace(/^www\./, ''); } catch (e) { /* ไม่มี/ผิดรูปแบบ */ }
        behaviorReason = checkBehavior(behaviorKey, ua, refHost, link.alias, now);
        if (behaviorReason) autoBlock(behaviorKey, behaviorReason);
      }
    }

    // 🥷 ทำงานแบบแบนเงียบ (Silent Pass)
    if (isBot || isSpam || behaviorReason) {
      const reason = isSpam ? 'spam' : inBotList ? 'botlist' : notBrowser ? 'noBrowser' : noAcceptLang ? 'noLang' : behaviorReason;
      console.log(`🛡️ [Anti-Bot] ดักจับผู้ต้องสงสัย IP: ${clientIp} | reason: ${reason} | UA: ${ua.slice(0, 80)} (ส่งผ่านแต่ไม่บันทึกสถิติ)`);
      recordProof({ t: new Date().toISOString(), alias: link.alias, status: 'blocked', reason, ref: '', rawRef: req.get('Referer') || req.get('Referrer') || '', ip: clientIp, ua: req.get('user-agent') || '' });
      return res.redirect(301, finalUrl);
    }

    // ==========================================
    // 📊 บันทึกสถิติ (ทำงานเมื่อเป็นคนปกติเท่านั้น)
    // ==========================================
    link.clicks += 1;
    await link.save();

    const [statRecord, created] = await LinkChannelStat.findOrCreate({
      where: { linkId: link.id, channel: targetChannel }, defaults: { clicks: 1 }
    });
    if (!created) { statRecord.clicks += 1; await statRecord.save(); }

    let detectedPlatform = 'Other';
    if (/iphone|ipad|ipod/i.test(ua)) detectedPlatform = 'iOS';
    else if (/android/i.test(ua)) detectedPlatform = 'Android';
    else if (/windows|macintosh|linux/i.test(ua)) detectedPlatform = 'Desktop';

    const [devRecord, devCreated] = await LinkClickDevice.findOrCreate({
      where: { linkId: link.id, platform: detectedPlatform }, defaults: { clicks: 1 }
    });
    if (!devCreated) { devRecord.clicks += 1; await devRecord.save(); }

    const refererHeader = req.get('Referer') || req.get('Referrer') || '';
    let detectedReferrer = 'Direct, Email, SMS'; 

    if (refererHeader) {
      try {
        const refUrl = new URL(refererHeader);
        detectedReferrer = refUrl.hostname.replace(/^www\./, ''); 
      } catch (err) {
        detectedReferrer = 'Unknown Domain'; 
      }
    }

    // 🔎 [ชั่วคราว] เก็บหลักฐานคลิกที่ถูกนับ (Referer ดิบ + IP + UA)
    recordProof({ t: new Date().toISOString(), alias: link.alias, status: 'counted', reason: '', ref: detectedReferrer, rawRef: refererHeader, ip: clientIp, ua: req.get('user-agent') || '' });

    // 📝 บันทึก log รายคลิก (มี timestamp) พร้อม referrer เพื่อใช้กรองตามช่วงเวลา
    await LinkClickLog.create({ linkId: link.id, channel: targetChannel, referrerDomain: detectedReferrer });

    const [refStatRecord, refCreated] = await LinkReferrerStat.findOrCreate({
      where: { linkId: link.id, referrerDomain: detectedReferrer }, defaults: { clicks: 1 }
    });
    if (!refCreated) {
      refStatRecord.clicks += 1;
      await refStatRecord.save();
    }

    // 🚀 ส่งลูกค้าจริงๆ ไปปลายทาง
    res.redirect(301, finalUrl);

  } catch (error) {
    console.error('Redirect Error:', error);
    // ป้องกันหน้าพัง ถ้าสถิติเซฟไม่ได้ ก็ยังต้องส่งคนไปปลายทางให้ได้
    res.status(500).send('<h1>🛠️ กำลังพาท่านไปยังปลายทาง... โปรดรอสักครู่</h1><script>setTimeout(function(){location.reload()}, 2000)</script>');
  }
});

const PORT = 5000;
sequelize.sync().then(async () => {
  console.log('📦 Database Tables Synced Successfully!');
  await reloadBlocklist(); // โหลด blocklist ก่อนเปิดรับคลิก
  console.log(`🛡️ Blocklist loaded: ${blockedCache.size} รายการ`);
  app.listen(PORT, () => {
    console.log(`🚀 Yoalink Core Backend running on port ${PORT} with High Security Mode`);
  });
}).catch(err => {
  console.error('❌ Failed to sync database:', err);
});