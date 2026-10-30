/* backend/utils/ip.js — ตัวช่วยจัดการ IP สำหรับระบบกันบอท (ใช้ร่วมกัน server.js / routes/admin.js / scripts/clean-bot-stats.js)
   ⚠️ key ของ IPv6 ต้องมีรูปแบบเดียวกันทุกที่ (เติม 0 ครบ 4 หลัก) ไม่งั้น blocklist จะจับไม่ตรง */

// IPv4 คืนตามเดิม · IPv6 ขยายเป็น 8 กลุ่มเต็ม แล้วใช้ 4 กลุ่มแรก (/64) — บอทเปลี่ยน address ใน /64 เดียวกันได้ไม่จำกัด
function ipKey(ip) {
  if (!ip.includes(':')) return ip;
  const [head, tail = ''] = ip.replace(/\/\d+$/, '').split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const full = [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return full.slice(0, 4).map(g => g.toLowerCase().padStart(4, '0')).join(':') + '::/64';
}

// IPv4 อยู่ใน CIDR ไหม (เช่น 205.147.27.0/24)
function inCidr4(ip, cidr) {
  const [net, bitsStr] = cidr.split('/');
  const bits = Number(bitsStr);
  const v4 = /^\d+\.\d+\.\d+\.\d+$/;
  if (!v4.test(ip) || !v4.test(net) || !(bits >= 0 && bits <= 32)) return false;
  const toInt = (s) => s.split('.').reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (toInt(ip) & mask) === (toInt(net) & mask);
}

// ทำให้ค่าที่ admin กรอกเป็นรูปแบบมาตรฐาน: IPv6 (เดี่ยวหรือ /64) → key /64 · IPv4/CIDR → ตามเดิม
function normalizeBlockEntry(s) {
  const v = String(s || '').trim();
  return v.includes(':') ? ipKey(v) : v;
}

module.exports = { ipKey, inCidr4, normalizeBlockEntry };
