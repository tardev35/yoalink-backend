/* backend/fix-owners.js */
const sequelize = require('./db');
const Link = require('./models/Link');
const User = require('./models/User');

async function repairLinkOwners() {
  try {
    // 1. เชื่อมต่อฐานข้อมูล
    await sequelize.sync();
    
    // 2. ดึงรายชื่อผู้ใช้ที่มีอยู่จริงในระบบตอนนี้ทั้งหมดมาทำแผนที่ (Map)
    const users = await User.findAll();
    const validUserIds = users.map(u => u.id);
    
    // 3. หาบัญชีแอดมิน (ตัวลูกพี่เอง) เพื่อใช้เป็นตัวรับโอนสำรอง
    const adminUser = users.find(u => u.role === 'admin');
    if (!adminUser) {
      console.log('❌ ไม่พบบัญชีแอดมินในระบบครับ');
      return;
    }

    // 4. ดึงลิงก์ย่อทั้งหมดมาตรวจสอบ
    const links = await Link.findAll();
    let repairedCount = 0;

    console.log(`📊 เริ่มตรวจสอบลิงก์ทั้งหมด ${links.length} รายการ...`);

    for (let link of links) {
      // 🕵️‍♂️ ถ้ารหัสคนสร้างเป็น NULL หรือ ID นั้นไม่มีตัวตนอยู่ในตาราง Users แล้ว (ขึ้นระบบกลาง)
      if (!link.userId || !validUserIds.includes(link.userId)) {
        
        // 🛠️ โอนลิงก์นี้มาให้บัญชีแอดมินดูแลแทน (หรือเปลี่ยน adminUser.id เป็น ID ของน้องๆ ได้หากต้องการเจาะจง)
        link.userId = adminUser.id;
        link.createdBy = adminUser.id;
        
        await link.save();
        repairedCount++;
      }
    }

    console.log(`✅ ซ่อมแซมเสร็จสิ้น! โอนลิงก์จาก "ระบบกลาง" คืนให้แอดมิน "${adminUser.username}" แล้วทั้งหมด ${repairedCount} รายการครับลูกพี่!`);
    process.exit(0);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดระหว่างซ่อมแซม:', error);
    process.exit(1);
  }
}

repairLinkOwners();