// 🟢 1. API: สร้างลิงก์ย่อ (ระบบหั่น URL + สุ่ม Alias อัตโนมัติ 4 ตัวอักษร)
router.post('/', auth, async (req, res) => {
  try {
    let { originalUrl, alias, tags } = req.body;

    // 🎲 ฟังก์ชันสำหรับสุ่มตัวอักษร [a-z, 0-9] จำนวน 4 ตัว
    const generateRandomAlias = () => {
      const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < 4; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return result;
    };

    // 🔥 ตรวจสอบว่าผู้ใช้ได้กรอก Alias มาไหม? ถ้าไม่กรอก (หรือส่งค่าว่างมา) ให้สุ่มอัตโนมัติ
    if (!alias || alias.trim() === '') {
      let isUnique = false;
      let randomAlias = '';
      
      // วนลูปเช็กจนกว่าจะชัวร์ว่าไม่ซ้ำกับใครในฐานข้อมูล
      while (!isUnique) {
        randomAlias = generateRandomAlias();
        const checkExist = await Link.findOne({ where: { alias: randomAlias } });
        if (!checkExist) {
          isUnique = true; // ถ้าไม่เจอในระบบ แปลว่าใช้ได้! ให้หลุดลูป
        }
      }
      alias = randomAlias;
    } else {
      // กรณีกรอกมาเอง ให้เช็กซ้ำตามปกติ
      const existingAlias = await Link.findOne({ where: { alias } });
      if (existingAlias) {
        return res.status(400).json({ message: 'ชื่อ Alias นี้มีคนใช้งานแล้ว กรุณาเปลี่ยนใหม่' });
      }
    }

    // ตรวจสอบและเติมโปรโตคอล URL
    if (!/^https?:\/\//i.test(originalUrl)) {
      originalUrl = 'https://' + originalUrl;
    }

    // ระบบแยกส่วนประกอบ URL อัจฉริยะ
    const urlObj = new URL(originalUrl);
    const rootDomain = urlObj.hostname;
    const parameter = urlObj.search;
    const baseUrl = originalUrl.split('?')[0];

    // จัดการคัดแยกตารางโดเมน
    let domainRecord = await Domain.findOne({ where: { name: rootDomain, createdBy: req.user.id } });
    if (!domainRecord) {
      domainRecord = await Domain.create({ name: rootDomain, createdBy: req.user.id });
    }

    const tagsArray = tags ? tags.split(',').map(tag => tag.trim()) : [];

    // บันทึกลงฐานข้อมูล
    const newLink = await Link.create({
      alias: alias.toLowerCase(), // บังคับเป็นตัวพิมพ์เล็กเพื่อความเป็นระเบียบของ URL
      originalUrl: baseUrl, 
      parameter: parameter, 
      tags: tagsArray,
      domainId: domainRecord.id,
      createdBy: req.user.id
    });

    res.status(201).json(newLink);
  } catch (error) {
    console.error('Create Link Error:', error);
    res.status(500).json({ message: 'รูปแบบ URL ไม่ถูกต้อง หรือเซิร์ฟเวอร์เกิดข้อผิดพลาด' });
  }
});