/* backend/check-backup.js */
const { Sequelize } = require('sequelize');
const path = require('path');

// ⚠️ ลูกพี่เปลี่ยนชื่อไฟล์และพาธตรงนี้ ให้ตรงกับไฟล์ Backup ของเมื่อคืนนะครับ
// เช่น './backups/db-2026-07-06.sqlite' หรือชื่อที่ระบบแบคอัพไว้
const backupFilePath = path.join(__dirname, 'db_backup_20260707_0200.sqlite'); 

async function checkBackup() {
  console.log(`🔍 กำลังแอบส่องไฟล์ Backup: ${backupFilePath}`);

  const backupDb = new Sequelize({
    dialect: 'sqlite',
    storage: backupFilePath,
    logging: false
  });

  try {
    await backupDb.authenticate();
    console.log('✅ เชื่อมต่อไฟล์ Backup สำเร็จ!');

    // 1. นับจำนวนลิงก์ทั้งหมด
    const [countResult] = await backupDb.query('SELECT COUNT(*) as totalLinks FROM Links;');
    console.log(`\n📊 จำนวนลิงก์ทั้งหมดในไฟล์ Backup: ${countResult[0].totalLinks} ลิงก์`);

    // 2. ขอดู 5 ลิงก์ล่าสุดที่ถูกสร้าง เพื่อเทียบเวลา
    const [latestLinks] = await backupDb.query('SELECT alias, userId, createdAt FROM Links ORDER BY createdAt DESC LIMIT 5;');
    console.log('\n🔗 5 ลิงก์ล่าสุดที่ถูกบันทึกไว้ใน Backup นี้ (ไว้เช็กว่าอัปเดตถึงตอนไหน):');
    console.table(latestLinks);

  } catch (error) {
    console.error('\n❌ เกิดข้อผิดพลาด (หาไฟล์ไม่เจอ หรือโครงสร้างพัง):', error.message);
  } finally {
    await backupDb.close();
    process.exit(0);
  }
}

checkBackup();