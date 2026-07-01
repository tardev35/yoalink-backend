/* backend/routes/links.js */
const express = require('express');
const { Op } = require('sequelize');
const Link = require('../models/Link');
const Domain = require('../models/Domain');
const User = require('../models/User'); 
const auth = require('../middleware/auth');
const router = express.Router();

// 📋 1. GET: ดึงรายการลิงก์ย่อทั้งหมด
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

    if (search) {
      whereClause[Op.or] = [
        { alias: { [Op.like]: `%${search}%` } },
        { originalUrl: { [Op.like]: `%${search}%` } },
        Link.sequelize.where(Link.sequelize.col('tags'), 'LIKE', `%${search}%`)
      ];
    }

    if (tag) {
      whereClause.tags = Link.sequelize.where(Link.sequelize.col('tags'), 'LIKE', `%${tag}%`);
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
      if (existing) {
        return res.status(400).json({ message: 'ชื่อย่อ (Alias) นี้ถูกใช้งานไปแล้ว' });
      }
    } else {
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let isUnique = false;
      while (!isUnique) {
        alias = '';
        for (let i = 0; i < 4; i++) {
          alias += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        const existing = await Link.findOne({ where: { alias } });
        if (!existing) {
          isUnique = true;
        }
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
    if (!deleted) {
      return res.status(404).json({ message: 'ไม่พบลิงก์ที่ต้องการลบหรือคุณไม่มีสิทธิ์' });
    }
    res.json({ message: 'ลบลิงก์สำเร็จ' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting link' });
  }
});

const LinkChannelStat = require('../models/LinkChannelStat');

// 📊 4. GET: ดึงสถิติคัดแยกช่องทางมาร์เก็ตติ้ง (Module 1)
router.get('/:id/channel-stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      const link = await Link.findOne({ where: { id: req.params.id, userId: req.user.id } });
      if (!link) {
        return res.status(403).json({ message: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลลิงก์ชิ้นนี้' });
      }
    }

    const channelRows = await LinkChannelStat.findAll({ where: { linkId: req.params.id } });
    const defaultChannels = { facebook: 0, tiktok: 0, line: 0, sms: 0, seo: 0, 'organic/direct': 0 };
    let totalChannelClicks = 0;

    channelRows.forEach(r => {
      if (defaultChannels[r.channel] !== undefined) {
        defaultChannels[r.channel] = r.clicks;
        totalChannelClicks += r.clicks;
      }
    });

    const statsData = Object.keys(defaultChannels).map(ch => {
      const clicks = defaultChannels[ch];
      const percentage = totalChannelClicks > 0 ? Math.round((clicks / totalChannelClicks) * 100) : 0;
      return { channel: ch, clicks, percentage };
    });

    res.json({ totalChannelClicks, stats: statsData });
  } catch (error) {
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการคำนวณสถิติช่องทาง' });
  }
});

const LinkClickLog = require('../models/LinkClickLog');

// ⏰ 5. GET: ดึงสถิติรายชั่วโมงและรายวันย้อนหลัง (Module 2)
router.get('/:id/time-stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      const link = await Link.findOne({ where: { id: req.params.id, userId: req.user.id } });
      if (!link) {
        return res.status(403).json({ message: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลลิงก์ชิ้นนี้' });
      }
    }

    const clickLogs = await LinkClickLog.findAll({ where: { linkId: req.params.id }, attributes: ['createdAt'], raw: true });
    const hourlyGrid = {};
    for (let i = 0; i < 24; i++) { 
      hourlyGrid[String(i).padStart(2, '0')] = 0; 
    }

    const dailyGrid = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); 
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
      dailyGrid[dateStr] = 0;
    }

    clickLogs.forEach(log => {
      const dateObj = new Date(log.createdAt);
      const hourStr = String(dateObj.getHours()).padStart(2, '0');
      if (hourlyGrid[hourStr] !== undefined) {
        hourlyGrid[hourStr] += 1;
      }

      const dateStr = dateObj.toLocaleDateString('th-TH', { day: '2-digit', month: 'short' });
      if (dailyGrid[dateStr] !== undefined) {
        dailyGrid[dateStr] += 1;
      }
    });

    const hourlyData = Object.keys(hourlyGrid).map(h => ({ hour: `${h}:00`, clicks: hourlyGrid[h] }));
    const dailyData = Object.keys(dailyGrid).map(d => ({ date: d, clicks: dailyGrid[d] }));

    res.json({ hourly: hourlyData, daily: dailyData });
  } catch (error) {
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการคำนวณช่วงเวลาทองคำ' });
  }
});

const LinkClickDevice = require('../models/LinkClickDevice');

// 📱 6. GET: คำนวณเปอร์เซ็นต์อุปกรณ์ส่งให้หน้าบ้านเรนเดอร์กราฟ (Module 3)
router.get('/:id/device-stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      const link = await Link.findOne({ where: { id: req.params.id, userId: req.user.id } });
      if (!link) {
        return res.status(403).json({ message: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลลิงก์ชิ้นนี้' });
      }
    }

    const deviceRows = await LinkClickDevice.findAll({ where: { linkId: req.params.id } });
    const defaultDevices = { iOS: 0, Android: 0, Desktop: 0, Other: 0 };
    let totalDeviceClicks = 0;

    deviceRows.forEach(r => {
      if (defaultDevices[r.platform] !== undefined) {
        defaultDevices[r.platform] = r.clicks;
        totalDeviceClicks += r.clicks;
      }
    });

    const statsData = Object.keys(defaultDevices).map(plat => {
      const clicks = defaultDevices[plat];
      const percentage = totalDeviceClicks > 0 ? Math.round((clicks / totalDeviceClicks) * 100) : 0;
      return { platform: plat, clicks, percentage };
    });

    res.json({ totalDeviceClicks, stats: statsData });
  } catch (error) {
    console.error('Fetch Device Stats Error:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลอุปกรณ์' });
  }
});

// 🏆 7. GET: โมดูล 4 - จัดอันดับ Top Rank Leaderboard
router.get('/rank/top', auth, async (req, res) => {
  try {
    let whereClause = {};
    if (req.user.role !== 'admin') {
      whereClause.userId = req.user.id; 
    }
    const topLinks = await Link.findAll({
      where: whereClause,
      include: [
        { model: Domain, attributes: ['name'] },
        { model: User, attributes: ['username'] }
      ],
      order: [['clicks', 'DESC']],
      limit: 20
    });
    res.json(topLinks);
  } catch (error) {
    console.error('Fetch Top Rank Error:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลจัดอันดับ' });
  }
});

const LinkReferrerStat = require('../models/LinkReferrerStat');

// 🌐 8. 🔥 โมดูล 5 GET: ดึงสถิติโดเมนต้นทาง (Top Referrers) เรียงลำดับจากมากไปน้อย
router.get('/:id/referrer-stats', auth, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      const link = await Link.findOne({ where: { id: req.params.id, userId: req.user.id } });
      if (!link) {
        return res.status(403).json({ message: 'คุณไม่มีสิทธิ์เข้าถึงข้อมูลลิงก์ชิ้นนี้' });
      }
    }

    const referrerRows = await LinkReferrerStat.findAll({
      where: { linkId: req.params.id },
      order: [['clicks', 'DESC']] 
    });

    let totalReferrerClicks = 0;
    referrerRows.forEach(r => totalReferrerClicks += r.clicks);

    const statsData = referrerRows.map(r => {
      const percentage = totalReferrerClicks > 0 ? ((r.clicks / totalReferrerClicks) * 100).toFixed(2) : 0; 
      return { domain: r.referrerDomain, clicks: r.clicks, percentage: parseFloat(percentage) };
    });

    res.json({ totalReferrerClicks, stats: statsData });
  } catch (error) {
    console.error('Fetch Referrer Stats Error:', error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดในการดึงข้อมูลต้นทาง Referrer' });
  }
});

module.exports = router;