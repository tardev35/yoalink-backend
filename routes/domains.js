const express = require('express');
const Domain = require('../models/Domain');
const auth = require('../middleware/auth');
const router = express.Router();

// ดึงโดเมนทั้งหมดมาโชว์ในแท็บจัดการโดเมน
router.get('/', auth, async (req, res) => {
  const domains = await Domain.findAll();
  res.json(domains);
});

// แก้ไข Root Domain (เปลี่ยนทีเดียว ลิงก์ลูกทั้งหมดเปลี่ยนตามทันที!)
router.put('/:id', auth, async (req, res) => {
  try {
    const { name } = req.body;
    const domain = await Domain.findByPk(req.params.id);
    if (!domain) return res.status(404).json({ message: 'ไม่พบโดเมน' });

    domain.name = name;
    await domain.save();

    res.json({ message: 'เปลี่ยน Root Domain สำเร็จ ลิงก์ย่อทั้งหมดถูกอัปเดตแล้ว!', domain });
  } catch (error) {
    res.status(500).json({ message: 'เกิดข้อผิดพลาด' });
  }
});

module.exports = router;