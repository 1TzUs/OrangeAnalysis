/**
 * 时间识别探针：对指定截图做整图 OCR，打印所有匹配时间格式的行（含坐标），
 * 以及最终解析出的每场战斗时间，用于判断"图里无时间"还是"识别/提取失败"。
 *
 * 用法: npx tsx src/probe-time.ts <图片路径> [更多图片...]
 */
import { ocrImage, ocrRegionService } from './ocrService.js';
import { TIME_PAT, parseBattleImage } from './recognizer.js';
import { parsePortraitImage } from './recognizer-portrait.js';

/** 探针单图：打印整图 OCR 时间行 + 解析结果时间 */
async function probe(img: string) {
  console.log(`\n========== ${img} ==========`);
  const allLines = await ocrImage(img, 1.3);
  const timeLines = allLines.filter((l) => TIME_PAT.test(l.text));
  console.log(`[整图OCR] 匹配时间格式的行 ${timeLines.length} 条:`);
  for (const l of timeLines) {
    console.log(`  y=${l.y0}-${l.y1}  x=${l.x0}-${l.x1}  "${l.text}" (conf=${l.conf})`);
  }
  if (!timeLines.length) {
    // 打印底部 200px 内所有行，辅助判断时间是否存在
    const H = Math.max(...allLines.map((l) => l.y1), 0);
    const bottom = allLines.filter((l) => l.y0 >= H - 200);
    console.log(`[整图OCR] 未匹配时间行，底部200px内共 ${bottom.length} 行:`);
    for (const l of bottom) {
      console.log(`  y=${l.y0}-${l.y1}  "${l.text}"`);
    }
  }
  const parser = img.toLowerCase().includes('portrait') ? parsePortraitImage : parseBattleImage;
  const r = await parser(img);
  r.battles.forEach((b, i) => {
    console.log(`[解析] 战斗${i + 1} 结果=${b.resultText} 时间="${b.time}" panel y=${b.panel.y0}-${b.panel.y1}`);
  });
  // 对最后一场做底部区域高倍 OCR，验证底部小字时间能否被识别
  const last = r.battles[r.battles.length - 1];
  if (last) {
    const meta = { w: r.imageWidth, h: r.imageHeight };
    const y0 = Math.max(0, last.panel.y1 - 200);
    const reg = await ocrRegionService(img, { x0: 0, y0, x1: meta.w, y1: meta.h }, 2);
    const tl = reg.filter((l) => TIME_PAT.test(l.text));
    console.log(`[底部区域OCR y=${y0}-${meta.h}] 匹配时间行 ${tl.length} 条:`);
    for (const l of tl) console.log(`  y=${l.y0}-${l.y1}  "${l.text}"`);
    if (!tl.length) {
      console.log(`  底部区域全部行（${reg.length} 条，前 20）:`);
      for (const l of reg.slice(0, 20)) console.log(`    y=${l.y0}-${l.y1}  "${l.text}"`);
    }
  }
}

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('用法: npx tsx src/probe-time.ts <图片路径> [更多...]');
    process.exit(1);
  }
  for (const f of files) {
    try {
      await probe(f);
    } catch (e) {
      console.error(`  [异常] ${(e as Error).message}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
