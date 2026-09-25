/* backend/models/LinkClickLog.js */
const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const LinkClickLog = sequelize.define('LinkClickLog', {
  linkId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  channel: {
    type: DataTypes.STRING,
    allowNull: true
  },
  referrerDomain: {
    type: DataTypes.STRING, // เก็บโดเมนต้นทางรายคลิก เพื่อกรองตามช่วงเวลาได้
    allowNull: true
  }
}, {
  // 🔥 หัวใจสำคัญอยู่ตรงนี้ครับ: สั่งระบบว่าเอาแค่ createdAt ไม่ต้องพยายามหา updatedAt
  timestamps: true,
  updatedAt: false,
  // ⚡ index ให้ query สถิติรายลิงก์ไม่ต้องสแกนทั้งตาราง (sync() จะสร้างให้อัตโนมัติถ้ายังไม่มี)
  indexes: [{ fields: ['linkId', 'createdAt'] }]
});

module.exports = LinkClickLog;