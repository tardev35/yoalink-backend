/* backend/utils/lineLink.js — ตรวจว่า URL ปลายทางเป็นโดเมน LINE หรือไม่ */

// โดเมนฐานของ LINE (ครอบ subdomain ด้วย เช่น liff.line.me / page.line.me)
const LINE_DOMAINS = ['line.me', 'lin.ee'];

function isLineLink(url) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    return LINE_DOMAINS.some(d => host === d || host.endsWith('.' + d));
  } catch (e) {
    return false;
  }
}

module.exports = { isLineLink, LINE_DOMAINS };
