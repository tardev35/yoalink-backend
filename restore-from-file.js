/* backend/restore-from-file.js */
const { Sequelize } = require('sequelize');
const path = require('path');
const currentDb = require('./db'); // ต่อฐานข้อมูลปัจจุบัน (ที่ใช้งานอยู่)

// ชี้เป้าไปที่ไฟล์แบคอัพของตี 2 เมื่อคืน
const backupFilePath = path.join(__dirname, 'backups', 'db_backup_20260707_0200.sqlite');

async function restoreOwners() {
  console.log('🚀 เริ่มต้นกระบวนการดูดข้อมูลกรรมสิทธิ์จากไฟล์ Backup...');

  // เชื่อมต่อฐานข้อมูล Backup (แบบอ่านอย่างเดียว)
  const backupDb = new Sequelize({
    dialect: 'sqlite',
    storage: backupFilePath,
    logging: false
  });

  try {
    await backupDb.authenticate();
    console.log('✅ เชื่อมต่อไฟล์ Backup ของเมื่อคืนสำเร็จ!');

    // 1. ดึงข้อมูลเจ้าของลิงก์ทั้งหมดจากไฟล์ Backup
    const [backupLinks] = await backupDb.query(
      "SELECT alias, userId, createdBy FROM Links WHERE userId IS NOT NULL;"
    );

    console.log(`📊 พบข้อมูลเจ้าของลิงก์ใน Backup จำนวน ${backupLinks.length} รายการ กำลังเริ่มฉีดข้อมูลคืนระบบหลัก...`);

    let restoredCount = 0;

    // 2. ลูปเอาข้อมูลจาก Backup ไปอัปเดตทับในฐานข้อมูลปัจจุบัน
    for (let link of backupLinks) {
      await currentDb.query(
        "UPDATE Links SET userId = ?, createdBy = ? WHERE alias = ?;",
        { replacements: [link.userId, link.createdBy, link.alias] }
      );
      restoredCount++;
    }

    console.log(`\n🎉 [กู้ชีพสำเร็จ!] โอนกรรมสิทธิ์คืนให้ทีมงานเรียบร้อยทั้งหมด ${restoredCount} ลิงก์ครับลูกพี่!`);

  } catch (error) {
    console.error('\n❌ เกิดข้อผิดพลาดระหว่างกู้คืนข้อมูล:', error.message);
  } finally {
    // ปิดการเชื่อมต่อทั้ง 2 ฝั่งให้เรียบร้อย
    await backupDb.close();
    await currentDb.close();
    process.exit(0);
  }
}

restoreOwners();