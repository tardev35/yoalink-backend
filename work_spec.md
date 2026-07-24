# work_spec.md — สเปกฟีเจอร์ระบบ (Yoalink URL Shortener)

สเปกเชิงฟีเจอร์ + data model + API เพื่อใช้อ้างอิงตอนพัฒนาต่อ
อ่านคู่กับ [CLAUDE.md](CLAUDE.md) (โครงสร้างโค้ด) และ [skill.md](skill.md) (dev/deploy)

---

## 1. เป้าหมายระบบ
เครื่องมือย่อลิงก์สำหรับทีมการตลาด: สร้างลิงก์สั้น `yoalink.com/<alias>` ที่ติดตามผลได้ละเอียด
(ช่องทาง, เวลา, อุปกรณ์, โดเมนต้นทาง) พร้อมระบบผู้ใช้/แอดมิน และป้องกันบอท/สแปม

## 2. ผู้ใช้งาน (Roles)
| Role | สิทธิ์ |
|---|---|
| user | เห็น/จัดการเฉพาะลิงก์ของตัวเอง |
| admin | เห็น/จัดการลิงก์ทุกคน + จัดการผู้ใช้/โดเมน/แท็กส่วนกลาง + ดู audit logs + โอนกรรมสิทธิ์ลิงก์ |

---

## 3. ฟีเจอร์หลัก

### 3.1 จัดการลิงก์
- สร้างลิงก์: `originalUrl` + `alias` (เว้นว่าง = สุ่ม 4 ตัว) + `tags` (คั่นด้วยคอมมา, เก็บเป็น lowercase)
- ลบลิงก์, แก้แท็ก
- ตาราง: โดเมน, ลิงก์ย่อ + ปุ่ม Copy ต่อช่องทาง (FB/TikTok/LINE/SMS/SEO), แท็ก, ผู้สร้าง (admin), จัดการ
- แบ่งหน้า (page/limit=20)

### 3.2 กรอง & ค้นหา
- **ค้นหา** ตาม alias / originalUrl / tags (substring LIKE)
- **กรองแท็ก 2 ช่อง แบบ OR** — เลือกได้สูงสุด 2 แท็ก แสดงลิงก์ที่มีแท็กใดแท็กหนึ่ง *(ทำเสร็จแล้ว)*
- dropdown แท็กดึง**รายชื่อแท็กครบทั้งหมด**ตามสิทธิ์ (ไม่ใช่แค่หน้าปัจจุบัน) *(ทำเสร็จแล้ว)*

### 3.3 สถิติต่อลิงก์ (modal "ศูนย์วิเคราะห์มาร์เก็ตติ้งรวม") — 4 แท็บ
| แท็บ | ข้อมูล | แหล่ง |
|---|---|---|
| แยกช่องทาง | คลิกแยก facebook/tiktok/line/sms/seo/organic | `LinkChannelStat` |
| เวลาทองคำ | คลิกราย ชม./วัน | `LinkClickLog` (มี timestamp) |
| อุปกรณ์คนใช้ | iOS/Android/Desktop/Other | `LinkClickDevice` |
| โดเมนต้นทาง | referrer domain + % | `LinkReferrerStat` (All Time) / `LinkClickLog` (ตามช่วงเวลา) |
- แท็บโดเมนต้นทางมี **dropdown ช่วงเวลา** (All Time / 30d / 7d / 24h / 1h) *(ทำเสร็จแล้ว)*
  - All Time = ตัวนับสะสมเดิม (ครบย้อนหลัง); ช่วงจำกัด = aggregate จาก `LinkClickLog` (เฉพาะคลิกหลังเริ่มเก็บ `referrerDomain`)

### 3.4 Redirect + เก็บสถิติ (`GET /:alias`)
- แปลงช่องทางจาก query `?s=1..5` หรือ `?src=facebook|tiktok|line|sms|seo`
- เมื่อเป็นคนจริง: `+1` ที่ Link.clicks, ChannelStat, ClickLog(channel+referrerDomain), ClickDevice, ReferrerStat
- **Anti-bot/spam:** ตรวจ User-Agent (bot list) + นับความถี่ต่อ IP (in-memory, >30 ครั้ง/นาที = spam) → บอท/สแปม redirect ผ่านแต่ **ไม่บันทึกสถิติ**

### 3.5 Admin
- จัดการผู้ใช้ทั้งหมด
- จัดการโดเมน + โอนย้ายลิงก์ข้ามโดเมน
- จัดการแท็กส่วนกลาง (เปลี่ยนชื่อ / ลบ ทุกลิงก์)
- โอนกรรมสิทธิ์ลิงก์ (รายชิ้น / ตาม alias)
- Audit Logs (บันทึก action + IP)

---

## 4. Data Model (SQLite ผ่าน Sequelize)
- **User** — บัญชีผู้ใช้ (username, password hash, role)
- **Domain** — โดเมนต้นทางของ originalUrl
- **Link** — `id: UUID`, `alias`, `originalUrl`, `parameter`, `tags: JSON[]`, `clicks`, `userId`, `domainId`
- **LinkChannelStat** — (linkId, channel) → `clicks` *(สะสม)*
- **LinkClickDevice** — (linkId, platform) → `clicks` *(สะสม)*
- **LinkReferrerStat** — (linkId, referrerDomain) → `clicks` *(สะสม)*
- **LinkClickLog** — ราย**คลิก**: `linkId`, `channel`, `referrerDomain`, `createdAt` *(ใช้กรองช่วงเวลา)*
- **AuditLog** — ประวัติการกระทำ + IP
- **BlockedIp** — IP ที่ถูกบล็อก

> กฎสำคัญ: ตาราง `*Stat` เป็นตัวนับสะสม ไม่มี timestamp รายคลิก — **การวิเคราะห์ตามเวลาต้องใช้ `LinkClickLog` เท่านั้น**

---

## 5. API Endpoints (ยืนยันจากโค้ด)

### `/api/links` ([routes/links.js](backend/routes/links.js))
| Method | Path | หมายเหตุ |
|---|---|---|
| GET | `/` | list + filter: `page, limit, search, tag, tag2` |
| GET | `/tags` | รายชื่อแท็กทั้งหมดตามสิทธิ์ (สำหรับ dropdown) |
| POST | `/` | สร้างลิงก์ |
| DELETE | `/:id` | ลบลิงก์ |
| PUT | `/:id/tags` | แก้แท็ก |
| GET | `/:id/channel-stats` | สถิติช่องทาง |
| GET | `/:id/time-stats` | สถิติราย ชม./วัน |
| GET | `/:id/device-stats` | สถิติอุปกรณ์ |
| GET | `/:id/referrer-stats?range=` | สถิติ referrer (`range` = `all`\|`1h`\|`24h`\|`7d`\|`30d`) |
| GET | `/rank/top` | ลิงก์ยอดคลิกสูงสุด (หน้า report) |

### อื่นๆ
- `/api/auth` — สมัคร/ล็อกอิน (ออก JWT)
- `/api/domains` — จัดการโดเมน
- `/api/admin/*` — ผู้ใช้/โดเมน/แท็กส่วนกลาง/audit/โอนกรรมสิทธิ์ (admin only)
- `GET /:alias` — redirect + เก็บสถิติ (inline ใน server.js)

---

## 6. สถานะฟีเจอร์
### ✅ ทำเสร็จแล้ว (ล่าสุด)
- กรองแท็ก 2 ช่องแบบ OR
- dropdown แท็กดึงรายชื่อครบทั้งหมด (แก้บั๊กที่เห็นแค่หน้าปัจจุบัน)
- dropdown ช่วงเวลาในแท็บโดเมนต้นทาง (+ เก็บ `referrerDomain` รายคลิกใน `LinkClickLog`)
- redesign filter bar (dropdown เท่ากัน, ปุ่มล้างเป็นไอคอน, ค้นหามีไอคอนข้างใน)

### 💡 ไอเดียพัฒนาต่อ (ยังไม่ทำ)
- ขยาย dropdown ช่วงเวลาให้ครบทุกแท็บสถิติ (ต้อง log device/channel รายคลิกเพิ่ม)
- ปรับการกรองแท็กให้ match แบบ exact array (ปัจจุบัน substring LIKE อาจ false positive + case-sensitive)
- เพิ่ม global tag list ให้ครอบทุกลิงก์ที่มองเห็น (ตอนนี้ dropdown อิงตามสิทธิ์แล้ว)
- Export รายงานสถิติ (CSV)

---

## 7. ข้อจำกัด/หนี้ทางเทคนิคที่รู้อยู่
1. กรองแท็ก = substring `LIKE` บน JSON string → false positive ได้ + case-sensitive
2. สถิติตามเวลาของ device/channel/referrer ย้อนหลังไม่ได้ (มีเฉพาะ `LinkClickLog` และเริ่มเก็บ referrer หลัง deploy)
3. PORT 5000 hardcode, `sequelize.sync()` ไม่ alter (ต้อง migrate manual)
4. Dashboard.jsx ใหญ่มาก (~1000 บรรทัด) — ควรทยอยแยกเป็น component ย่อยเมื่อมีโอกาส
