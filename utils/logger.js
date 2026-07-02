/* backend/utils/logger.js */
const axios = require('axios');
const AuditLog = require('../models/AuditLog');

// 🧠 ระบบจำพิกัด IP ชั่วคราว (Memory Cache) ป้องกันการโดนแบนจากลิมิต 45 Req/Min
const ipCache = new Map();

async function createAuditLog(req, action, details) {
  try {
    // 1. ดึง IP จริงของ User (ทะลวงเกราะ Nginx)
    let ip = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.socket.remoteAddress || null;
    if (ip && ip.includes(',')) ip = ip.split(',')[0].trim(); 

    let location = 'ไม่ระบุตำแหน่ง';

    if (ip && ip !== '::1' && ip !== '127.0.0.1') {
      // 2. ถ้า IP นี้เคยสืบพิกัดมาแล้วใน 1 ชั่วโมงที่ผ่านมา ให้ดึงจาก Cache มาใช้เลย (ไม่เปลืองโควต้า API)
      if (ipCache.has(ip)) {
        location = ipCache.get(ip);
      } else {
        try {
          // 🔥 อ้างอิงตาม Docs /api:json: เลือกเฉพาะฟิลด์ที่จำเป็น (fields) เพื่อให้โหลดเร็วสุดๆ
          const url = `http://ip-api.com/json/${ip}?fields=status,country,regionName,city&lang=th`;
          const res = await axios.get(url, { timeout: 3000 });

          if (res.data.status === 'success') {
            location = `${res.data.city}, ${res.data.regionName}, ${res.data.country}`;
            
            // เอาพิกัดเก็บลงสมอง Cache และตั้งเวลาลืมในอีก 1 ชั่วโมง (3,600,000 ms)
            ipCache.set(ip, location);
            setTimeout(() => ipCache.delete(ip), 3600 * 1000); 
          }
        } catch (err) {
          console.error('IP-API Tracking Error (อาจโดน Rate Limit):', err.message);
        }
      }
    } else {
      ip = 'Localhost';
      location = 'เซิร์ฟเวอร์ส่วนกลาง';
    }

    // 3. บันทึกทุกอย่างลงฐานข้อมูล
    await AuditLog.create({
      userId: req.user.id,
      action,
      details,
      ipAddress: ip,
      location
    });

  } catch (error) {
    console.error('Audit Logger Failed:', error);
  }
}

module.exports = createAuditLog;