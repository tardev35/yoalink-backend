const { DataTypes } = require('sequelize');
const sequelize = require('../db');
const Domain = require('./Domain');

const Link = sequelize.define('Link', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  alias: {
    type: DataTypes.STRING,
    allowNull: false
  },
  originalUrl: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  parameter: {
    type: DataTypes.STRING,
    allowNull: true,
    defaultValue: ''
  },
  tags: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  clicks: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  createdBy: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  timestamps: true
});

// ผูกความสัมพันธ์
Domain.hasMany(Link, { foreignKey: 'domainId', onDelete: 'CASCADE' });
Link.belongsTo(Domain, { foreignKey: 'domainId' });

module.exports = Link;