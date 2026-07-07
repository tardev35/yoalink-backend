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
  // 🔥 เติมส่วนนี้เข้าไป เพื่อให้ฐานข้อมูลรู้จัก IP
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: true
  }
});

module.exports = LinkClickLog;