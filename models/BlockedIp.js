const { DataTypes } = require('sequelize');
const sequelize = require('../db');

const BlockedIp = sequelize.define('BlockedIp', {
  ipAddress: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  reason: {
    type: DataTypes.STRING,
    allowNull: true
  }
});

module.exports = BlockedIp;