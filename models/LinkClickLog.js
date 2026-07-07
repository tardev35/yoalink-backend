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
}, {
  // 🔥 หัวใจสำคัญอยู่ตรงนี้ครับ: สั่งระบบว่าเอาแค่ createdAt ไม่ต้องพยายามหา updatedAt
  timestamps: true,
  updatedAt: false
});

module.exports = LinkClickLog;