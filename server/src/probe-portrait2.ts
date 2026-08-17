/** 探针：验证竖屏布局下，基于整图 OCR 行提取同盟名/武将/结果锚点的可行性 */
import { ocrImage } from './ocrService.js';

const img = process.argv[2] ?? 'E:/SoftWare/AICoding/Trae/Image/PE/portrait/test1.jpg';
const lines = await ocrImage(img, 1.3);
const sorted = [...lines].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);

// 结果锚点：恰为 胜/败/平 且高度 >= 55
const anchors = sorted.filter((l) => '胜负平'.includes(l.text.trim()) && l.y1 - l.y0 >= 55);
console.log('=== 结果锚点 ===');
for (const a of anchors) console.log(`  "${a.text}" y=${a.y0}-${a.y1} h=${a.y1 - a.y0}`);

// 同盟候选：>=2字、非数字、非底部、非结果
const hpPat = /^\d+\s*\/\s*\d+$/;
const cands = sorted.filter((l) => {
  const t = l.text.trim();
  if ([...t].length < 2) return false;
  if (/^\d/.test(t)) return false;
  if (hpPat.test(t)) return false;
  return !/进攻|防守/.test(t) && !/年月/.test(t) && !/\d{4}\//.test(t);
});
console.log('\n=== 全部候选行（含玩家名/同盟名） ===');
for (const l of cands) console.log(`  y=${l.y0} x=${l.x0}-${l.x1} | "${l.text}"`);