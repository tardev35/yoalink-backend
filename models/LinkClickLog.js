/* backend/models/LinkClickLog.js */
const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const LinkClickLog = sequelize.define('LinkClickLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  linkId: {
    type: DataTypes.UUID, // รองรับรหัส UUID จากตารางหลัก
    allowNull: false
  },
  channel: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'organic/direct'
  }
}, {
  timestamps: true, // ตัวนี้จะสร้างคอลัมน์ createdAt ให้เราเก็บเวลาคลิกโดยอัตโนมัติ
  updatedAt: false
});

module.exports = LinkClickLog;