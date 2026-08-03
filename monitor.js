/* backend/monitor.js */
const axios = require('axios');
const sequelize = require('./db'); 
const Link = require('./models/Link');

// 🔥 ฝัง Token ตรงๆ ไปเลย จบทุกปัญหา .env เอ๋อ! (แอบใส่ .trim() ไว้กันเหนียวให้ด้วย)
const TELEGRAM_TOKEN = '8534286548:AAGDg5zML-FjirlbYryUKMYOa6DRG538Qh8'.trim();
const CHAT_ID = '-5415283024'.trim();
const MAIN_DOMAIN = 'https://yoalink.com';

// header ที่ใช้ยิงเช็ก + X-Monitor-Key บอก backend ว่าเป็น monitor (ไม่ต้องเขียนสถิติ)
const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'th-TH,th;q=0.9,en-US;q=0.8,en;q=0.7',
  'X-Monitor-Key': 'yoalink-monitor-2f8k'
};

console.log(`📡 โหลด Token สำเร็จ! (ความยาว: ${TELEGRAM_TOKEN.length} ตัวอักษร)`);

async function sendTelegram(msg) {
  try {
    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: CHAT_ID,
      text: msg,
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
  } catch (err) {
    console.error('❌ ไม่สามารถส่งข้อความเข้า Telegram ได้:', err.response?.data?.description || err.message);
  }
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// 🔁 เช็กลิงก์แบบมี retry: timeout ครั้งเดียวไม่ตัดสินว่าพัง (กัน false alarm จากโหลดชั่วคราว)
// ถือว่า "ปกติ" เมื่อได้ redirect 3xx · ลองซ้ำสูงสุด 3 ครั้ง เว้น 2 วิ ก่อนสรุปว่าพัง
async function checkLink(targetUrl, attempts = 3) {
  let lastStatus;
  for (let i = 1; i <= attempts; i++) {
    try {
      await axios.get(targetUrl, { maxRedirects: 0, timeout: 8000, headers: REQUEST_HEADERS });
      return { ok: true }; // ได้ 2xx (พบยากกับ redirect) ก็ถือว่าปกติ
    } catch (err) {
      const status = err.response?.status;
      if (status >= 300 && status < 400) return { ok: true }; // redirect = ปกติ
      lastStatus = status; // undefined = timeout / ไม่มี response
      if (i < attempts) await sleep(2000); // รอ 2 วิ แล้วลองใหม่
    }
  }
  return { ok: false, status: lastStatus };
}

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
      const result = await checkLink(targetUrl);
      if (!result.ok) {
        console.log(`❌ ลิงก์พัง: ${targetUrl} (Status: ${result.status || 'Timeout'})`);
        brokenLinks.push(`- ${link.alias} (Status: ${result.status || 'ดับ/Timeout'})`);
      }
      await sleep(500);
    }

    if (brokenLinks.length > 0) {
      const summaryMessage = `❌ *พบชอร์ตลิงก์พังในระบบ!* \n\nมีลิงก์ย่อไม่ตอบสนองจำนวน *${brokenLinks.length}* รายการ:\n${brokenLinks.join('\n')}`;
      await sendTelegram(summaryMessage);
    } else {
      console.log('✅ ตรวจสอบเสร็จสิ้น: ทุกลิงก์ย่อปกติดี 100%');
      await sendTelegram(`✅ *สถานะระบบปัจจุบัน:* ตรวจสอบลิงก์ย่อทั้งหมด ${links.length} รายการ ปกติดี 100% ไม่มีลิงก์พังครับ 🚀`);
    }

    await sequelize.close();
    process.exit(0);

  } catch (dbError) {
    await sendTelegram(`❌ *ระบบตรวจสอบเอ๋อ:* ไม่สามารถดึงข้อมูลรายชื่อลิงก์จากตารางได้`);
    process.exit(1);
  }
}

startMonitoring();