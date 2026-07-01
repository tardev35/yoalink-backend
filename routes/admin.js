/* backend/routes/admin.js */
const express = require('express');
const User = require('../models/User');
const Domain = require('../models/Domain');
const Link = require('../models/Link');
const AuditLog = require('../models/AuditLog'); // 🔥 นำเข้าระบบบันทึกประวัติ
const auth = require('../middleware/auth');
const router = express.Router();

// 🛡️ Middleware ด่านตรวจ: เฉพาะ Admin
const isAdmin = async (req, res, next) => {
  try {
    const user = await User.findByPk(req.user.id);
    if (user.role !== 'admin') return res.status(403).json({ message: 'Access Denied: Admin only' });
    next();
  } catch (error) { res.status(500).json({ message: 'Server Error' }); }
};

// ==========================================
// 👥 1. จัดการสมาชิก (USERS)
// ==========================================
router.get('/users', [auth, isAdmin], async (req, res) => {
  try { const users = await User.findAll({ attributes: { exclude: ['password'] } }); res.json(users); } 
  catch (error) { res.status(500).json({ message: 'Error fetching users' }); }
});

router.put('/users/:id/role', [auth, isAdmin], async (req, res) => {
  try {
    const user = await User.findByPk(req.params.id);
    if (!user) return res.status(404).json({ message: 'ไม่พบผู้ใช้งาน' });
    
    const oldRole = user.role;
    user.role = req.body.role;
    await user.save();

    // 🕵️‍♂️ แอบบันทึกประวัติการเปลี่ยนสิทธิ์
    await AuditLog.create({
      userId: req.user.id,
      action: 'UPDATE_ROLE',
      details: { targetUser: user.username, fromRole: oldRole, toRole: user.role }
    });

    res.json({ message: 'อัปเดตสิทธิ์สำเร็จ', user });
  } catch (error) { res.status(500).json({ message: 'Error updating role' }); }
});

router.delete('/users/:id', [auth, isAdmin], async (req, res) => {
  try {
    const userToDel = await User.findByPk(req.params.id);
    if(userToDel) {
      // 🕵️‍♂️ แอบบันทึกประวัติการลบพนักงาน
      await AuditLog.create({
        userId: req.user.id, action: 'DELETE_USER', details: { deletedUser: userToDel.username }
      });
      await userToDel.destroy();
    }
    res.json({ message: 'ลบสมาชิกสำเร็จ' });
  } catch (error) { res.status(500).json({ message: 'Error deleting user' }); }
});

// ==========================================
// 🌐 2. จัดการโดเมนหลัก (ROOT DOMAINS)
// ==========================================
router.get('/domains', [auth, isAdmin], async (req, res) => {
  try { const domains = await Domain.findAll(); res.json(domains); } 
  catch (error) { res.status(500).json({ message: 'Error fetching domains' }); }
});

router.post('/domains', [auth, isAdmin], async (req, res) => {
  try {
    const { name } = req.body;
    const exist = await Domain.findOne({ where: { name } });
    if (exist) return res.status(400).json({ message: 'โดเมนนี้มีอยู่ในระบบแล้ว' });
    
    const newDomain = await Domain.create({ name, createdBy: req.user.id });

    // 🕵️‍♂️ แอบบันทึกประวัติการเพิ่มโดเมน
    await AuditLog.create({
      userId: req.user.id, action: 'CREATE_DOMAIN', details: { domain: name }
    });

    res.status(201).json(newDomain);
  } catch (error) { res.status(500).json({ message: 'Error creating domain' }); }
});

// 🔥 อัปเกรด V3 (Background Task) + 🛡️ Audit Log
router.put('/domains/:id', [auth, isAdmin], async (req, res) => {
  try {
    const domain = await Domain.findByPk(req.params.id);
    if (!domain) return res.status(404).json({ message: 'ไม่พบโดเมน' });

    const newDomainName = req.body.name.trim();

    if (domain.name !== newDomainName) {
      const oldDomainName = domain.name; // เก็บชื่อเก่าไว้ทำ Log
      domain.name = newDomainName;
      await domain.save(); 

      // 🕵️‍♂️ แอบบันทึกประวัติการแก้โดเมน (สำคัญมาก!)
      await AuditLog.create({
        userId: req.user.id,
        action: 'UPDATE_DOMAIN',
        details: { fromDomain: oldDomainName, toDomain: newDomainName }
      });

      res.json({ message: 'อัปเดตชื่อโดเมนสำเร็จ! ระบบกำลังทยอยอัปเดต URL ปลายทางทั้งหมดอยู่เบื้องหลัง...' });
      updateLinksInBackground(domain.id, newDomainName).catch(err => console.error('BG Error:', err));
    } else {
      res.json({ message: 'ไม่มีการเปลี่ยนแปลงชื่อโดเมน' });
    }
  } catch (error) { res.status(500).json({ message: 'Error updating domain' }); }
});

router.delete('/domains/:id', [auth, isAdmin], async (req, res) => {
  try {
    const domainToDel = await Domain.findByPk(req.params.id);
    if(domainToDel) {
      // 🕵️‍♂️ แอบบันทึกประวัติการลบโดเมน
      await AuditLog.create({
        userId: req.user.id, action: 'DELETE_DOMAIN', details: { domain: domainToDel.name }
      });
      await domainToDel.destroy();
    }
    res.json({ message: 'ลบโดเมนสำเร็จ' });
  } catch (error) { res.status(500).json({ message: 'Error deleting domain' }); }
});

// ==========================================
// 👷 ฟังก์ชันกรรมกร: วิ่งทำงานเบื้องหลังเงียบๆ
// ==========================================
async function updateLinksInBackground(domainId, newDomainName) {
  console.log(`⏳ เริ่มกระบวนการแก้ไข URL ทุกลิงก์ไปที่โดเมน: ${newDomainName}`);
  const links = await Link.findAll({ where: { domainId: domainId } });
  let successCount = 0;
  for (let link of links) {
    if (link.originalUrl) {
      try {
        const urlObj = new URL(link.originalUrl);
        urlObj.hostname = newDomainName; 
        link.originalUrl = urlObj.toString(); 
        await link.save();
        successCount++;
      } catch (err) {
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
    links.forEach(l => { if (l.tags && Array.isArray(l.tags)) l.tags.forEach(t => allTags.add(t)); });
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
        link.changed('tags', true); await link.save();
      }
    }
    // 🕵️‍♂️ แอบบันทึกประวัติการเปลี่ยนชื่อแท็กส่วนกลาง
    await AuditLog.create({ userId: req.user.id, action: 'RENAME_TAG', details: { oldTag, newTag } });
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
        link.changed('tags', true); await link.save();
      }
    }
    // 🕵️‍♂️ แอบบันทึกประวัติการลบแท็กส่วนกลาง
    await AuditLog.create({ userId: req.user.id, action: 'DELETE_TAG', details: { tag } });
    res.json({ message: 'ลบแท็กสำเร็จ' });
  } catch (error) { res.status(500).json({ message: 'Error deleting tag' }); }
});

// ==========================================
// 🕵️‍♂️ 4. โหลดประวัติการเคลื่อนไหว (Audit Logs) สำหรับแอดมิน
// ==========================================
router.get('/logs', [auth, isAdmin], async (req, res) => {
  try {
    const logs = await AuditLog.findAll({
      include: [{ model: User, attributes: ['username'] }],
      order: [['createdAt', 'DESC']], // เอาล่าสุดขึ้นก่อน
      limit: 100 // ดึงแค่ 100 รายการล่าสุด ป้องกันหน้าเว็บอืด
    });
    res.json(logs);
  } catch (error) { 
    console.error('Fetch Logs Error:', error);
    res.status(500).json({ message: 'Error fetching logs' }); 
  }
});

module.exports = router;