/**
 * 探针脚本：对竖屏截图整图 OCR，输出按 y 排序的文本行，用于理解布局。
 * 用法: npx tsx src/probe-portrait.ts <imgPath>
 */
import { ocrImage } from './ocrService.js';

const img = process.argv[2] ?? 'E:/SoftWare/AICoding/Trae/Image/PE/portrait/test1.jpg';
const lines = await ocrImage(img, 1.3);
const sorted = [...lines].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
console.log(`=== ${img} 共 ${sorted.length} 行 (W注: 原图1080x2376) ===`);
for (const l of sorted) {
  console.log(`y=${String(l.y0).padStart(4)} y1=${String(l.y1).padStart(4)} x0=${String(l.x0).padStart(4)} x1=${String(l.x1).padStart(4)} | ${JSON.stringify(l.text)}`);
}