/** 探查指定图指定结果锚点下方的武将带 OCR 内容 */
import { ocrImage, ocrRegionService } from './ocrService.js';

const img = process.argv[2] ?? 'E:/SoftWare/AICoding/Trae/Image/PE/portrait/test6.jpg';
const anchorIdx = Number(process.argv[3] ?? 0);

const lines = await ocrImage(img, 1.3);
const anchors = lines.filter((l) => '胜败平'.includes(l.text.trim()) && l.y1 - l.y0 >= 55).sort((a, b) => a.y0 - b.y0);
const a = anchors[anchorIdx];
console.log(`锚点 #${anchorIdx}: "${a.text}" y=${a.y0}-${a.y1}`);
const genTop = Math.max(0, a.y1 - 15);
const genBot = genTop + 120;
const band = await ocrRegionService(img, { x0: 0, y0: genTop, x1: 1080, y1: genBot }, 2);
console.log(`=== 武将带区域 y=${genTop}-${genBot} 全部 OCR 行 ===`);
for (const l of band.sort((p, q) => p.y0 - q.y0)) {
  console.log(`  y=${l.y0}-${l.y1} x=${l.x0}-${l.x1} conf=${l.conf.toFixed(2)} | "${l.text}"`);
}