/* backend/models/LinkReferrerStat.js */
const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const LinkReferrerStat = sequelize.define('LinkReferrerStat', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  linkId: {
    type: DataTypes.UUID, // ยึดตามมาตรฐาน UUID ของระบบ
    allowNull: false
  },
  referrerDomain: {
    type: DataTypes.STRING, // เช่น 'facebook.com', 'vodkafun9.info', หรือ 'Direct / None'
    allowNull: false
  },
  clicks: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  }
});

module.exports = LinkReferrerStat;