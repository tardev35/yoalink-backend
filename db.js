const { Sequelize } = require('sequelize');

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: './database.sqlite',
  logging: false
});

// 🔥 เปิด WAL + busy_timeout ด้วยการ query ตรงๆ ตอนสตาร์ต (server.js เรียก initPragmas() ก่อน sync)
// ⚠️ ห้ามใช้ hook afterConnect — Sequelize 6 ฝั่ง SQLite ไม่เรียก hook นี้เลย (พบ 2026-10-30: ใช้มา 3 เดือน
//    journal_mode ยังเป็น delete, busy_timeout ยังเป็น 0 → "database is locked" / SQLITE_BUSY ทุกครั้งที่เขียนชนกัน)
// WAL: อ่าน/เขียนพร้อมกันได้ ไม่ล็อกจนค้าง · busy_timeout: โดนล็อกแล้วรอ 8 วิ แทนที่จะ error ทันที
sequelize.initPragmas = async function () {
  await sequelize.query('PRAGMA busy_timeout=8000'); // ตั้งก่อน เผื่อเปลี่ยน journal_mode ต้องรอ lock
  for (const p of ['journal_mode=WAL', 'synchronous=NORMAL', 'cache_size=-64000']) {
    try { await sequelize.query(`PRAGMA ${p}`); } catch (err) { console.error(`PRAGMA ${p} ล้มเหลว:`, err.message); }
  }
  const [[mode]] = await sequelize.query('PRAGMA journal_mode');
  const [[bt]] = await sequelize.query('PRAGMA busy_timeout');
  console.log(`🗄️ SQLite journal_mode=${mode.journal_mode} busy_timeout=${bt.timeout ?? bt.busy_timeout}`);
  if (mode.journal_mode !== 'wal') console.error('⚠️ SQLite ไม่ได้อยู่ใน WAL mode — จะเกิด database is locked เวลาเขียนชนกัน');
};

module.exports = sequelize;