// 🔥 ผูกความสัมพันธ์ตารางสถิติช่องทาง
Link.hasMany(LinkChannelStat, { foreignKey: 'linkId', onDelete: 'CASCADE' });
LinkChannelStat.belongsTo(Link, { foreignKey: 'linkId' });