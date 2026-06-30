require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet'); // 🔥 1. นำเข้าเกราะป้องกัน HTTP Header
const rateLimit = require('express-rate-limit'); // 🔥 2. นำเข้าระบบจำกัดคิวดักบอทยิงสแปม
const sequelize = require('./db');

// นำเข้าตัวแปรฐานข้อมูล (Models)
const User = require('./models/User');
const Link = require('./models/Link');
const Domain = require('./models/Domain');

// ประกาศความสัมพันธ์ระหว่างตาราง (Associations)
Link.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(Link, { foreignKey: 'userId' });
Link.belongsTo(Domain, { foreignKey: 'domainId' });
Domain.hasMany(Link, { foreignKey: 'domainId' });

const app = express();

// 🛡️ [SECURITY ZONE] เริ่มตั้งค่าเกราะป้องกันภัยหลังบ้าน
app.use(helmet()); // ป้องกัน XSS, Clickjacking และการแฝงโค้ดอันตรายผ่านเว็บสากล
app.disable('x-powered-by'); // 🔥 3. ซ่อนตัวตน! ปิดไม่ให้แฮกเกอร์รู้ว่าใช้ Express/Node.js เจาะระบบ

// 🔥 4. สร้างกฎเหล็กดักบอทยิงรัว (Rate Limiter) สำหรับพวกหน้า API จัดการข้อมูล
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // กำหนดรอบเวลาทุกๆ 15 นาที
  max: 100, // ใน 15 นาที 1 ตัวเลข IP จะยอมให้กด Login หรือสร้างลิงก์ได้สูงสุด 100 ครั้งเท่านั้น
  message: { message: '🛑 ยิงคำสั่งถี่เกินไปแล้วลูกพี่! ระบบล็อกเพื่อป้องกันแฮกเกอร์ กรุณารอ 15 นาทีค่อยลองใหม่นะ' },
  standardHeaders: true, // ส่งค่าสถิติตอบกลับไปที่ Header
  legacyHeaders: false, // ปิด Header รุ่นเก่า
});

app.use(cors());
app.use(express.json());

// 🔌 เชื่อมต่อ API เส้นทางต่างๆ (พ่วงระบบดักบอทยิงเข้าคุมพื้นที่ /api ทั้งหมด)
app.use('/api/', apiLimiter); 
app.use('/api/auth', require('./routes/auth'));
app.use('/api/links', require('./routes/links'));
app.use('/api/domains', require('./routes/domains'));
app.use('/api/admin', require('./routes/admin'));

// 🚀 ระบบ Redirect ลิงก์ย่อ (เปิดอิสระให้คนคลิกเข้าดูได้ตามปกติ ไม่ติดระบบจำกัดโควตาด้านบน)
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

    link.clicks += 1;
    await link.save();

    const finalUrl = link.originalUrl + (link.parameter || '');
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