/* backend/routes/redirect.js */
const express = require('express');
const { Op } = require('sequelize');
const Link = require('../models/Link');
const LinkClickLog = require('../models/LinkClickLog'); // ต้องดึงมาใช้นับประวัติ
const BlockedIp = require('../models/BlockedIp'); // ดึงตารางแบนมาเช็ก
const router = express.Router();

router.get('/:alias', async (req, res) => {
  try {
    const { alias } = req.params;
    const link = await Link.findOne({ where: { alias: alias } });

    if (!link) {
      return res.status(404).send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #EB568E;">404 Not Found</h1>
          <p>อ๊ะ! ไม่พบลิงก์ <b>/${alias}</b> ในระบบของเรา</p>
        </div>
      `);
    }

    // 🛑 1. ดึง IP ของลูกค้า
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';

    // 🛑 2. เช็กว่า IP นี้อยู่ใน Blacklist (โดนแบนถาวร) หรือไม่?
    const isBlocked = await BlockedIp.findOne({ where: { ipAddress: clientIp } });
    if (isBlocked) {
      // 🥷 Shadowban ถาวร: ปล่อยผ่านไปเว็บปลายทาง แต่ไม่บวกยอดใดๆ ทั้งสิ้น!
      console.log(`🛡️ [BLOCKED IP DETECTED]: ${clientIp} พยายามเข้าถึงลิงก์ (เตะทิ้งแบบเงียบๆ)`);
      return res.redirect(link.originalUrl);
    }

    // 🛑 3. ระบบจับตาดูบอท (เช็กประวัติ 1 นาทีล่าสุด)
    const oneMinuteAgo = new Date(new Date() - 60 * 1000);
    const recentClicks = await LinkClickLog.count({
      where: {
        linkId: link.id,
        ipAddress: clientIp,
        createdAt: { [Op.gte]: oneMinuteAgo }
      }
    });

    // 🛑 4. ถ้ากดเกิน 10 ครั้งใน 1 นาที (คนปกติทำไม่ได้แน่นอน)
    if (recentClicks >= 10) {
      console.log(`🚨 [BOT SUSPECT]: IP ${clientIp} กดรัว ${recentClicks} ครั้งใน 1 นาที (ระงับการนับยอดชั่วคราว)`);
      // 🥷 Shadowban ชั่วคราว: ปล่อยผ่าน แต่ไม่เก็บ Data (รอลูกพี่มากดแบนถาวรใน Dashboard)
      return res.redirect(link.originalUrl);
    }

    // ✅ 5. ถ้าเป็นคนปกติ: บวกยอดคลิกและพาไปเว็บปลายทาง
    link.clicks += 1;
    await link.save();

    return res.redirect(link.originalUrl);

  } catch (error) {
    console.error('Redirect Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;