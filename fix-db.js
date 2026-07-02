/* backend/fix-db.js */
const sequelize = require('./db');

async function fixDatabase() {
  try {
    console.log('⏳ กำลังงัดฐานข้อมูลเพื่อเพิ่มคอลัมน์ IP...');
    await sequelize.query('ALTER TABLE AuditLogs ADD COLUMN ipAddress VARCHAR(255);');
    await sequelize.query('ALTER TABLE AuditLogs ADD COLUMN location VARCHAR(255);');
    console.log('✅ เพิ่มคอลัมน์สำเร็จ! ระบบพร้อมเก็บ IP แล้วครับลูกพี่!');
  } catch (error) {
    console.log('⚠️ คอลัมน์อาจจะถูกเพิ่มไปแล้ว หรือมีบางอย่างขัดข้อง:', error.message);
  }
  process.exit(0);
}

fixDatabase();