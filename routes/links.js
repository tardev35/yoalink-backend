const express = require('express');
const { Op } = require('sequelize');
const sequelize = require('../db'); 
const Link = require('../models/Link');
const Domain = require('../models/Domain');
const auth = require('../middleware/auth');
const router = express.Router();

// 🟢 1. API: สร้างลิงก์ย่อ (หั่น URL + สุ่ม Alias อัตโนมัติ + แก้บั๊ก 500 โดเมนชนกัน)
router.post('/', auth, async (req, res) => {
  try {
    let { originalUrl, alias, tags } = req.body;

    // 🎲 ฟังก์ชันสุ่มตัวอักษร 4 ตัว [a-z, 0-9]
    const generateRandomAlias = () => {
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    // 🔥 ตรวจสอบสิทธิ์ Alias (ถ้าว่างให้สุ่มออโต้ / ถ้าระบุมาต้องไม่ซ้ำ)
    if (!alias || alias.trim() === '') {
      let isUnique = false;
      let randomAlias = '';
      while (!isUnique) {
        randomAlias = generateRandomAlias();
        const checkExist = await Link.findOne({ where: { alias: randomAlias } });
        if (!checkExist) isUnique = true;
      }
      alias = randomAlias;
    } else {
      const existingAlias = await Link.findOne({ where: { alias: alias.toLowerCase() } });
      if (existingAlias) {
        return res.status(400).json({ message: 'ชื่อ Alias นี้มีคนใช้งานแล้ว กรุณาเปลี่ยนใหม่' });
      }
    }

    // เติมโปรโตคอลหากลืมพิมพ์
    if (!/^https?:\/\//i.test(originalUrl)) {
      originalUrl = 'https://' + originalUrl;
    }

    // 🛠️ แยกโครงสร้าง URL อัจฉริยะ
    const urlObj = new URL(originalUrl);
    const rootDomain = urlObj.hostname;        // ดึงเฉพาะโดเมน เช่น pigauto99.info
    const parameter = urlObj.search;           // ดึงเฉพาะ ?action=register...
    const baseUrl = originalUrl.split('?')[0]; // ลิงก์หลักแบบตัดพารามิเตอร์ออก

    // 🌐 🔥 [จุดแก้ไขแก้บั๊ก 500]: เช็กโดเมนระดับ Global ไม่ล็อก ID คนสร้าง เพื่อป้องกัน Data ซ้ำซ้อน
    let domainRecord = await Domain.findOne({ where: { name: rootDomain } });
    if (!domainRecord) {
      domainRecord = await Domain.create({ name: rootDomain, createdBy: req.user.id });
    }

    // แปลง Tag จาก String คั่นคอมมา เป็น Array
    const tagsArray = tags ? tags.split(',').map(tag => tag.trim()).filter(tag => tag) : [];

    // บันทึกลงฐานข้อมูล บังคับ Alias เป็นตัวพิมพ์เล็กเสมอกันพัง
    const newLink = await Link.create({
      alias: alias.toLowerCase(),
      originalUrl: baseUrl, 
      parameter: parameter, 
      tags: tagsArray,
      domainId: domainRecord.id,
      createdBy: req.user.id
    });

    res.status(201).json(newLink);
  } catch (error) {
    console.error('Create Link Error:', error);
    res.status(500).json({ message: 'รูปแบบ URL ไม่ถูกต้อง หรือเซิร์ฟเวอร์เกิดข้อผิดพลาด' });
  }
});

// 🔵 2. API: ดึงรายการลิงก์ทั้งหมด (Pagination + ค้นหา SQLite JSON Array แท็ก)
router.get('/', auth, async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', tag = '' } = req.query;
    const offset = (page - 1) * limit;

    let whereClause = { createdBy: req.user.id };

    if (search) {
      whereClause = {
        ...whereClause,
        [Op.or]: [
          { alias: { [Op.like]: `%${search}%` } },
          { originalUrl: { [Op.like]: `%${search}%` } }
        ]
      };
    }

    // ค้นหาเจาะลึกข้างในอาร์เรย์ JSON ของ SQLite ด้วยฟังก์ชัน json_each
    if (tag) {
      whereClause = {
        ...whereClause,
        [Op.and]: sequelize.literal(
          `EXISTS (SELECT 1 FROM json_each(Link.tags) WHERE json_each.value = '${tag.trim()}')`
        )
      };
    }

    const { count, rows } = await Link.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      include: [Domain],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      totalItems: count,
      totalPages: Math.ceil(count / limit),
      currentPage: parseInt(page),
      links: rows
    });
  } catch (error) {
    console.error('Fetch Links Error:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลจากเซิร์ฟเวอร์' });
  }
});

// 🔴 3. API: ลบลิงก์
router.delete('/:id', auth, async (req, res) => {
  try {
    const link = await Link.findOne({ where: { id: req.params.id, createdBy: req.user.id } });
    if (!link) {
      return res.status(404).json({ message: 'ไม่พบลิงก์ที่คุณต้องการลบ หรือสิทธิ์ไม่ถูกต้อง' });
    }
    
    await link.destroy();
    res.json({ message: 'ลบลิงก์ออกจากระบบเรียบร้อยแล้ว' });
  } catch (error) {
    console.error('Delete Link Error:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการลบข้อมูล' });
  }
});

module.exports = router;