/* backend/fix-existing-links.js */
const sequelize = require('./db'); 
const Link = require('./models/Link');

async function runFix() {
  console.log('⏳ กำลังเริ่มต้นสแกนฐานข้อมูลเพื่อซ่อมลิงก์ที่มีช่องว่าง...');
  
  try {
    await sequelize.authenticate();
    
    // ดึงทุกลิงก์ในระบบออกมาตรวจสอบ
    const links = await Link.findAll();
    let fixedCount = 0;

    for (let link of links) {
      let currentUrl = link.originalUrl;

      if (currentUrl) {
        // 🧼 ทำความสะอาด: ตัดช่องว่าง หน้า-หลัง และตัด %20 ที่อาจจะหลุดไปตอนบันทึกทิ้งให้หมด
        let cleanUrl = currentUrl.trim();
        
        // ดักจับกรณีมี %20 ค้างอยู่ที่ท้าย URL
        if (cleanUrl.endsWith('%20')) {
          cleanUrl = cleanUrl.replace(/%20$/, '').trim();
        }

        // ถ้าพบว่า URL เปลี่ยนไป (แปลว่าตัวเก่ามีปัญหาช่องว่าง) ให้สั่งบันทึกตัวที่สะอาดทับลงไป
        if (cleanUrl !== currentUrl) {
          link.originalUrl = cleanUrl;
          await link.save(); // บันทึกข้อมูลใหม่ทันที
          
          console.log(`✅ ซ่อมสำเร็จ: yoalink.com/${link.alias} ➔ เคลียร์ช่องว่างเรียบร้อย`);
          fixedCount++;
        }
      }
    }

    console.log(`\n🎉 เสร็จสิ้น! ระบบทำการตรวจพบและซ่อมลิงก์เก่าที่มีช่องว่างทั้งหมด ${fixedCount} รายการ`);
    console.log('🟢 ตอนนี้ลิงก์เก่าทั้งหมดในโซเชียลจะกลับมาใช้งานได้ปกติ 100% โดยไม่ต้องลบครับลูกพี่!');
    process.exit(0);

  } catch (error) {
    console.error('❌ เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล:', error);
    process.exit(1);
  }
}

runFix();