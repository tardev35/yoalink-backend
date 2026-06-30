/* backend/models/LinkClickDevice.js */
const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const LinkClickDevice = sequelize.define('LinkClickDevice', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  linkId: {
    type: DataTypes.UUID, // 🔥 ใช้ UUID รองรับดัชนีคีย์หลักของตาราง Link.js อย่างปลอดภัย
    allowNull: false
  },
  platform: {
    type: DataTypes.STRING, // iOS, Android, Desktop, หรือ Other
    allowNull: false
  },
  clicks: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  }
});

module.exports = LinkClickDevice;