const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const router = express.Router();

// 🟢 API: สมัครสมาชิก (/api/auth/register)
router.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    // เช็คว่ามี user นี้หรือยัง
    const existingUser = await User.findOne({ where: { username } });
    if (existingUser) {
      return res.status(400).json({ message: 'ชื่อผู้ใช้นี้มีคนใช้แล้ว' });
    }

    // เข้ารหัสผ่าน (Hashing)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // บันทึกลง Database
    const newUser = await User.create({
      username,
      password: hashedPassword
    });

    res.status(201).json({ message: 'สมัครสมาชิกสำเร็จ!' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
});

// 🔵 API: ล็อกอิน (/api/auth/login)
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // หา User ในระบบ
    const user = await User.findOne({ where: { username } });
    if (!user) {
      return res.status(400).json({ message: 'ไม่พบชื่อผู้ใช้นี้' });
    }

    // ตรวจสอบรหัสผ่าน
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'รหัสผ่านไม่ถูกต้อง' });
    }

    // สร้าง JWT Token ยืนยันตัวตน (มีอายุ 1 วัน)
    const token = jwt.sign(
      { id: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    res.json({
      message: 'เข้าสู่ระบบสำเร็จ',
      token,
      user: { id: user.id, username: user.username, role: user.role }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'เกิดข้อผิดพลาดที่เซิร์ฟเวอร์' });
  }
});

module.exports = router;