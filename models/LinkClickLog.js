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
  }
  // (ถ้ามีคอลัมน์ ipAddress อยู่ก็ปล่อยไว้เหมือนเดิมครับ)
}, {
  // 🔥 เพิ่ม 2 บรรทัดนี้เข้าไป เพื่อบอกว่า "ขอแค่ createdAt นะ ไม่เอา updatedAt"
  timestamps: true,
  updatedAt: false
});

module.exports = LinkClickLog;