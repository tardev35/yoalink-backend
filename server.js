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
const LinkClickDevice = require('./models/LinkClickDevice'); // 🔥 โมดูล 3: นำเข้าตารางอุปกรณ์ตัวใหม่

// 🤝 ประกาศผูกความสัมพันธ์ระหว่างตาราง (Associations)
Link.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(Link, { foreignKey: 'userId' });
Link.belongsTo(Domain, { foreignKey: 'domainId' });
Domain.hasMany(Link, { foreignKey: 'domainId' });

Link.hasMany(LinkChannelStat, { foreignKey: 'linkId', onDelete: 'CASCADE' });
LinkChannelStat.belongsTo(Link, { foreignKey: 'linkId' });

Link.hasMany(LinkClickLog, { foreignKey: 'linkId', onDelete: 'CASCADE' });
LinkClickLog.belongsTo(Link, { foreignKey: 'linkId' });

// 🔥 โมดูล 3: ผูกความสัมพันธ์ตารางสถิติอุปกรณ์
Link.hasMany(LinkClickDevice, { foreignKey: 'linkId', onDelete: 'CASCADE' });
LinkClickDevice.belongsTo(Link, { foreignKey: 'linkId' });

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

// 🚀 ระบบ Redirect ลิงก์ย่อ + ดักจับพารามิเตอร์ช่องทาง + บันทึกเวลา + วิเคราะห์คัดแยกอุปกรณ์ (Module 3)
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

    // 2. แกะรอยค่ายการตลาด (Module 1)
    let rawSrc = (req.query.src || '').toLowerCase().trim();
    let targetChannel = 'organic/direct'; 

    if (rawSrc === 'facebook' || rawSrc === 'fb') targetChannel = 'facebook';
    else if (rawSrc === 'tiktok' || rawSrc === 'tt') targetChannel = 'tiktok';
    else if (rawSrc === 'line') targetChannel = 'line';
    else if (rawSrc === 'sms') targetChannel = 'sms';
    else if (rawSrc === 'seo') targetChannel = 'seo';

    const [statRecord, created] = await LinkChannelStat.findOrCreate({
      where: { linkId: link.id, channel: targetChannel },
      defaults: { clicks: 1 }
    });
    if (!created) {
      statRecord.clicks += 1;
      await statRecord.save();
    }

    // 3. บันทึกประวัติเวลาคลิก (Module 2)
    await LinkClickLog.create({
      linkId: link.id,
      channel: targetChannel
    });

    // 4. 🔥 โมดูล 3: ดักจับและคัดแยกกลุ่มระบบปฏิบัติการ (User-Agent Sniffer)
    const ua = req.get('user-agent') || '';
    let detectedPlatform = 'Other';

    if (/iphone|ipad|ipod/i.test(ua)) {
      detectedPlatform = 'iOS';
    } else if (/android/i.test(ua)) {
      detectedPlatform = 'Android';
    } else if (/windows|macintosh|linux/i.test(ua)) {
      detectedPlatform = 'Desktop';
    }

    const [devRecord, devCreated] = await LinkClickDevice.findOrCreate({
      where: { linkId: link.id, platform: detectedPlatform },
      defaults: { clicks: 1 }
    });
    if (!devCreated) {
      devRecord.clicks += 1;
      await devRecord.save();
    }

    // 5. ประกอบ URL พ่วงพารามิเตอร์ยิงส่งต่อไปให้เว็บหลัก
    let finalUrl = link.originalUrl + (link.parameter || '');
    if (targetChannel !== 'organic/direct') {
      const joinChar = finalUrl.includes('?') ? '&' : '?';
      finalUrl = `${finalUrl}${joinChar}src=${targetChannel}`;
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