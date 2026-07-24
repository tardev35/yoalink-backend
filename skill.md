# skill.md — Playbook การพัฒนา & Deploy (Yoalink)

รวมขั้นตอนที่ทำซ้ำบ่อย เพื่อพัฒนาต่อได้เร็วและปลอดภัย (production รันอยู่จริง)
อ่านคู่กับ [CLAUDE.md](CLAUDE.md) (โครงสร้างระบบ) และ [work_spec.md](work_spec.md) (สเปกฟีเจอร์)

---

## 🧩 1. รันโปรเจกต์ (Local)
```bash
# Backend (port 5000)
cd backend && npm install && npm run dev

# Frontend (port 5173)
cd frontend && npm install && npm run dev
```
> ถ้า dev แยกแล้ว API 404: เพิ่ม proxy ใน `frontend/vite.config.js`
> ```js
> export default defineConfig({ plugins:[tailwindcss(), react()],
>   server: { proxy: { '/api': 'http://localhost:5000' } } })
> ```

---

## 🌿 2. เพิ่มฟีเจอร์ / แก้บั๊ก แล้ว commit + push (2 repo แยกกัน)
```bash
# ---- Backend ----
cd /c/Dev/team-url-shortener/backend
git add -A
git commit -m "ข้อความสื่อความหมาย"
git push origin main         # origin = GitLab (github = remote เดิมสำรอง)

# ---- Frontend ----
cd /c/Dev/team-url-shortener/frontend
git add -A
git commit -m "ข้อความสื่อความหมาย"
git push origin main
```
> ⚠️ working directory ของ shell ค้างข้าม cd — ต้อง `cd` เข้า repo ให้ถูกก่อน commit/push ทุกครั้ง

Remote ของแต่ละ repo:
- `origin` → `gitlab.com/tardev-group/yoalink-{backend,frontend}` (ใช้จริง)
- `github` → `github.com/tardev35/...` (บัญชีโดนแบน เก็บไว้อ้างอิงเฉยๆ)

---

## 🚀 3. Deploy ขึ้น VPS (Ubuntu 22 + PM2 + nginx)
```bash
# Backend
cd /var/www/yoalink/backend
git pull
npm install                       # เฉพาะตอนมี dependency ใหม่
pm2 restart yoalink-backend

# Frontend
cd /var/www/yoalink/frontend
git pull
npm install                       # เฉพาะตอนมี dependency ใหม่
npm run build                     # nginx เสิร์ฟจาก dist/
```
เช็คสถานะ: `pm2 status` / `pm2 logs yoalink-backend`

---

## 🗄️ 4. เพิ่ม/แก้คอลัมน์ DB (Migration แบบ manual)
`sequelize.sync()` **ไม่** เพิ่มคอลัมน์ให้ตารางเดิม → ต้อง ALTER เอง (ปลอดภัย ไม่ลบข้อมูล)
```bash
cd /var/www/yoalink/backend
sqlite3 database.sqlite ".tables"                    # ดูชื่อตารางจริงก่อน (Sequelize เติม s ท้าย)
sqlite3 database.sqlite "ALTER TABLE \`ชื่อตาราง\` ADD COLUMN \`คอลัมน์ใหม่\` VARCHAR;"
pm2 restart yoalink-backend
```
> ทำ **ก่อน** restart เสมอ ไม่งั้นการเขียนข้อมูลลงคอลัมน์ใหม่จะ error
> ตัวอย่างที่เคยทำ: `ALTER TABLE LinkClickLogs ADD COLUMN referrerDomain VARCHAR;`

---

## 💾 5. Backup ก่อนเทส/ก่อน deploy ของเสี่ยง
```bash
cd /var/www/yoalink/backend
pm2 stop yoalink-backend                             # หยุดก่อนเพื่อ copy DB ให้ครบถ้วน
mkdir -p /var/www/yoalink/backend/backups
cp database.sqlite backups/db_$(date +%Y%m%d_%H%M).sqlite

cd /var/www/
tar -czvf yoalink_backup_$(date +%Y%m%d_%H%M).tar.gz \
  --exclude='node_modules' --exclude='.git' --exclude='dist' yoalink/

pm2 start yoalink-backend                            # ⭐ ห้ามลืมเปิดคืน!
```

## ♻️ 6. Restore เมื่อพัง
```bash
# คืน database
pm2 stop yoalink-backend
cp /var/www/yoalink/backend/backups/db_<STAMP>.sqlite /var/www/yoalink/backend/database.sqlite
pm2 start yoalink-backend

# คืนโค้ด (เลือกวิธีใดวิธีหนึ่ง)
git reset --hard <commit-hash>            # ย้อน commit บน repo
# หรือแตก tar: tar -xzf /var/www/yoalink_backup_<STAMP>.tar.gz -C /var/www/
```

---

## ✅ Checklist ก่อน push ทุกครั้ง
- [ ] แก้ถูก repo (backend vs frontend) และ commit แยกถูกตัว
- [ ] ไม่มี `.env` / `node_modules` / `database.sqlite` หลุด (`git status` เช็ก)
- [ ] มีเพิ่มคอลัมน์ DB ไหม? ถ้ามี → เตรียมคำสั่ง ALTER สำหรับ VPS (ข้อ 4)
- [ ] เป็นการแก้ frontend เท่านั้น? อย่าลืม `npm run build` ตอน deploy
- [ ] ข้อความ commit สื่อความหมาย
