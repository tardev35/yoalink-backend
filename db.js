const { Sequelize } = require('sequelize');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  logging: false
});

// 🔥 เปิด WAL + busy_timeout จริงทุกครั้งที่เชื่อมต่อ
// (Sequelize ไม่รองรับ PRAGMA ผ่าน dialectOptions.pragmas — ของเดิมจึงถูกเมิน WAL ไม่เคยติด)
// WAL: อ่าน/เขียนพร้อมกันได้ ไม่ล็อกจนค้าง · busy_timeout: โดนล็อกแล้วรอ 8 วิ แทนที่จะ error ทันที
sequelize.afterConnect((connection) => {
  return new Promise((resolve, reject) => {
    connection.exec(
      'PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=8000; PRAGMA cache_size=-64000;',
      (err) => (err ? reject(err) : resolve())
    );
  });
});

module.exports = sequelize;