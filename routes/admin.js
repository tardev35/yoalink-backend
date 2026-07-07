/* backend/routes/admin.js */
const express = require('express');
const User = require('../models/User');
const Domain = require('../models/Domain');
const Link = require('../models/Link');
const AuditLog = require('../models/AuditLog'); 
const createAuditLog = require('../utils/logger'); // 🔥 เรียกใช้ฟังก์ชันสายลับดัก IP
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

    // 🔥 บันทึก IP ตอนเปลี่ยนสิทธิ์
    await createAuditLog(req, 'UPDATE_ROLE', { targetUser: user.username, fromRole: oldRole, toRole: user.role });

    res.json({ message: 'อัปเดตสิทธิ์สำเร็จ', user });
  } catch (error) { res.status(500).json({ message: 'Error updating role' }); }
});

router.delete('/users/:id', [auth, isAdmin], async (req, res) => {
  try {
    const userToDel = await User.findByPk(req.params.id);
    if(userToDel) {
      // 🔥 บันทึก IP ตอนลบพนักงาน
      await createAuditLog(req, 'DELETE_USER', { deletedUser: userToDel.username });
      await userToDel.destroy();
    }
    res.json({ message: 'ลบสมาชิกสำเร็จ' });
  } catch (error) { res.status(500).json({ message: 'Error deleting user' }); }
});

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

    // 🔥 บันทึก IP ตอนสร้างโดเมน
    await createAuditLog(req, 'CREATE_DOMAIN', { domain: name });

    res.status(201).json(newDomain);
  } catch (error) { res.status(500).json({ message: 'Error creating domain' }); }
});

router.post('/domains/migrate', [auth, isAdmin], async (req, res) => {
  try {
    const { fromDomainId, toDomainId } = req.body;
    if (fromDomainId === toDomainId) return res.status(400).json({ message: 'โดเมนเหมือนกัน' });
    const fromDomain = await Domain.findByPk(fromDomainId);
    const toDomain = await Domain.findByPk(toDomainId);
    if (!fromDomain || !toDomain) return res.status(404).json({ message: 'ไม่พบข้อมูลโดเมน' });
    const linksToMigrate = await Link.findAll({ where: { domainId: fromDomain.id } });
    const linkCount = linksToMigrate.length;
    if (linkCount === 0) return res.status(400).json({ message: 'ไม่มีลิงก์ให้ย้าย' });
    
    await Link.update({ domainId: toDomain.id }, { where: { domainId: fromDomain.id } });

    // 🔥 บันทึก IP ตอนย้ายโดเมน
    await createAuditLog(req, 'MIGRATE_DOMAIN', { fromDomain: fromDomain.name, toDomain: toDomain.name, migratedCount: linkCount });

    updateLinksInBackground(toDomain.id, toDomain.name).catch(err => console.error('BG Error:', err));
    res.json({ message: `เริ่มย้าย ${linkCount} ลิงก์สำเร็จ!` });
  } catch (error) { res.status(500).json({ message: 'Error' }); }
});

router.put('/domains/:id', [auth, isAdmin], async (req, res) => {
  try {
    const domain = await Domain.findByPk(req.params.id);
    if (!domain) return res.status(404).json({ message: 'ไม่พบโดเมน' });
    const newDomainName = req.body.name.trim();
    if (domain.name !== newDomainName) {
      const oldDomainName = domain.name;
      domain.name = newDomainName; 
      await domain.save(); 

      // 🔥 บันทึก IP ตอนเปลี่ยนชื่อโดเมน
      await createAuditLog(req, 'UPDATE_DOMAIN', { fromDomain: oldDomainName, toDomain: newDomainName });

      updateLinksInBackground(domain.id, newDomainName).catch(err => console.error('BG Error:', err));
      res.json({ message: 'อัปเดตชื่อโดเมนสำเร็จ!' });
    } else { res.json({ message: 'ไม่มีการเปลี่ยนแปลง' }); }
  } catch (error) { res.status(500).json({ message: 'Error updating domain' }); }
});

router.delete('/domains/:id', [auth, isAdmin], async (req, res) => {
  try {
    const domainToDel = await Domain.findByPk(req.params.id);
    if(domainToDel) {
      // 🔥 บันทึก IP ตอนลบโดเมน
      await createAuditLog(req, 'DELETE_DOMAIN', { domain: domainToDel.name });
      await domainToDel.destroy();
    }
    res.json({ message: 'ลบโดเมนสำเร็จ' });
  } catch (error) { res.status(500).json({ message: 'Error deleting domain' }); }
});

async function updateLinksInBackground(domainId, newDomainName) {
  const links = await Link.findAll({ where: { domainId: domainId } });
  for (let link of links) {
    if (link.originalUrl) {
      try {
        const urlObj = new URL(link.originalUrl); urlObj.hostname = newDomainName; 
        link.originalUrl = urlObj.toString(); await link.save();
      } catch (err) {
        link.originalUrl = link.originalUrl.replace(/https?:\/\/[^\/]+/i, `https://${newDomainName}`);
        await link.save();
      }
    }
  }
}

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
    // 🔥 บันทึก IP ตอนเปลี่ยนชื่อแท็ก
    await createAuditLog(req, 'RENAME_TAG', { oldTag, newTag });
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
    // 🔥 บันทึก IP ตอนลบแท็ก
    await createAuditLog(req, 'DELETE_TAG', { tag });
    res.json({ message: 'ลบแท็กสำเร็จ' });
  } catch (error) { res.status(500).json({ message: 'Error deleting tag' }); }
});

// ==========================================
// 🔗 4. โอนกรรมสิทธิ์ลิงก์ (Change Owner)
// ==========================================
router.put('/links/:id/owner', [auth, isAdmin], async (req, res) => {
  try {
    const { newUserId } = req.body;
    const link = await Link.findByPk(req.params.id);
    if (!link) return res.status(404).json({ message: 'ไม่พบข้อมูลลิงก์ในระบบ' });
    
    link.userId = newUserId;
    link.createdBy = newUserId; 
    await link.save();

    const newUser = await User.findByPk(newUserId);

    // 🔥 บันทึก IP ตอนโอนสิทธิ์ให้พนักงาน
    await createAuditLog(req, 'UPDATE_LINK_OWNER', { alias: link.alias, toUser: newUser ? newUser.username : 'Unknown' });

    res.json({ message: 'โอนกรรมสิทธิ์ลิงก์ให้เจ้าของใหม่สำเร็จ' });
  } catch (error) { 
    console.error('Change Owner Error:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการโอนกรรมสิทธิ์' }); 
  }
});

router.get('/logs', [auth, isAdmin], async (req, res) => {
  try {
    const logs = await AuditLog.findAll({
      include: [{ model: User, attributes: ['username'] }],
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    res.json(logs);
  } catch (error) { 
    console.error('Fetch Logs Error:', error);
    res.status(500).json({ message: 'Error fetching logs' }); 
  }
});

// ==========================================
// 🤝 5. ระบบโอนสิทธิ์ลิงก์ผ่าน Alias แบบกลุ่ม (Batch Transfer) 🔥 ตัวใหม่ล่าสุด
// ==========================================
router.post('/links/transfer-by-alias', [auth, isAdmin], async (req, res) => {
  try {
    const { aliases, newUserId } = req.body;

    if (!aliases || !Array.isArray(aliases) || aliases.length === 0) {
      return res.status(400).json({ message: 'กรุณาระบุรายการ Alias ให้ถูกต้อง' });
    }

    if (!newUserId) {
      return res.status(400).json({ message: 'กรุณาระบุพนักงานปลายทางที่จะรับโอนสิทธิ์' });
    }

    // 🕵️‍♂️ เช็กว่าพนักงานปลายทางมีตัวตนจริงไหม
    const targetUser = await User.findByPk(newUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'ไม่พบพนักงานปลายทางในระบบ' });
    }

    // 🛠️ สั่งอัปเดตทุกลิงก์ที่ตรงกับรายชื่อ Alias ที่ส่งมา
    const [updatedCount] = await Link.update(
      { 
        userId: targetUser.id, 
        createdBy: targetUser.id 
      },
      { 
        where: { alias: aliases } 
      }
    );

    if (updatedCount === 0) {
      return res.status(404).json({ message: 'ไม่พบข้อมูลลิงก์ที่ตรงกับ Alias ที่ระบุในระบบ' });
    }

    // 🔥 บันทึกประวัติสายลับพร้อม IP และสถานที่
    await createAuditLog(req, 'UPDATE_LINK_OWNER_BATCH', {
      aliasesCount: updatedCount,
      toUser: targetUser.username,
      sampleAliases: aliases.slice(0, 5) // เก็บตัวอย่าง Alias 5 ตัวแรกใน Log
    });

    res.json({ 
      message: `โอนกรรมสิทธิ์จำนวน ${updatedCount} ลิงก์ ให้พนักงาน "${targetUser.username}" เรียบร้อยแล้วครับ!` 
    });

  } catch (error) {
    console.error('Batch Transfer Error:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการโอนกรรมสิทธิ์แบบกลุ่ม' });
  }
});

module.exports = router;