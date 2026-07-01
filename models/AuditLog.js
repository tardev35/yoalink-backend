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
    type: DataTypes.STRING, // เช่น 'CREATE_LINK', 'UPDATE_DOMAIN', 'DELETE_LINK'
    allowNull: false
  },
  details: {
    type: DataTypes.JSON, // 📦 เก็บข้อมูลยืดหยุ่น เช่น { oldDomain: 'a.com', newDomain: 'b.com' }
    allowNull: true
  }
}, {
  timestamps: true // ⏰ จะมี createdAt ไว้บอกว่าทำ "เวลาไหน" อัตโนมัติ
});

// ผูกประวัติว่าใครเป็นคนทำ (User -> AuditLog)
AuditLog.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(AuditLog, { foreignKey: 'userId' });

module.exports = AuditLog;