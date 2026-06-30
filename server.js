const express = require('express');
const cors = require('cors');
require('dotenv').config();

// นำเข้าฐานข้อมูลและ Models
const sequelize = require('./db');
require('./models/User');
const Domain = require('./models/Domain');
const Link = require('./models/Link');

// นำเข้า Routes
const authRoutes = require('./routes/auth');
const linkRoutes = require('./routes/links');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ซิงก์ฐานข้อมูล SQLite
sequelize.authenticate()
  .then(() => {
    console.log('✅ SQLite Connected!');
    return sequelize.sync({ alter: true });
  })
  .then(() => console.log('📦 Database Tables Synced Successfully!'))
  .catch((err) => console.error('❌ Database Error:', err));

// ลงทะเบียน API
app.use('/api/auth', authRoutes);
app.use('/api/links', linkRoutes);

// API โดเมนสำหรับแท็บ Bulk Edit
const auth = require('./middleware/auth');
app.get('/api/domains', auth, async (req, res) => {
  const domains = await Domain.findAll({ where: { createdBy: req.user.id } });
  res.json(domains);
});
app.put('/api/domains/:id', auth, async (req, res) => {
  const domain = await Domain.findOne({ where: { id: req.params.id, createdBy: req.user.id } });
  if (!domain) return res.status(404).json({ message: 'ไม่พบโดเมน' });
  domain.name = req.body.name;
  await domain.save();
  res.json({ message: 'อัปเดต Root Domain สำเร็จ ลิงก์ย่อลูกๆ สลับตามทั้งหมด!', domain });
});

// ⚠️ Redirect Engine ร่างทอง (แกะและประกอบลิงก์กลับไปหาเว็บปลายทาง)
app.get('/:alias', async (req, res) => {
  try {
    const { alias } = req.params;
    const link = await Link.findOne({
      where: { alias },
      include: [Domain]
    });

    if (link) {
      link.clicks += 1;
      await link.save();

      // ดึงชื่อโดเมนหลักปัจจุบันจากตาราง Domain มาประกอบร่าง
      // เพื่อให้เวลาเราเปลี่ยน Root Domain ลิงก์นี้จะวิ่งไปโดเมนใหม่ทันที!
      const currentDomain = link.Domain ? link.Domain.name : '';
      
      // หา Path เดิมที่ตัดโดเมนออก (เช่น /register1)
      const urlObj = new URL(link.originalUrl);
      const urlPath = urlObj.pathname;

      // ประกอบร่าง: โดเมนใหม่ + Path เดิม + Parameter เดิมที่เซฟไว้
      let finalRedirectUrl = `${currentDomain}${urlPath}${link.parameter || ''}`;
      
      // ตรวจสอบชัวร์ๆ ว่ามีโปรโตคอลนำหน้า
      if (!/^https?:\/\//i.test(finalRedirectUrl)) {
        finalRedirectUrl = 'https://' + finalRedirectUrl;
      }

      return res.redirect(finalRedirectUrl);
    }

    return res.status(404).send(`
      <div style="background:#0B101B;color:#C9CED6;font-family:sans-serif;text-align:center;padding:100px;min-height:100vh;margin:0;">
        <h1 style="color:#EB568E;font-size:48px;margin-bottom:10px;">404 Not Found</h1>
        <p style="font-size:18px;">ไม่พบชื่อย่อ <b>/${alias}</b> ในระบบ TeamLinks Pro</p>
      </div>
    `);
  } catch (error) {
    res.status(500).send('Server Error');
  }
});

app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));