const { Sequelize } = require('sequelize');

// ตั้งค่าเชื่อมต่อฐานข้อมูล SQLite (เมื่อขึ้นระบบจริง เปลี่ยนแค่ตรงนี้เป็น MySQL บรรทัดเดียวจบ)
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite', 
  logging: false 
});

module.exports = sequelize;