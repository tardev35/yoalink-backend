/* backend/routes/links.js */
const express = require('express');
const { Op } = require('sequelize');
const Link = require('../models/Link');
const Domain = require('../models/Domain');
const User = require('../models/User'); 
const auth = require('../middleware/auth');
const router = express.Router();

// 📋 1. GET: ดึงรายการลิงก์ย่อทั้งหมด (แก้ไขระบบค้นหาและกรองแท็กให้เสถียร 100%)
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

    // 🔍 ปรับปรุงช่องค้นหาหลัก: บังคับให้ค้นหาแท็กแบบข้อความธรรมดาเพื่อป้องกันบั๊ก JSON
    if (search) {
      whereClause[Op.or] = [
        { alias: { [Op.like]: `%${search}%` } },
        { originalUrl: { [Op.like]: `%${search}%` } },
        Link.sequelize.where(Link.sequelize.col('tags'), 'LIKE', `%${search}%`) // 🔥 บังคับสแกนแท็กแบบ Text String
      ];
    }

    // 🏷️ แก้ไขจุดสำคัญ: ปรับระบบกรองแท็กตรงปุ่มกดให้ใช้พลังซิงค์ข้อความธรรมดา เจอข้อมูลชัวร์ 100%
    if (tag) {
      whereClause.tags = Link.sequelize.where(Link.sequelize.col('tags'), 'LIKE', `%${tag}%`); // 🔥 ทลายบั๊ก JSON ค้นหาเจอทุกแท็กแน่นอน
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
/* เพิ่มไว้ใน backend/routes/links.js ก่อนบรรทัด module.exports = router; */
const LinkChannelStat = require('../models/LinkChannelStat');

// 📊 GET: คำนวณเปอร์เซ็นต์สถิติ 5 ช่องทางหลักส่งให้หน้าบ้านทำกราฟวงกลม/กราฟแท่ง
router.get('/:id/channel-stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      const link = await Link.findOne({ where: { id: req.params.id, userId: req.user.id } });
      if (!link) return res.status(403).json({ message: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลลิงก์ชิ้นนี้' });
    }

    // ดึงสถิติช่องทางทั้งหมดของลิงก์นี้
    const channelRows = await LinkChannelStat.findAll({
      where: { linkId: req.params.id }
    });

    // เตรียมโครงสร้าง 5 ช่องทางหลักบังคับแสดงผล (แม้ยังไม่มีคนคลิกก็ให้ขึ้น 0%)
    const defaultChannels = {
      facebook: 0,
      tiktok: 0,
      line: 0,
      sms: 0,
      seo: 0,
      'organic/direct': 0
    };

    let totalChannelClicks = 0;
    channelRows.forEach(r => {
      if (defaultChannels[r.channel] !== undefined) {
        defaultChannels[r.channel] = r.clicks;
        totalChannelClicks += r.clicks;
      }
    });

    // แปลงข้อมูลเป็น Array พร้อมคำนวณสัดส่วน % ให้หน้าบ้านเรนเดอร์แถบสีได้ทันที
    const statsData = Object.keys(defaultChannels).map(ch => {
      const clicks = defaultChannels[ch];
      const percentage = totalChannelClicks > 0 ? Math.round((clicks / totalChannelClicks) * 100) : 0;
      return { channel: ch, clicks, percentage };
    });

    res.json({
      totalChannelClicks,
      stats: statsData
    });
  } catch (error) {
    console.error('Fetch Channel Stats Error:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการคำนวณสถิติช่องทาง' });
  }
});

module.exports = router;