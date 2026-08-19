/**
 * 区域详查探针：打印指定图片指定 y 区域的高倍 OCR 全部行，
 * 用于核对"武将带漏识别"与"底部时间是否存在"等识别问题。
 *
 * 用法: npx tsx src/probe-zone.ts <图片> <y0> <y1> [scale]
 *   - scale 默认 2
 */
import { ocrRegionService } from './ocrService.js';
import sharp from 'sharp';

/** 对指定区域打印 OCR 全部行 */
async function probe(img: string, y0: number, y1: number, scale: number) {
  const meta = await sharp(img).metadata();
  console.log(`\n===== ${img} (${meta.width}x${meta.height}) 区域 y=${y0}-${y1} scale=${scale} =====`);
  const lines = await ocrRegionService(img, { x0: 0, y0, x1: meta.width!, y1 }, scale);
  console.log(`共 ${lines.length} 行:`);
  lines.sort((a, b) => a.y0 - b.y0).forEach((l) => {
    console.log(`  y=${l.y0}-${l.y1}  x=${l.x0}-${l.x1}  "${l.text}" (${l.conf.toFixed(2)})`);
  });
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    console.error('用法: npx tsx src/probe-zone.ts <图片> <y0> <y1> [scale]');
    process.exit(1);
  }
  await probe(args[0], Number(args[1]), Number(args[2]), Number(args[3] ?? 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
