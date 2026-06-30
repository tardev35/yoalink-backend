/* backend/models/LinkChannelStat.js */
const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const LinkChannelStat = sequelize.define('LinkChannelStat', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  linkId: {
    type: DataTypes.UUID, // 🔥 แก้จาก INTEGER เป็น UUID เพื่อให้แมตช์กับคีย์หลักใน Link.js ชัวร์ 100%
    allowNull: false
  },
  channel: {
    type: DataTypes.STRING, // facebook, tiktok, line, sms, seo, หรือ organic/direct
    allowNull: false
  },
  clicks: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  }
});

module.exports = LinkChannelStat;