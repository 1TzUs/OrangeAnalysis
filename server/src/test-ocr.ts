/**
 * OCR 测试脚本 v2：对指定图片做预处理（放大、灰度、二值化）后，
 * 用 Tesseract 中文识别，输出带坐标的文本块，用于分析面板真实布局。
 */
import path from 'node:path';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';

const IMG = process.argv[2] ?? 'E:/SoftWare/AICoding/Trae/three/server/tmp/panel1.png';
const SCALE = parseFloat(process.argv[3] ?? '2');

async function main() {
  const meta = await sharp(IMG).metadata();
  console.log('原图:', meta.width, 'x', meta.height);

  // 预处理：放大 SCALE 倍，灰度，可选自适应阈值
  const pre = `tmp/pre_${path.basename(IMG)}.png`;
  await sharp(IMG)
    .resize({ width: Math.round(meta.width! * SCALE) })
    .grayscale()
    .normalize()
    .toFile(pre);
  console.log('预处理图:', pre);

  const worker = await createWorker('chi_sim', 1, {
    langPath: 'https://tessdata.projectnaptha.com/4.0.0',
  });
  await worker.setParameters({ tessedit_pageseg_mode: '6' }); // 每行
  const { data } = await worker.recognize(pre);

  const words: { text: string; x: number; y: number; w: number; h: number }[] = [];
  for (const b of data.blocks ?? []) {
    for (const p of b.paragraphs ?? []) {
      for (const l of p.lines ?? []) {
        for (const w of l.words ?? []) {
          if (w.text.trim()) {
            words.push({
              text: w.text,
              x: w.bbox?.x0 ?? 0, y: w.bbox?.y0 ?? 0,
              w: (w.bbox?.x1 ?? 0) - (w.bbox?.x0 ?? 0),
              h: (w.bbox?.y1 ?? 0) - (w.bbox?.y0 ?? 0),
            });
          }
        }
      }
    }
  }
  words.sort((a, b) => a.y - b.y || a.x - b.x);
  console.log('\n=== OCR 结果（÷' + SCALE + ' 还原坐标）===');
  for (const w of words) {
    console.log('[x=' + Math.round(w.x / SCALE) + ' y=' + Math.round(w.y / SCALE) + '] ' + w.text);
  }
  await worker.terminate();
}

main().catch((e) => { console.error(e); process.exit(1); });