/* backend/monitor.js */
const axios = require('axios');
const Link = require('./models/Link');

const TELEGRAM_TOKEN = '8534286548:AAGDg5zML-FjirlbYryUKMYOa6DRG538Qh8';
const CHAT_ID = '-5415283024';

async function sendTelegram(msg) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: CHAT_ID,
            text: msg,
            parse_mode: 'Markdown'
        });
    } catch (err) { console.error('Telegram Error'); }
}

async function startCheck() {
    // 1. เช็กสภาพ Nginx ก่อนเลยว่า 502 ไหม
    try {
        const mainServer = await axios.get('https://yoalink.com', { timeout: 5000 });
    } catch (error) {
        if (error.response?.status === 502 || !error.response) {
            await sendTelegram(`🚨 *Yoalink Server DOWN!* \nสถานะ: 502 Bad Gateway หรือเซิร์ฟเวอร์ดับสนิท ด่วนที่สุดลุกพี่!`);
            process.exit(1);
        }
    }

    // 2. ถ้าเซิร์ฟเวอร์หลักรอด ดึงลิงก์จากฐานข้อมูล SQLite มาไล่เช็กรายตัว
    try {
        const links = await Link.findAll({ attributes: ['alias'] });
        console.log(`🕵️‍♂️ กำลังตรวจสอบลิงก์ทั้งหมด ${links.length} รายการ...`);

        for (let link of links) {
            try {
                // ยิงเช็กโดยห้ามไม่ให้ติดตามไปหน้าเว็บปลายทาง (maxRedirects: 0)
                await axios.get(`https://yoalink.com/${link.alias}`, {
                    maxRedirects: 0,
                    timeout: 4000,
                    validateStatus: (status) => status >= 200 && status < 400 // 2xx และ 3xx คือผ่าน
                });
            } catch (linkError) {
                // ถ้าลิงก์ไหนพัง ส่งสัญญาณเตือนเข้า Telegram ทันที
                await sendTelegram(`❌ *พบลิงก์ย่อพัง!* \nลิงก์: yoalink.com/${link.alias}\nError: ${linkError.message}`);
            }
        }
        console.log('✅ ตรวจสอบครบทุก LINK เรียบร้อย');
        process.exit(0);
    } catch (dbError) {
        await sendTelegram(`❌ ระบบตรวจสอบพัง: ไม่สามารถอ่านฐานข้อมูลได้`);
        process.exit(1);
    }
}

startCheck();