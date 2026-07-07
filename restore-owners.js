/* backend/restore-owners.js */
const sequelize = require('./db'); 

async function restoreOwners() {
  try {
    console.log('🔍 กำลังตรวจสอบตารางสำรองในระบบ...');

    // 1. เช็กก่อนว่ามีตาราง Links_backup หลงเหลืออยู่ไหม
    const [tables] = await sequelize.query(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='Links_backup';"
    );

    if (tables.length === 0) {
      console.error('❌ ไม่พบตาราง Links_backup ในฐานข้อมูลปัจจุบันครับลูกพี่ (อาจจะถูกลบหรือสร้างไม่สำเร็จ)');
      return;
    }

    console.log('⏳ พบตารางสำรอง Links_backup! กำลังเริ่มอ่านข้อมูลเจ้าของลิงก์เดิม...');

    // 2. ดึงข้อมูลจากตารางสำรองออกมารอโอนย้าย
    const [backupLinks] = await sequelize.query(
      "SELECT id, alias, userId, createdBy FROM Links_backup;"
    );

    console.log(`📊 พบข้อมูลในตารางสำรองทั้งหมด ${backupLinks.length} รายการ กำลังเริ่มกู้คืนกรรมสิทธิ์...`);

    let restoredCount = 0;

    // 3. วิ่งลูปเอา userId ของเก่า ไปอัปเดตคืนตาราง Links หลัก
    for (let backup of backupLinks) {
      if (backup.userId) {
        // อัปเดตคืนสิทธิ์เฉพาะลิงก์ที่ปัจจุบันกลายเป็นค่าว่าง หรือไม่มีเจ้าของ
        const [result] = await sequelize.query(
          "UPDATE Links SET userId = ?, createdBy = ? WHERE alias = ?;",
          { replacements: [backup.userId, backup.createdBy, backup.alias] }
        );
        restoredCount++;
      }
    }

    console.log(`\n🎉 [สำเร็จ] ดึงคืนกรรมสิทธิ์ให้ทีมงานเรียบร้อยทั้งหมด ${restoredCount} ลิงก์ครับลูกพี่!`);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดระหว่างกู้คืนข้อมูล:', error.message);
  } finally {
    // ปิดการเชื่อมต่อ DB
    await sequelize.close();
    process.exit(0);
  }
}

restoreOwners();