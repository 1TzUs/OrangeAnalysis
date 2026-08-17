/**
 * 高倍灰度 OCR 测试：紧裁剪名字区域，8x 放大 + 锐化 + 对比度增强后识别。
 */
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { LOCAL_LANG_PATH } from './recognizer.js';

const IMG = process.argv[2] ?? 'E:/SoftWare/AICoding/Trae/Image/test1.png';

async function main() {
  const src = await sharp(IMG).toBuffer();
  const worker = await createWorker('chi_sim', 1, { langPath: LOCAL_LANG_PATH });
  await worker.setParameters({ tessedit_pageseg_mode: '6' });

  // 名字区域：y 508-530，每卡单独裁剪，x 取卡中心 ±55
  const cols = [
    { name: 'p2-left1', cx: 158 },
    { name: 'p2-left2', cx: 352 },
    { name: 'p2-left3', cx: 545 },
    { name: 'p2-right1', cx: 1640 },
    { name: 'p2-right2', cx: 1834 },
    { name: 'p2-right3', cx: 2027 },
    { name: 'p1-left1', cx: 158, top: 119 },
    { name: 'p1-left2', cx: 352, top: 119 },
    { name: 'p1-left3', cx: 545, top: 119 },
    { name: 'p1-right1', cx: 1640, top: 119 },
    { name: 'p1-right2', cx: 1834, top: 119 },
    { name: 'p1-right3', cx: 2027, top: 119 },
  ];
  for (const c of cols) {
    const top = c.top ?? 508, hgt = 24;
    const crop = { left: c.cx - 58, top, width: 116, height: hgt };
    const buf = await sharp(src).extract(crop)
      .resize({ width: Math.round(116 * 8) })
      .grayscale().normalize().sharpen()
      .png().toBuffer();
    const { data } = await worker.recognize(buf);
    const t = (data.text ?? '').replace(/\s+/g, '').trim();
    console.log(c.name + ' → 「' + t + '」');
  }
  await worker.terminate();
}
main().catch((e) => { console.error(e); process.exit(1); });