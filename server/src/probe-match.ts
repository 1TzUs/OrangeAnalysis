/** 用与 batch 完全相同的武将带，show 所有行 + matchGeneral 结果 */
import { ocrImage, ocrRegionService } from './ocrService.js';
import { matchGeneral } from './match.js';

const img = process.argv[2] ?? 'E:/SoftWare/AICoding/Trae/Image/PE/portrait/test13.jpg';
const anchorIdx = Number(process.argv[3] ?? 0);

const lines = await ocrImage(img, 1.3);
const anchors = lines.filter((l) => '胜败平'.includes(l.text.trim()) && l.y1 - l.y0 >= 55).sort((a, b) => a.y0 - b.y0);
const a = anchors[anchorIdx];
const genTop = Math.max(0, a.y1 - 15);
const genBot = genTop + 80;
console.log(`锚点 #${anchorIdx} "${a.text}" y=${a.y0}-${a.y1}; 武将带 ${genTop}-${genBot}`);
const band = await ocrRegionService(img, { x0: 0, y0: genTop, x1: 1080, y1: genBot }, 2);
for (const l of band.sort((p, q) => p.y0 - q.y0)) {
  const m = matchGeneral(l.text.trim());
  console.log(`  y=${l.y0}-${l.y1} x=${l.x0}-${l.x1} | "${l.text.trim()}" => ${m ? m.name : 'null'}`);
}