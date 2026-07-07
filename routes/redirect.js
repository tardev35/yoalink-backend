/* backend/routes/redirect.js */
const express = require('express');
const { Op } = require('sequelize');
const Link = require('../models/Link');
const LinkChannelStat = require('../models/LinkChannelStat'); 
const LinkClickLog = require('../models/LinkClickLog'); 
const LinkClickDevice = require('../models/LinkClickDevice'); 
const LinkReferrerStat = require('../models/LinkReferrerStat');
const BlockedIp = require('../models/BlockedIp'); 
const router = express.Router();

// 🤖 ลิสต์รายชื่อบอทที่ชอบมาป้วนเปี้ยน (ไม่แบน แต่ไม่ให้ยอด)
const BOT_USER_AGENTS = [
  'bot', 'spider', 'crawler', 'preview', 'facebookexternalhit', 'line', 'twitterbot',
  'telegrambot', 'whatsapp', 'googlebot', 'bingbot', 'yandexbot', 
  // ดักบอทสายตรวจ (Monitor) ของเราเองที่วิ่งทุกชั่วโมง
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
];

router.get('/:alias', async (req, res) => {
  try {
    const { alias } = req.params;
    const link = await Link.findOne({ where: { alias: alias.toLowerCase() } });
    
    if (!link) {
      return res.status(404).send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #EB568E;">404 Not Found</h1>
          <p>อ๊ะ! ไม่พบลิงก์ <b>/${alias}</b> ในระบบของเรา</p>
        </div>
      `);
    }

    // 🎯 เตรียม URL เป้าหมายให้พร้อมตั้งแต่เนิ่นๆ
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

    // ==========================================
    // 🛡️ โซนความปลอดภัย: ด่านตรวจ Anti-Spam
    // ==========================================
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'Unknown';
    const userAgent = req.headers['user-agent'] ? req.headers['user-agent'].toLowerCase() : '';

    // 🛑 1. ด่านตรวจแบล็กลิสต์ถาวร
    const isBlocked = await BlockedIp.findOne({ where: { ipAddress: clientIp } });
    if (isBlocked) {
      console.log(`🛡️ [BLOCKED IP DETECTED]: ${clientIp} ถูกเตะทิ้งแบบเงียบๆ`);
      return res.redirect(finalUrl); // ปล่อยไปเว็บหลัก แต่ไม่เก็บสถิติ
    }

    // 🛑 2. ด่านตรวจบอทโซเชียล & บอทสายตรวจ (User-Agent Filter)
    const isBot = BOT_USER_AGENTS.some(bot => userAgent.includes(bot.toLowerCase()));
    if (isBot) {
      console.log(`🤖 [BOT DETECTED]: ปล่อยบอทผ่านไปทำ Preview แต่ไม่เก็บสถิติ`);
      return res.redirect(finalUrl); 
    }

    // 🛑 3. ด่านตรวจสแปมคลิก (เกิน 10 ครั้งใน 1 นาที)
    const oneMinuteAgo = new Date(new Date() - 60 * 1000);
    const recentClicks = await LinkClickLog.count({
      where: { linkId: link.id, ipAddress: clientIp, createdAt: { [Op.gte]: oneMinuteAgo } }
    });
    if (recentClicks >= 10) {
      console.log(`🚨 [BOT SUSPECT]: IP ${clientIp} กดรัว ${recentClicks} ครั้งใน 1 นาที (ระงับนับยอด)`);
      return res.redirect(finalUrl);
    }


    // ==========================================
    // 📊 โซนบันทึกสถิติ (สำหรับคนจริงๆ ที่ผ่านด่านมาได้)
    // ==========================================
    link.clicks += 1;
    await link.save();

    // โมดูล 1: บันทึกช่องทาง
    const [statRecord, created] = await LinkChannelStat.findOrCreate({
      where: { linkId: link.id, channel: targetChannel }, defaults: { clicks: 1 }
    });
    if (!created) { statRecord.clicks += 1; await statRecord.save(); }

    // โมดูล 2: บันทึกเวลาคลิก + เก็บ IP ไว้ใช้จับสแปม
    await LinkClickLog.create({ linkId: link.id, channel: targetChannel, ipAddress: clientIp });

    // โมดูล 3: วิเคราะห์อุปกรณ์
    let detectedPlatform = 'Other';
    if (/iphone|ipad|ipod/i.test(userAgent)) detectedPlatform = 'iOS';
    else if (/android/i.test(userAgent)) detectedPlatform = 'Android';
    else if (/windows|macintosh|linux/i.test(userAgent)) detectedPlatform = 'Desktop';

    const [devRecord, devCreated] = await LinkClickDevice.findOrCreate({
      where: { linkId: link.id, platform: detectedPlatform }, defaults: { clicks: 1 }
    });
    if (!devCreated) { devRecord.clicks += 1; await devRecord.save(); }

    // โมดูล 5: แกะรอยโดเมนต้นทาง (Referer)
    const refererHeader = req.get('Referer') || req.get('Referrer') || '';
    let detectedReferrer = 'Direct, Email, SMS'; 
    if (refererHeader) {
      try {
        const refUrl = new URL(refererHeader);
        detectedReferrer = refUrl.hostname.replace(/^www\./, ''); 
      } catch (err) { detectedReferrer = 'Unknown Domain'; }
    }

    const [refStatRecord, refCreated] = await LinkReferrerStat.findOrCreate({
      where: { linkId: link.id, referrerDomain: detectedReferrer }, defaults: { clicks: 1 }
    });
    if (!refCreated) { refStatRecord.clicks += 1; await refStatRecord.save(); }

    // 🚀 ส่งลูกค้าเข้าเว็บ
    res.redirect(finalUrl);

  } catch (error) {
    console.error('Redirect Error:', error);
    res.status(500).send('<h1>🛠️ 500 Server Error</h1>');
  }
});

module.exports = router;