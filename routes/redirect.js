const express = require('express');
const Link = require('../models/Link');
const router = express.Router();

router.get('/:alias', async (req, res) => {
  try {
    const { alias } = req.params;

    // ค้นหาโดยเช็กตัวสะกดตรงๆ
    const link = await Link.findOne({ where: { alias: alias } });

    if (link) {
      link.clicks += 1;
      await link.save();

      // วาร์ปไปยัง URL ปลายทางจริง
      return res.redirect(link.originalUrl);
    } else {
      // หน้าตา 404 สีชมพูที่โผล่บนจอคุณตอนนี้เลย
      return res.status(404).send(`
        <div style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #EB568E;">404 Not Found</h1>
          <p>อ๊ะ! ไม่พบลิงก์ <b>/${alias}</b> ในระบบของเรา</p>
        </div>
      `);
    }
  } catch (error) {
    console.error('Redirect Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;