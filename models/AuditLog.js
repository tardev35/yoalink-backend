/* backend/models/AuditLog.js */
const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const User = require('./User');

const AuditLog = sequelize.define('AuditLog', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  action: {
    type: DataTypes.STRING, 
    allowNull: false
  },
  details: {
    type: DataTypes.JSON, 
    allowNull: true
  },
  // 🔥 เพิ่ม 2 ฟิลด์นี้เพื่อเก็บร่องรอย IP และสถานที่
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: true
  },
  location: {
    type: DataTypes.STRING,
    allowNull: true
  }
}, {
  timestamps: true 
});

AuditLog.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(AuditLog, { foreignKey: 'userId' });

module.exports = AuditLog;