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
app.get('/:alias', async (req, res) => {
  try {
    const { alias } = req.params;
    const link = await Link.findOne({ where: { alias: alias.toLowerCase() } });
    
    if (!link) {
      return res.status(404).send(`<h1 style="text-align:center;margin-top:100px;">❌ 404 Not Found</h1>`);
    }

    // 1. บวกยอดคลิกรวม
    link.clicks += 1;
    await link.save();

    // 2. 🔥 โมดูล 1: คัดแยกพารามิเตอร์ช่องทาง (อัปเกรดระบบ Key => Value)
    // รองรับทั้งแบบใหม่ (?s=1) และเผื่อแบบเก่า (?src=fb) ที่อาจจะมีคนเอาไปแปะแล้ว
    let rawS = (req.query.s || '').toString().trim();
    let rawSrc = (req.query.src || '').toLowerCase().trim();
    let targetChannel = 'organic/direct'; 
    let forwardParam = '';

    if (rawS === '1' || rawSrc === 'facebook' || rawSrc === 'fb') { targetChannel = 'facebook'; forwardParam = '1'; }
    else if (rawS === '2' || rawSrc === 'tiktok' || rawSrc === 'tt') { targetChannel = 'tiktok'; forwardParam = '2'; }
    else if (rawS === '3' || rawSrc === 'line') { targetChannel = 'line'; forwardParam = '3'; }
    else if (rawS === '4' || rawSrc === 'sms') { targetChannel = 'sms'; forwardParam = '4'; }
    else if (rawS === '5' || rawSrc === 'seo') { targetChannel = 'seo'; forwardParam = '5'; }

    const [statRecord, created] = await LinkChannelStat.findOrCreate({
      where: { linkId: link.id, channel: targetChannel },
      defaults: { clicks: 1 }
    });
    if (!created) { statRecord.clicks += 1; await statRecord.save(); }

    // 3. โมดูล 2: บันทึกเวลาคลิก
    await LinkClickLog.create({ linkId: link.id, channel: targetChannel });

    // 4. โมดูล 3: วิเคราะห์อุปกรณ์ผู้ใช้
    const ua = req.get('user-agent') || '';
    let detectedPlatform = 'Other';
    if (/iphone|ipad|ipod/i.test(ua)) detectedPlatform = 'iOS';
    else if (/android/i.test(ua)) detectedPlatform = 'Android';
    else if (/windows|macintosh|linux/i.test(ua)) detectedPlatform = 'Desktop';

    const [devRecord, devCreated] = await LinkClickDevice.findOrCreate({
      where: { linkId: link.id, platform: detectedPlatform },
      defaults: { clicks: 1 }
    });
    if (!devCreated) { devRecord.clicks += 1; await devRecord.save(); }

    // 5. โมดูล 5: ดักจับและแกะรอยโดเมนต้นทาง (HTTP Referer)
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

    const [refStatRecord, refCreated] = await LinkReferrerStat.findOrCreate({
      where: { linkId: link.id, referrerDomain: detectedReferrer },
      defaults: { clicks: 1 }
    });
    if (!refCreated) {
      refStatRecord.clicks += 1;
      await refStatRecord.save();
    }

    // 6. 🚀 ประกอบ URL ส่งต่อไปเว็บหลัก (แนบแบบสั้น ?s=X ไปด้วย)
    let finalUrl = link.originalUrl + (link.parameter || '');
    if (targetChannel !== 'organic/direct') {
      const joinChar = finalUrl.includes('?') ? '&' : '?';
      finalUrl = `${finalUrl}${joinChar}s=${forwardParam}`;
    }

    res.redirect(finalUrl);
  } catch (error) {
    console.error('Redirect Error:', error);
    res.status(500).send('<h1>🛠️ 500 Server Error</h1>');
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