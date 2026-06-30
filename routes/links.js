/* backend/routes/links.js */
const express = require('express');
const { Op } = require('sequelize');
const Link = require('../models/Link');
const Domain = require('../models/Domain');
const User = require('../models/User'); 
const auth = require('../middleware/auth');
const router = express.Router();

// 📋 1. GET: ดึงรายการลิงก์ย่อทั้งหมด (อัปเดตระบบค้นหาแท็ก และช่องค้นหาหลัก)
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const offset = (page - 1) * limit;
    const { search, tag } = req.query;

    let whereClause = {};
    if (req.user.role !== 'admin') {
      whereClause.userId = req.user.id;
    }

    // 🔍 แก้ไขจุดที่ 2: ปรับเพิ่มให้ช่องค้นหาหลัก สามารถพิมพ์คำค้นหาด้วย "ชื่อแท็ก" ได้ด้วย
    if (search) {
      whereClause[Op.or] = [
        { alias: { [Op.like]: `%${search}%` } },
        { originalUrl: { [Op.like]: `%${search}%` } },
        { tags: { [Op.like]: `%${search}%` } } // 🔥 เพิ่มบรรทัดนี้เพื่อให้พิมพ์ค้นหาผ่านแท็กในช่องปกติได้ทันที
      ];
    }

    // 🏷️ แก้ไขจุดที่ 1: ปรับระบบกรองแท็กให้รองรับโครงสร้างสากล (Universal Match) ป้องกันอาการกรองแล้วข้อมูลหาย
    if (tag) {
      whereClause.tags = { [Op.like]: `%${tag}%` }; // 🔥 เปลี่ยนจาก %"${tag}"% เป็น %${tag}% เพื่อให้ค้นหาเจอข้อมูลทุกรูปแบบแน่นอน
    }

    const { count, rows } = await Link.findAndCountAll({
      where: whereClause,
      include: [
        { model: Domain, attributes: ['name'] },
        { model: User, attributes: ['username'] } 
      ],
      distinct: true, 
      limit,
      offset,
      order: [['createdAt', 'DESC']] 
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

// 🚀 2. POST: สร้างลิงก์ย่อใหม่
router.post('/', auth, async (req, res) => {
  try {
    let { originalUrl, alias, tags } = req.body;

    if (!originalUrl) {
      return res.status(400).json({ message: 'กรุณากรอก URL ปลายทาง' });
    }

    if (!originalUrl.startsWith('http://') && !originalUrl.startsWith('https://')) {
      originalUrl = 'https://' + originalUrl;
    }

    try {
      new URL(originalUrl);
    } catch (e) {
      return res.status(400).json({ message: 'รูปแบบ URL ไม่ถูกต้อง' });
    }

    const urlObj = new URL(originalUrl);
    const domainName = urlObj.hostname; 

    let domain = await Domain.findOne({ where: { name: domainName } });
    if (!domain) {
      domain = await Domain.create({ name: domainName, createdBy: req.user.id });
    }

    if (alias) {
      alias = alias.trim().toLowerCase();
      const existing = await Link.findOne({ where: { alias } });
      if (existing) return res.status(400).json({ message: 'ชื่อย่อ (Alias) นี้ถูกใช้งานไปแล้ว' });
    } else {
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let isUnique = false;
      while (!isUnique) {
        alias = '';
        for (let i = 0; i < 4; i++) {
          alias += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const existing = await Link.findOne({ where: { alias } });
        if (!existing) isUnique = true;
      }
    }

    let processedTags = [];
    if (tags) {
      processedTags = tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t !== '');
    }

    const newLink = await Link.create({
      originalUrl,
      alias,
      tags: processedTags,
      userId: req.user.id,      
      createdBy: req.user.id,   
      domainId: domain.id,
      clicks: 0
    });

    const activeLink = await Link.findByPk(newLink.id, {
      include: [
        { model: Domain, attributes: ['name'] },
        { model: User, attributes: ['username'] }
      ]
    });

    res.status(201).json(activeLink);
  } catch (error) {
    console.error('Create Link Error:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการสร้างลิงก์ย่อ' });
  }
});

// 🗑️ 3. DELETE: ลบข้อมูลลิงก์ย่อ
router.delete('/:id', auth, async (req, res) => {
  try {
    let whereClause = { id: req.params.id };
    if (req.user.role !== 'admin') {
      whereClause.userId = req.user.id;
    }
    const deleted = await Link.destroy({ where: whereClause });
    if (!deleted) return res.status(404).json({ message: 'ไม่พบลิงก์ที่ต้องการลบหรือคุณไม่มีสิทธิ์' });
    res.json({ message: 'ลบลิงก์สำเร็จ' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting link' });
  }
});

module.exports = router;