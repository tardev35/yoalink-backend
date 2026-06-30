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

// ➕ เทสและรีวิวเพิ่มฟังก์ชัน: รองรับการสร้างโดเมนใหม่ตรงจากปุ่มเขียวหน้าบ้าน
router.post('/domains', [auth, isAdmin], async (req, res) => {
  try {
    const { name } = req.body;
    const exist = await Domain.findOne({ where: { name } });
    if (exist) return res.status(400).json({ message: 'โดเมนนี้มีอยู่ในระบบแล้ว' });
    
    const newDomain = await Domain.create({ name, createdBy: req.user.id });
    res.status(201).json(newDomain);
  } catch (error) { res.status(500).json({ message: 'Error creating domain' }); }
});

router.put('/domains/:id', [auth, isAdmin], async (req, res) => {
  try {
    const domain = await Domain.findByPk(req.params.id);
    if (!domain) return res.status(404).json({ message: 'ไม่พบโดเมน' });
    domain.name = req.body.name;
    await domain.save(); 
    res.json({ message: 'อัปเดตโดเมนสำเร็จ' });
  } catch (error) { res.status(500).json({ message: 'Error updating domain' }); }
});

router.delete('/domains/:id', [auth, isAdmin], async (req, res) => {
  try {
    await Domain.destroy({ where: { id: req.params.id } });
    res.json({ message: 'ลบโดเมนสำเร็จ' });
  } catch (error) { res.status(500).json({ message: 'Error deleting domain' }); }
});

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