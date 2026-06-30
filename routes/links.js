/* backend/routes/links.js */
const express = require('express');
const { Op } = require('sequelize');
const Link = require('../models/Link');
const Domain = require('../models/Domain');
const User = require('../models/User'); // 🔥 ดึง Model User มาร่วมใช้งาน
const auth = require('../middleware/auth');
const router = express.Router();

// 📋 GET: ดึงรายการลิงก์ย่อทั้งหมด (กรองตามสิทธิ์การใช้งาน)
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { search, tag } = req.query;

    // 👑 เงื่อนไขแอดมินร่างทอง: ถ้าไม่ใช่ Admin ให้เห็นแค่ลิงก์ของตัวเอง (userId) แต่ถ้าเป็น Admin จะดึงทั้งหมด!
    let whereClause = {};
    if (req.user.role !== 'admin') {
      whereClause.userId = req.user.id;
    }

    // 🔍 ระบบค้นหาอัจฉริยะ (ค้นหาจากชื่อย่อ หรือ URL จริง)
    if (search) {
      whereClause[Op.or] = [
        { alias: { [Op.like]: `%${search}%` } },
        { originalUrl: { [Op.like]: `%${search}%` } }
      ];
    }

    // 🏷️ ระบบกรองข้อมูลด่วนผ่านแท็ก
    if (tag) {
      whereClause.tags = { [Op.like]: `%"${tag}"%` }; 
    }

    // ดึงข้อมูลพร้อมหาจำนวนหน้าตาราง
    const { count, rows } = await Link.findAndCountAll({
      where: whereClause,
      include: [
        { model: Domain, attributes: ['name'] },
        { model: User, attributes: ['username'] } // 🔥 รวมข้อมูลเพื่อดึงชื่อผู้สร้างมาโชว์ให้แอดมินเห็น
      ],
      limit,
      offset,
      order: [['createdAt', 'DESC']] // เอาลิงก์สร้างใหม่ขึ้นก่อนเสมอ
    });

    res.json({
      links: rows,
      totalPages: Math.ceil(count / limit),
      currentPage: page
    });
  } catch (error) {
    console.error('Fetch Links Backend Error:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลลิงก์' });
  }
});

module.exports = router;