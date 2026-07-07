/* backend/server.js */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const sequelize = require('./db');

// 📦 นำเข้าตารางฐานข้อมูลทั้งหมด
const User = require('./models/User');
const Link = require('./models/Link');
const Domain = require('./models/Domain');
const LinkChannelStat = require('./models/LinkChannelStat'); 
const LinkClickLog = require('./models/LinkClickLog'); 
const LinkClickDevice = require('./models/LinkClickDevice'); 
const LinkReferrerStat = require('./models/LinkReferrerStat')
const AuditLog = require('./models/AuditLog'); 
const BlockedIp = require('./models/BlockedIp'); 

// 🤝 ประกาศผูกความสัมพันธ์ระหว่างตาราง (Associations)
Link.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(Link, { foreignKey: 'userId' });
Link.belongsTo(Domain, { foreignKey: 'domainId' });
Domain.hasMany(Link, { foreignKey: 'domainId' });

Link.hasMany(LinkChannelStat, { foreignKey: 'linkId', onDelete: 'CASCADE' });
LinkChannelStat.belongsTo(Link, { foreignKey: 'linkId' });

Link.hasMany(LinkClickLog, { foreignKey: 'linkId', onDelete: 'CASCADE' });
LinkClickLog.belongsTo(Link, { foreignKey: 'linkId' });

Link.hasMany(LinkClickDevice, { foreignKey: 'linkId', onDelete: 'CASCADE' });
LinkClickDevice.belongsTo(Link, { foreignKey: 'linkId' });

Link.hasMany(LinkReferrerStat, { foreignKey: 'linkId', onDelete: 'CASCADE' });
LinkReferrerStat.belongsTo(Link, { foreignKey: 'linkId' });

const app = express();
app.set('trust proxy', 1);
app.use(helmet()); 
app.disable('x-powered-by'); 

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, 
  max: 150, 
  message: { message: '🛑 ยิงคำสั่งถี่เกินไปแล้วลูกพี่! กรุณารอ 15 นาทีค่อยลองใหม่นะ' },
  standardHeaders: true, 
  legacyHeaders: false, 
});

app.use(cors());
app.use(express.json());

// 🔀 เส้นทาง API หลังบ้าน
app.use('/api/', apiLimiter); 
app.use('/api/auth', require('./routes/auth'));
app.use('/api/links', require('./routes/links'));
app.use('/api/domains', require('./routes/domains'));
app.use('/api/admin', require('./routes/admin'));

// 🚀 ให้ redirect.js รับจบเรื่องการจัดการลิงก์ย่อหน้าบ้านทั้งหมด
app.use('/', require('./routes/redirect'));

const PORT = 5000;
// 🔥 ใส่ { alter: true } เพื่อบังคับให้มันสร้างคอลัมน์ใหม่ที่ขาดไป
sequelize.sync({ alter: true }).then(() => {
  console.log('📦 Database Tables Synced Successfully!');
  app.listen(PORT, () => {
    console.log(`🚀 Yoalink Core Backend running on port ${PORT}`);
  });
}).catch(err => {
  console.error('❌ Failed to sync database:', err);
});