/* backend/monitor.js */
require('dotenv').config(); // อย่าลืมลง npm install dotenv นะครับ
const axios = require('axios');
const sequelize = require('./db'); 
const Link = require('./models/Link');
const token = (process.env.TELEGRAM_BOT_TOKEN || '').trim();
// ⚙️ ตั้งค่าของลูกพี่
const TELEGRAM_TOKEN = token;
const CHAT_ID = (process.env.TELEGRAM_CHAT_ID || '').trim();
const MAIN_DOMAIN = 'https://yoalink.com'; 

console.log('🔍 เช็ก Token ที่ดูดมาได้:', TELEGRAM_TOKEN ? 'มีข้อมูล' : 'ว่างเปล่า!! (เช็กไฟล์ .env ด่วน)');

async function sendTelegram(msg) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: msg,
      parse_mode: 'Markdown'
    });
  } catch (err) {
    console.error('❌ ไม่สามารถส่งข้อความเข้า Telegram ได้:', err.message);
  }
}

// 💤 ฟังก์ชันสั่งให้บอทหยุดพักหายใจ ป้องกันโดนแบน
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function startMonitoring() {
  console.log('🚀 เริ่มต้นระบบ Automation ตรวจสอบลิงก์ย่อ...');

  try {
    await sequelize.authenticate();
  } catch (dbConnectError) {
    await sendTelegram(`🚨 *ระบบฐานข้อมูลพัง!* \nตัวมอนิเตอร์ไม่สามารถเชื่อมต่อฐานข้อมูลได้`);
    process.exit(1);
  }

  try {
    await axios.get(MAIN_DOMAIN, { timeout: 6000 });
  } catch (error) {
    const status = error.response?.status;
    if (status === 502 || status === 503 || status === 504 || !error.response) {
      await sendTelegram(`🚨 *Yoalink Server DOWN!* \nสถานะ: *${status || 'ดับสนิท/Timeout'}*\nเซิร์ฟเวอร์หลักพัง เข้าใช้งานไม่ได้!`);
      process.exit(1); 
    }
  }

  try {
    const links = await Link.findAll({ attributes: ['alias'] });
    console.log(`📊 พบลิงก์ย่อทั้งหมด ${links.length} รายการ กำลังเริ่มตรวจ...`);

    let brokenLinks = [];

    for (let link of links) {
      const targetUrl = `${MAIN_DOMAIN}/${link.alias}`;
      try {
        await axios.get(targetUrl, { 
          maxRedirects: 0, 
          timeout: 5000,
          // 🔥 จับบอทใส่เสื้อผ้า ปลอมตัวเป็นคนใช้ Google Chrome บน Windows
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7'
          }
        });
      } catch (linkError) {
        const responseStatus = linkError.response?.status;

        // ถ้าตอบ 301/302 แปลว่าลิงก์ปกติ
        if (responseStatus && responseStatus >= 300 && responseStatus < 400) {
          // ปล่อยผ่าน
        } else {
          console.log(`❌ ลิงก์พัง: ${targetUrl} (Status: ${responseStatus || 'Timeout'})`);
          brokenLinks.push(`- ${link.alias} (Status: ${responseStatus || 'ดับ/Timeout'})`);
        }
      }
      
      // ⏱️ สั่งบอทหยุดพัก 0.5 วินาที ก่อนเช็กคิวต่อไป (กันเซิร์ฟเวอร์เตะก้านคอ 500)
      await sleep(500); 
    }

   // 🚨 4. สรุปผลรายงาน
    if (brokenLinks.length > 0) {
      const summaryMessage = `❌ *พบชอร์ตลิงก์พังในระบบ!* \n\nมีลิงก์ย่อไม่ตอบสนองจำนวน *${brokenLinks.length}* รายการ:\n${brokenLinks.join('\n')}`;
      await sendTelegram(summaryMessage);
    } else {
      console.log('✅ ตรวจสอบเสร็จสิ้น: ทุกลิงก์ย่อปกติดี 100%');
      
      // 🔥 เพิ่มบรรทัดนี้เข้าไป เพื่อบังคับให้มันทักไปบอกใน Telegram ว่าตรวจเสร็จแล้ว
      await sendTelegram(`✅ *สถานะระบบปัจจุบัน:* ตรวจสอบลิงก์ย่อทั้งหมด ${links.length} รายการ ปกติดี 100% ไม่มีลิงก์พังครับ 🚀`);
    }

    process.exit(0);

  } catch (dbError) {
    await sendTelegram(`❌ *ระบบตรวจสอบเอ๋อ:* ไม่สามารถดึงข้อมูลรายชื่อลิงก์จากตารางได้`);
    process.exit(1);
  }
}

startMonitoring();