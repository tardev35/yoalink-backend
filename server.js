require('dotenv').config();
const express = require('express');
const cors = require('cors');
const sequelize = require('./db');

// นำเข้าตัวแปรฐานข้อมูล (Models)
const User = require('./models/User');
const Link = require('./models/Link');
const Domain = require('./models/Domain');

const app = express();

app.use(cors());
app.use(express.json());

// 🔌 เชื่อมต่อ API เส้นทางต่างๆ
app.use('/api/auth', require('./routes/auth'));
app.use('/api/links', require('./routes/links'));
app.use('/api/domains', require('./routes/domains'));
app.use('/api/admin', require('./routes/admin')); // เส้นทางแอดมินยกล็อต

// 🚀 ระบบ Redirect ลิงก์ย่อ (ดักจับคนคลิกลิงก์) - ต้องอยู่ล่างสุดก่อนพอร์ตฟังระบบ
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
sequelize.sync({ alter: true }).then(() => {
  console.log('📦 Database Tables Synced Successfully!');
  app.listen(PORT, () => {
    console.log(`🚀 Yoalink Core Backend running on port ${PORT}`);
  });
}).catch(err => {
  console.error('❌ Failed to sync database:', err);
});