#!/usr/bin/env bash
# ส่งออกคลิกผ่านลิงก์ย่อ แยก วัน × alias × โดเมนต้นทาง เป็น JSON เพื่อนำเข้า gsc-report (tools/import-ref-clicks.mjs)
# ใช้ sqlite3 CLI ไม่ใช่ node:sqlite เพราะ VPS ของ yoalink ยังเป็น Node 20 (ตรวจ 23 ก.ย. 2569)
# ใช้ LinkClickLogs เท่านั้น เพราะเป็นตารางเดียวที่มี timestamp รายคลิก · วันคิดตามเวลาไทย (+7)
#
# ใช้:  tools/export-clicks.sh [วันเริ่ม YYYY-MM-DD] [ไฟล์ DB] > clicks.json
#   ค่าเริ่มต้น: 3 วันก่อนวันนี้ (ทับของเดิมได้ ตัวนำเข้านับใหม่จากบันทึกรายคลิกทุกครั้ง) · ./database.sqlite
set -euo pipefail
SINCE="${1:-$(date -d '3 days ago' +%F)}"
DB="${2:-$(dirname "$0")/../database.sqlite}"

sqlite3 -json "$DB" "
SELECT substr(datetime(c.createdAt, '+7 hours'), 1, 10) AS day,
       lower(k.alias) AS alias,
       COALESCE(NULLIF(lower(c.referrerDomain), ''), '(ไม่มี referrer)') AS referrer_domain,
       COUNT(*) AS clicks
  FROM LinkClickLogs c JOIN Links k ON k.id = c.linkId
 WHERE datetime(c.createdAt, '+7 hours') >= '$SINCE'
 GROUP BY 1, 2, 3
 ORDER BY 1, 2, 3;"
