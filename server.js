/* backend/server.js */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sequelize = require('./db');

// 📦 1. นำเข้าตารางฐานข้อมูลทั้งหมดเข้ามาในระบบก่อน (โหลดให้ครบก่อนเรียกใช้งาน)
const User = require('./models/User');
const Link = require('./models/Link');
const Domain = require('./models/Domain');
const LinkChannelStat = require('./models/LinkChannelStat'); 

// 🤝 2. ประกาศผูกความสัมพันธ์ระหว่างตาราง (Associations) หลังจากโหลดมาครบแล้ว
Link.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(Link, { foreignKey: 'userId' });
Link.belongsTo(Domain, { foreignKey: 'domainId' });
Domain.hasMany(Link, { foreignKey: 'domainId' });

// 🔥 ผูกความสัมพันธ์ตารางสถิติช่องทางมาร์เก็ตติ้ง (Module 1)
Link.hasMany(LinkChannelStat, { foreignKey: 'linkId', onDelete: 'CASCADE' });
LinkChannelStat.belongsTo(Link, { foreignKey: 'linkId' });

const app = express();

// 🛡️ [SECURITY ZONE] เสื้อเกราะป้องกัน API
app.use(helmet()); 
app.disable('x-powered-by'); 

// กฎเหล็กดักบอทยิงรัว
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 150, 
  message: { message: '🛑 ยิงคำสั่งถี่เกินไปแล้วลูกพี่! กรุณารอ 15 นาทีค่อยลองใหม่นะ' },
  standardHeaders: true, 
  legacyHeaders: false, 
});

app.use(cors());
app.use(express.json());

// เชื่อมต่อระบบรักษาความปลอดภัยคุมพื้นที่ API
app.use('/api/', apiLimiter); 
app.use('/api/auth', require('./routes/auth'));
app.use('/api/links', require('./routes/links'));
app.use('/api/domains', require('./routes/domains'));
app.use('/api/admin', require('./routes/admin'));

// 🚀 ระบบ Redirect ลิงก์ย่อ + ดักจับพารามิเตอร์การตลาด (?src=xx)
app.get('/:alias', async (req, res) => {
  try {
    const { alias } = req.params;
    const link = await Link.findOne({ where: { alias: alias.toLowerCase() } });
    
    if (!link) {
      return res.status(404).send(
        `<div style="text-align:center; margin-top:100px; font-family:sans-serif;">
          <h1 style="color:#EB568E; font-size:48px;">❌ 404 Not Found</h1>
          <p style="color:#C9CED6; font-size:18px;">ไม่พบลิงก์ย่อนี้ในระบบ Yoalink.com หรือลิงก์อาจถูกลบไปแล้ว</p>
         </div>`
      );
    }

    // 1. บวกยอดคลิกรวมของลิงก์
    link.clicks += 1;
    await link.save();

    // 2. แกะรอยพารามิเตอร์คัดแยกช่องทางมาร์เก็ตติ้ง
    let rawSrc = (req.query.src || '').toLowerCase().trim();
    let targetChannel = 'organic/direct'; 

    if (rawSrc === 'facebook' || rawSrc === 'fb') targetChannel = 'facebook';
    else if (rawSrc === 'tiktok' || rawSrc === 'tt') targetChannel = 'tiktok';
    else if (rawSrc === 'line') targetChannel = 'line';
    else if (rawSrc === 'sms') targetChannel = 'sms';
    else if (rawSrc === 'seo') targetChannel = 'seo';

    // บันทึกลงฐานข้อมูลสถิติช่องทาง
    const [statRecord, created] = await LinkChannelStat.findOrCreate({
      where: { linkId: link.id, channel: targetChannel },
      defaults: { clicks: 1 }
    });

    if (!created) {
      statRecord.clicks += 1;
      await statRecord.save();
    }

    // 3. ประกอบ URL ปลายทางพ่วงพารามิเตอร์ยิงส่งต่อไปให้เว็บหลัก
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