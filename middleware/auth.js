const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  // ดึง Token จาก Header ที่ Frontend ส่งมา
  const token = req.header('Authorization')?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ message: 'ไม่มี Token อนุญาตให้เข้าถึง' });
  }

  try {
    // ถอดรหัส Token เพื่อเอา ID ของผู้ใช้ไปใช้งานต่อ
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; 
    next(); // ผ่านด่านไปทำงานฟังก์ชันต่อไปได้
  } catch (err) {
    res.status(401).json({ message: 'Token ไม่ถูกต้อง หรือหมดอายุ' });
  }
};