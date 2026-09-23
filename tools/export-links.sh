#!/usr/bin/env bash
# ส่งออกรายชื่อลิงก์ย่อทั้งหมด (alias → ปลายทาง · แท็ก · คนสร้าง · วันสร้าง) เป็น JSON เพื่อนำเข้า gsc-report
# (tools/import-ref-links.mjs) — ใช้คู่กับ export-clicks.sh: บันทึกคลิกบอกแค่ alias ต้องมีตารางนี้ถึงจะรู้ว่า
# คลิกนั้นวิ่งเข้าแบรนด์ไหน (23 ก.ย. 2569 พบว่าเว็บของแผน Topgamevip บางส่วนยังส่งคลิกไปแบรนด์อื่นผ่านลิงก์เก่า)
#
# ใช้:  tools/export-links.sh [ไฟล์ DB] > links.json
set -euo pipefail
DB="${1:-$(dirname "$0")/../database.sqlite}"

sqlite3 -json "$DB" "
SELECT lower(k.alias) AS alias,
       k.originalUrl AS target_url,
       COALESCE(k.tags, '[]') AS tags,
       u.username AS creator,
       substr(datetime(k.createdAt, '+7 hours'), 1, 10) AS created_at,
       k.clicks AS total_clicks
  FROM Links k LEFT JOIN Users u ON u.id = k.createdBy
 ORDER BY 1;"
