/* backend/monitor.js */
const path = require('path');
// 🔥 ล็อคเป้าไฟล์ .env แบบตายตัว เพื่อให้ Cronjob หาเจอแน่นอน 100% ต่อให้รันจากโฟลเดอร์ไหนก็ตาม
require('dotenv').config({ path: path.join(__dirname, '.env') }); 

const axios = require('axios');
const sequelize = require('./db'); 
const Link = require('./models/Link');

// ⚙️ ดูดค่าจาก .env และทำความสะอาด (ลบช่องว่าง)
const TELEGRAM_TOKEN = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || '').trim();
const MAIN_DOMAIN = 'https://yoalink.com'; 

// 🔍 เช็กสถานะการดึง Token (ถ้าขึ้น 0 ตัวอักษรแปลว่าไฟล์ .env มีปัญหา)
console.log(`📡 โหลดข้อมูลจาก .env สำเร็จ (Token ยาว: ${TELEGRAM_TOKEN.length} ตัวอักษร)`);
if (TELEGRAM_TOKEN.length === 0) {
  console.error('❌ ระบบหยุดทำงาน: หา Token ไม่เจอ โปรดตรวจสอบไฟล์ .env');
  process.exit(1);
}

// 📮 ฟังก์ชันส่งแจ้งเตือน Telegram
async function sendTelegram(msg) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: msg,
      parse_mode: 'Markdown',
      disable_web_page_preview: true // ปิดพรีวิวลิงก์ย่อในแชท จะได้ไม่รกพื้นที่
    });
  } catch (err) {
    // โชว์ Error แบบละเอียดขึ้น จะได้รู้ว่า Telegram ด่าอะไรกลับมา
    console.error('❌ ไม่สามารถส่งข้อความเข้า Telegram ได้:', err.response?.data?.description || err.message);
  }
}

// 💤 ฟังก์ชันสั่งให้บอทหยุดพักหายใจ ป้องกันเซิร์ฟเวอร์เตะก้านคอ (Rate Limit)
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 🕵️‍♂️ ฟังก์ชันหลักในการเริ่มตรวจสภาพระบบ
async function startMonitoring() {
  console.log('🚀 เริ่มต้นระบบ Automation ตรวจสอบลิงก์ย่อ...');

  // 1. เช็กการเชื่อมต่อฐานข้อมูล
  try {
    await sequelize.authenticate();
  } catch (dbConnectError) {
    await sendTelegram(`🚨 *ระบบฐานข้อมูลพัง!* \nตัวมอนิเตอร์ไม่สามารถเชื่อมต่อฐานข้อมูลได้`);
    process.exit(1);
  }

  // 2. เช็กสภาพหน้าเว็บหลัก (ดัก 502 Bad Gateway)
  try {
    await axios.get(MAIN_DOMAIN, { timeout: 6000 });
  } catch (error) {
    const status = error.response?.status;
    if (status === 502 || status === 503 || status === 504 || !error.response) {
      await sendTelegram(`🚨 *Yoalink Server DOWN!* \nสถานะ: *${status || 'ดับสนิท/Timeout'}*\nเซิร์ฟเวอร์หลักพัง เข้าใช้งานไม่ได้!`);
      process.exit(1); 
    }
  }

  // 3. เริ่มลูปสแกนลิงก์ย่อทีละตัว
  try {
    const links = await Link.findAll({ attributes: ['alias'] });
    console.log(`📊 พบลิงก์ย่อทั้งหมด ${links.length} รายการ กำลังเริ่มตรวจ...`);

    let brokenLinks = [];

    for (let link of links) {
      const targetUrl = `${MAIN_DOMAIN}/${link.alias}`;
      try {
        await axios.get(targetUrl, { 
          maxRedirects: 0, // ห้ามวิ่งตาม Redirect
          timeout: 5000,
          // 👔 ปลอมตัวเป็นคนใช้งานเบราว์เซอร์ Chrome จริงๆ
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7'
          }
        });
      } catch (linkError) {
        const responseStatus = linkError.response?.status;

        // ถ้าตอบ 301/302 แปลว่าลิงก์ทำงานปกติ
        if (responseStatus && responseStatus >= 300 && responseStatus < 400) {
          // ปล่อยผ่าน
        } else {
          console.log(`❌ ลิงก์พัง: ${targetUrl} (Status: ${responseStatus || 'Timeout'})`);
          brokenLinks.push(`- ${link.alias} (Status: ${responseStatus || 'ดับ/Timeout'})`);
        }
      }
      
      // ⏱️ พัก 0.5 วินาที ก่อนเช็กคิวต่อไป
      await sleep(500); 
    }

    // 4. สรุปผลรายงาน
    if (brokenLinks.length > 0) {
      const summaryMessage = `❌ *พบชอร์ตลิงก์พังในระบบ!* \n\nมีลิงก์ย่อไม่ตอบสนองจำนวน *${brokenLinks.length}* รายการ:\n${brokenLinks.join('\n')}`;
      await sendTelegram(summaryMessage);
    } else {
      console.log('✅ ตรวจสอบเสร็จสิ้น: ทุกลิงก์ย่อปกติดี 100%');
      
      // ✅ ส่งรายงานผลว่าปกติ (ถ้าไม่อยากให้มันส่งทุกชั่วโมง ให้ใส่ // หน้าบรรทัดล่างนี้ครับ)
      await sendTelegram(`✅ *สถานะระบบปัจจุบัน:* ตรวจสอบลิงก์ย่อทั้งหมด ${links.length} รายการ ปกติดี 100% ไม่มีลิงก์พังครับ 🚀`);
    }

    // 🧹 ปิดการเชื่อมต่อฐานข้อมูลอย่างสวยงาม คืน RAM ให้ระบบ
    await sequelize.close();
    process.exit(0);

  } catch (dbError) {
    await sendTelegram(`❌ *ระบบตรวจสอบเอ๋อ:* ไม่สามารถดึงข้อมูลรายชื่อลิงก์จากตารางได้`);
    process.exit(1);
  }
}

// เดินเครื่องรันระบบ
startMonitoring();