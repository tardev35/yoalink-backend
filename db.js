const { Sequelize } = require('sequelize');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  logging: false,
  // 🔥 เปิดโหมด WAL เพื่อให้ SQLite อ่าน/เขียนข้อมูลพร้อมกันได้ลื่นไหล ไม่ค้าง!
  dialectOptions: {
    pragmas: {
      journal_mode: 'WAL',
      synchronous: 'NORMAL',
      cache_size: -64000
    }
  }
});

module.exports = sequelize;