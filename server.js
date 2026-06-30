require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sequelize = require('./db');

// นำเข้าตัวแปรฐานข้อมูล (Models) เพื่อซิงก์ตาราง
const User = require('./models/User');
const Link = require('./models/Link');
const Domain = require('./models/Domain');

const app = express();

// ตั้งค่าปูพื้นฐานระบบ
app.use(cors());
app.use(express.json());

// 🔌 เชื่อมต่อ API เส้นทางต่างๆ ของระบบ Yoalink
app.use('/api/auth', require('./routes/auth'));
app.use('/api/links', require('./routes/links'));
app.use('/api/domains', require('./routes/domains'));
app.use('/api/admin', require('./routes/admin')); // เส้นทางผู้ดูแลระบบ CRUD สมาชิก

// 🚀 🔥 [จุดแก้ไขแก้บั๊กกดเข้าลิงก์ไม่ได้]: ฟังก์ชันดักจับลิงก์ย่อเพื่อประกอบร่างทำ Redirect (ต้องอยู่ก่อนพอร์ตฟังระบบ)
app.get('/:alias', async (req, res) => {
  try {
    const { alias } = req.params;
    
    // ค้นหาพิกัดลิงก์ในระบบด้วยชื่อย่อ (พิมพ์เล็ก)
    const link = await Link.findOne({ where: { alias: alias.toLowerCase() } });
    
    if (!link) {
      // แจ้งเตือนสไตล์คลีนๆ เมื่อไม่พบลิงก์ในระบบ
      return res.status(404).send(
        `<div style="text-align:center; margin-top:100px; font-family:sans-serif;">
          <h1 style="color:#EB568E; font-size:48px;">❌ 404 Not Found</h1>
          <p style="color:#C9CED6; font-size:18px;">ไม่พบลิงก์ย่อนี้ในระบบ Yoalink.com หรือลิงก์อาจถูกลบไปแล้ว</p>
         </div>`
      );
    }

    // อัปเดตยอดสถิติการคลิกเพิ่มขึ้นทีละ 1
    link.clicks += 1;
    await link.save();

    // 🎯 ประกอบร่างคืนชีพ URL: เอาโครงสร้างหลักมาผูกต่อพารามิเตอร์ (?action=register...)
    const finalUrl = link.originalUrl + (link.parameter || '');
    
    // วาร์ปเบราว์เซอร์ผู้ใช้งานพุ่งตรงไปยังเป้าหมายทันที!
    res.redirect(finalUrl);
  } catch (error) {
    console.error('Redirect Error:', error);
    res.status(500).send('<h1 style="text-align:center; margin-top:100px;">🛠️ 500 Internal Server Error</h1>');
  }
});

// 📦 สั่งซิงก์โครงสร้างตารางเข้าฐานข้อมูล SQLite และสั่งรันเซิร์ฟเวอร์
const PORT = 5000;
sequelize.sync({ alter: true }).then(() => {
  console.log('📦 Database Tables Synced Successfully!');
  app.listen(PORT, () => {
    console.log(`🚀 Yoalink Core Backend running on port ${PORT}`);
  });
}).catch(err => {
  console.error('❌ Failed to sync database:', err);
});