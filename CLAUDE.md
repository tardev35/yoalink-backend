# CLAUDE.md — คู่มือ Codebase (Yoalink URL Shortener)

เอกสารนี้ให้ Claude Code / นักพัฒนาเข้าใจโครงสร้างระบบได้เร็ว ก่อนลงมือแก้โค้ด
อ่านคู่กับ [work_spec.md](work_spec.md) (สเปกฟีเจอร์) และ [skill.md](skill.md) (ขั้นตอน dev → deploy)

---

## ภาพรวม
ระบบย่อลิงก์ (URL Shortener) สำหรับทีมการตลาด — สร้างลิงก์สั้น `yoalink.com/<alias>`, ติดแท็ก,
แยกสถิติตามช่องทาง/เวลา/อุปกรณ์/โดเมนต้นทาง, มีระบบผู้ใช้ + admin + audit log + anti-bot

## โครงสร้างโฟลเดอร์ (สำคัญ: เป็น 2 git repo แยกกัน)
```
c:\Dev\team-url-shortener\        ← โฟลเดอร์รวม (ไม่ใช่ git repo)
├── backend\    → git repo → gitlab.com/tardev-group/yoalink-backend
└── frontend\   → git repo → gitlab.com/tardev-group/yoalink-frontend
```
> ⚠️ `backend/` และ `frontend/` เป็น **repo แยกกัน** ต้อง commit/push แยก (ดู [skill.md](skill.md))
> โฟลเดอร์ root ไม่ได้อยู่ใน git — ไฟล์ CLAUDE.md/skill.md/work_spec.md นี้จึงไม่ถูก track โดย repo ใด

## Stack
| | Backend | Frontend |
|---|---|---|
| Core | Node + **Express 5** | **React 19** + **Vite 8** |
| Data | **Sequelize 6 + SQLite** (`database.sqlite`) | — |
| Auth | JWT (`jsonwebtoken`) + `bcryptjs` | เก็บ token ใน `localStorage` |
| UI | — | **Tailwind CSS v4**, `sweetalert2`, `react-router-dom v7`, `axios` |
| Security | `helmet`, `express-rate-limit`, anti-bot in-memory | — |
| Lint | — | `oxlint` |

---

## Backend (`backend/`)
- **Entry:** [backend/server.js](backend/server.js) — ผูก associations, middleware, mount routes, redirect handler, `sequelize.sync()` + `app.listen`
- **PORT:** `5000` (hardcode ใน server.js)
- **Env:** `JWT_SECRET` (ใช้ที่ [middleware/auth.js](backend/middleware/auth.js) และ [routes/auth.js](backend/routes/auth.js)) — เก็บใน `.env` (ไม่ขึ้น git)
- **Run:** `npm run dev` (nodemon) / `npm start` (prod ผ่าน PM2 ชื่อ process `yoalink-backend`)

### Routes (mount ใน server.js)
| Prefix | ไฟล์ | หน้าที่ |
|---|---|---|
| `/api/auth` | [routes/auth.js](backend/routes/auth.js) | สมัคร/ล็อกอิน ออก JWT |
| `/api/links` | [routes/links.js](backend/routes/links.js) | CRUD ลิงก์, กรอง/ค้นหา, แท็ก, สถิติต่อลิงก์ |
| `/api/domains` | [routes/domains.js](backend/routes/domains.js) | จัดการโดเมนต้นทาง |
| `/api/admin` | [routes/admin.js](backend/routes/admin.js) | จัดการผู้ใช้/โดเมน/แท็กส่วนกลาง/audit logs (admin only) |
| `GET /:alias` | server.js (inline) | **Redirect** + บันทึกสถิติ 5 โมดูล |

> หมายเหตุ: มีไฟล์ [routes/redirect.js](backend/routes/redirect.js) แต่ redirect จริงเขียน inline ใน server.js — ตรวจก่อนแก้ว่าตัวไหนถูกใช้

### Models ([backend/models/](backend/models/))
- `User`, `Domain`, `Link` (id เป็น **UUID**, `tags` เป็น **JSON array**, `parameter`, `clicks`)
- **สถิติแบบตัวนับสะสม (ไม่มี timestamp รายคลิก):** `LinkChannelStat`, `LinkClickDevice`, `LinkReferrerStat` — 1 แถวต่อ (linkId + มิติ) มี field `clicks`
- **สถิติรายคลิก (มี `createdAt`):** `LinkClickLog` — เก็บ `channel` + `referrerDomain` ต่อคลิก ⇒ **ใช้ตัวนี้เท่านั้นในการกรองตามช่วงเวลา**
- `AuditLog`, `BlockedIp`
- Associations ประกาศรวมใน [server.js](backend/server.js) (ไม่ใช่ในไฟล์ model)

---

## Frontend (`frontend/`)
- **Entry:** [src/main.jsx](frontend/src/main.jsx) → [src/App.jsx](frontend/src/App.jsx) (router)
- **หน้าหลัก:**
  - [src/AuthPage.jsx](frontend/src/AuthPage.jsx) — ล็อกอิน/สมัคร
  - [src/Dashboard.jsx](frontend/src/Dashboard.jsx) — **หัวใจของระบบ (~1000 บรรทัด)** รวมเกือบทุก UI: ตารางลิงก์, สร้างลิงก์, กรองแท็ก/ค้นหา, modal สถิติ (แท็บ ช่องทาง/เวลา/อุปกรณ์/โดเมนต้นทาง), หน้า admin
- **State:** `useState` ล้วน + `axios` ใน `useEffect` (ไม่ได้ใช้ react-query แม้จะติดตั้งไว้)
- **API:** เรียกด้วย path สัมพัทธ์ `/api/...` (default axios) — prod ให้ **nginx proxy `/api` → `:5000`**
  > ⚠️ dev ยัง**ไม่มี Vite proxy** ใน [vite.config.js](frontend/vite.config.js) — ถ้าจะรัน dev แยก ต้องเพิ่ม `server.proxy` ชี้ `/api` → `http://localhost:5000`
- **Run:** `npm run dev` (Vite :5173) / `npm run build` → `dist/` (prod เสิร์ฟผ่าน nginx) / `npm run lint` (oxlint)
- **ธีม:** dark, Tailwind — สีหลัก bg `#0B101B` / `#181E29`, accent น้ำเงิน `#144EE3`, ฟ้า `#61DAFB`

---

## ⚠️ Gotchas ที่ต้องรู้ก่อนแก้
1. **2 repo แยกกัน** — commit/push แยก backend/frontend เสมอ
2. **สถิติสะสมกรองเวลาไม่ได้** — Channel/Device/Referrer Stat เป็นตัวนับ ไม่มี timestamp; ถ้าต้องกรองช่วงเวลาให้ aggregate จาก `LinkClickLog` (มี `createdAt`)
3. **เพิ่มคอลัมน์ DB** — `sequelize.sync()` (server.js:194) เป็น sync ธรรมดา **ไม่ alter ตารางเดิม** → ต้อง `ALTER TABLE` เองบน VPS (ดู [skill.md](skill.md))
4. **แท็ก** เก็บเป็น JSON array และกรองด้วย `LIKE '%tag%'` บน string ที่ serialize → เป็น substring match (อาจ false positive) และ **case-sensitive**
5. **ไฟล์ที่ห้ามขึ้น git** — `.env`, `node_modules/`, `database.sqlite` (มีใน `.gitignore` แล้ว อย่าเผลอ force add)
6. **redirect + สถิติ อยู่ใน server.js** ไม่ใช่ใน routes/ — แก้ logic การนับคลิกที่นี่

## Deploy (VPS: Ubuntu 22 + PM2 + nginx)
- Path: `/var/www/yoalink/backend` และ `/var/www/yoalink/frontend`
- PM2 process: `yoalink-backend`
- ขั้นตอนเต็ม (pull → migrate → restart/build → backup) อยู่ใน [skill.md](skill.md)

## สไตล์โค้ด
- คอมเมนต์/ข้อความ UI เป็น **ภาษาไทย** + emoji (คงสไตล์เดิมเวลาแก้)
- ตั้งชื่อ/รูปแบบให้เข้ากับโค้ดรอบข้าง
