/* backend/server.js */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sequelize = require('./db');

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

// 🚀 ระบบ Redirect ลิงก์ย่อ พร้อมรวบรวมข้อมูล 5 โมดูล
app.get('/:alias', async (req, res) => {
  try {
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

    // 🥷 ทำงานแบบแบนเงียบ (Silent Pass)
    if (isBot || isSpam) {
      console.log(`🛡️ [Anti-Bot] ดักจับผู้ต้องสงสัย IP: ${clientIp} | Bot: ${isBot} (list:${inBotList} noBrowser:${notBrowser} noLang:${noAcceptLang}) | Spam: ${isSpam} | UA: ${ua.slice(0, 80)} (ส่งผ่านแต่ไม่บันทึกสถิติ)`);
      return res.redirect(finalUrl); 
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
    res.redirect(finalUrl);

  } catch (error) {
    console.error('Redirect Error:', error);
    // ป้องกันหน้าพัง ถ้าสถิติเซฟไม่ได้ ก็ยังต้องส่งคนไปปลายทางให้ได้
    res.status(500).send('<h1>🛠️ กำลังพาท่านไปยังปลายทาง... โปรดรอสักครู่</h1><script>setTimeout(function(){location.reload()}, 2000)</script>');
  }
});

const PORT = 5000;
sequelize.sync().then(() => {
  console.log('📦 Database Tables Synced Successfully!');
  app.listen(PORT, () => {
    console.log(`🚀 Yoalink Core Backend running on port ${PORT} with High Security Mode`);
  });
}).catch(err => {
  console.error('❌ Failed to sync database:', err);
});