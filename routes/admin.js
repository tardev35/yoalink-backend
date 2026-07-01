/* backend/routes/admin.js */
const express = require('express');
const User = require('../models/User');
const Domain = require('../models/Domain');
const Link = require('../models/Link');
const auth = require('../middleware/auth');
const router = express.Router();

// 🛡️ Middleware ด่านตรวจ: เฉพาะ Admin
const isAdmin = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (user.role !== 'admin') return res.status(403).json({ message: 'Access Denied: Admin only' });
    next();
  } catch (error) { 
    res.status(500).json({ message: 'Server Error' }); 
  }
};

// ==========================================
// 👥 1. จัดการสมาชิก (USERS)
// ==========================================
router.get('/users', [auth, isAdmin], async (req, res) => {
  try {
    const users = await User.findAll({ attributes: { exclude: ['password'] } });
    res.json(users);
  } catch (error) { res.status(500).json({ message: 'Error fetching users' }); }
});

router.put('/users/:id/role', [auth, isAdmin], async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'ไม่พบผู้ใช้งาน' });
    user.role = req.body.role;
    await user.save();
    res.json({ message: 'อัปเดตสิทธิ์สำเร็จ', user });
  } catch (error) { res.status(500).json({ message: 'Error updating role' }); }
});

router.delete('/users/:id', [auth, isAdmin], async (req, res) => {
  try {
    await User.destroy({ where: { id: req.params.id } });
    res.json({ message: 'ลบสมาชิกสำเร็จ' });
  } catch (error) { res.status(500).json({ message: 'Error deleting user' }); }
});

// ==========================================
// 🌐 2. จัดการโดเมนหลัก (ROOT DOMAINS)
// ==========================================
router.get('/domains', [auth, isAdmin], async (req, res) => {
  try {
    const domains = await Domain.findAll();
    res.json(domains);
  } catch (error) { res.status(500).json({ message: 'Error fetching domains' }); }
});

router.post('/domains', [auth, isAdmin], async (req, res) => {
  try {
    const { name } = req.body;
    const exist = await Domain.findOne({ where: { name } });
    if (exist) return res.status(400).json({ message: 'โดเมนนี้มีอยู่ในระบบแล้ว' });
    
    const newDomain = await Domain.create({ name, createdBy: req.user.id });
    res.status(201).json(newDomain);
  } catch (error) { res.status(500).json({ message: 'Error creating domain' }); }
});

// 🔥 อัปเกรด V3 (Background Task): ไม่ต้องรอหน้าเว็บค้าง! แก้ไขโดเมนปุ๊บ สั่งอัปเดต 1,000 ลิงก์เบื้องหลัง
router.put('/domains/:id', [auth, isAdmin], async (req, res) => {
  try {
    const domain = await Domain.findByPk(req.params.id);
    if (!domain) return res.status(404).json({ message: 'ไม่พบโดเมน' });

    const newDomainName = req.body.name.trim();

    // ทำงานเมื่อมีการเปลี่ยนชื่อโดเมนจริงๆ เท่านั้น
    if (domain.name !== newDomainName) {
      domain.name = newDomainName;
      await domain.save(); 

      // 🚀 ตอบกลับหน้าเว็บทันที! แอดมินจะได้ไม่ต้องรอให้ลูปรันครบ 1,000 รอบ
      res.json({ message: 'อัปเดตชื่อโดเมนสำเร็จ! ระบบกำลังทยอยอัปเดต URL ปลายทางทั้งหมดอยู่เบื้องหลัง...' });

      // 🛠️ ปล่อยให้ Node.js แอบไปวิ่งทำงานเบื้องหลัง (ไม่ใส่คำว่า await ข้างหน้าฟังก์ชัน)
      updateLinksInBackground(domain.id, newDomainName).catch(err => console.error('BG Error:', err));

    } else {
      res.json({ message: 'ไม่มีการเปลี่ยนแปลงชื่อโดเมน' });
    }

  } catch (error) { 
    console.error('Update Domain Error:', error);
    res.status(500).json({ message: 'Error updating domain' }); 
  }
});

router.delete('/domains/:id', [auth, isAdmin], async (req, res) => {
  try {
    await Domain.destroy({ where: { id: req.params.id } });
    res.json({ message: 'ลบโดเมนสำเร็จ' });
  } catch (error) { res.status(500).json({ message: 'Error deleting domain' }); }
});

// ==========================================
// 👷 ฟังก์ชันกรรมกร: วิ่งทำงานเบื้องหลังเงียบๆ (Background Worker)
// ==========================================
async function updateLinksInBackground(domainId, newDomainName) {
  console.log(`⏳ เริ่มกระบวนการแก้ไข URL ทุกลิงก์ไปที่โดเมน: ${newDomainName}`);
  
  const links = await Link.findAll({ where: { domainId: domainId } });
  
  let successCount = 0;
  for (let link of links) {
    if (link.originalUrl) {
      try {
        // ใช้คลาส URL ของ Node.js เพื่อถอดชิ้นส่วนลิงก์ แล้วบังคับเปลี่ยนชื่อเว็บ (Hostname)
        const urlObj = new URL(link.originalUrl);
        urlObj.hostname = newDomainName; 
        link.originalUrl = urlObj.toString(); 
        await link.save();
        successCount++;
      } catch (err) {
        // สำรองฉุกเฉินถ้า URL ผิดฟอร์แมต
        link.originalUrl = link.originalUrl.replace(/https?:\/\/[^\/]+/i, `https://${newDomainName}`);
        await link.save();
        successCount++;
      }
    }
  }
  
  console.log(`✅ อัปเดตเบื้องหลังเสร็จสมบูรณ์! แก้ไขลิงก์ไปทั้งหมด ${successCount} รายการ`);
}

// ==========================================
// 🏷️ 3. จัดการแท็ก (TAGS)
// ==========================================
router.get('/tags', [auth, isAdmin], async (req, res) => {
  try {
    const links = await Link.findAll({ attributes: ['tags'] });
    let allTags = new Set();
    links.forEach(l => {
      if (l.tags && Array.isArray(l.tags)) l.tags.forEach(t => allTags.add(t));
    });
    res.json(Array.from(allTags));
  } catch (error) { res.status(500).json({ message: 'Error fetching tags' }); }
});

router.put('/tags', [auth, isAdmin], async (req, res) => {
  try {
    const { oldTag, newTag } = req.body;
    const links = await Link.findAll();
    for (let link of links) {
      if (link.tags && link.tags.includes(oldTag)) {
        link.tags = link.tags.map(t => t === oldTag ? newTag : t);
        link.changed('tags', true); 
        await link.save();
      }
    }
    res.json({ message: 'เปลี่ยนชื่อแท็กสำเร็จ' });
  } catch (error) { res.status(500).json({ message: 'Error renaming tag' }); }
});

router.delete('/tags', [auth, isAdmin], async (req, res) => {
  try {
    const { tag } = req.body;
    const links = await Link.findAll();
    for (let link of links) {
      if (link.tags && link.tags.includes(tag)) {
        link.tags = link.tags.filter(t => t !== tag);
        link.changed('tags', true);
        await link.save();
      }
    }
    res.json({ message: 'ลบแท็กสำเร็จ' });
  } catch (error) { res.status(500).json({ message: 'Error deleting tag' }); }
});

module.exports = router;