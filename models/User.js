const { DataTypes } = require('sequelize');
const sequelize = require('../db'); // ดึงตัวเชื่อมต่อส่วนกลางมาใช้

const User = sequelize.define('User', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4, // เจนไอดีแบบ UUID อัตโนมัติ (เช่น 123e4567-e89b...)
    primaryKey: true
  },
  username: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true, // ห้ามชื่อซ้ำ
    set(val) {
      this.setDataValue('username', val.trim()); // ตัดช่องว่างให้อัตโนมัติ
    }
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.ENUM('admin', 'member'), // กำหนดสิทธิ์ผู้ใช้
    defaultValue: 'member'
  },
  customDomains: {
    type: DataTypes.JSON, // เทคนิคระดับโปร: ใน SQL ปกติเก็บ Array ไม่ได้ แต่ Sequelize แปลงเป็น JSON ให้เราอัตโนมัติ!
    defaultValue: []
  }
}, {
  timestamps: true // สร้าง createdAt และ updatedAt ให้อัตโนมัติ
});

module.exports = User;