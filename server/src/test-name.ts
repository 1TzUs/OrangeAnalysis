/**
 * 武将名识别测试：自动定位面板底部橙红文字行，做红色通道二值化后 OCR。
 * 先扫描每行橙红像素数，聚类出文字行；再对每张卡的文字框裁剪、放大、二值化、识别。
 */
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { LOCAL_LANG_PATH } from './recognizer.js';
import { matchGeneral } from './match.js';

const IMG = process.argv[2] ?? 'E:/SoftWare/AICoding/Trae/Image/test1.png';

/** 橙红文字像素判定（武将名是橙红色） */
function isOrangeText(r: number, g: number, b: number): boolean {
  return r > 140 && r > g + 40 && r > b + 60 && g > 40 && g < 200;
}

async function main() {
  const src = await sharp(IMG).toBuffer();
  const meta = await sharp(src).metadata();
  const W = meta.width!, H = meta.height!;
  const { data, info } = await sharp(src).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels!;

  // 每个面板：从 y0 到 y1 扫描橙红像素行投影，聚类文字行（面板由分隔线切分）
  // 这里直接对整图扫描，按行统计橙红像素数，找出所有文字行带
  const rowCount = new Array(H).fill(0);
  for (let y = 0; y < H; y++) {
    let c = 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * ch;
      if (isOrangeText(data[i], data[i + 1], data[i + 2])) c++;
    }
    rowCount[y] = c;
  }

  // 聚类行带：连续行，且每行橙红像素数 > 阈值
  const bands: { y0: number; y1: number }[] = [];
  let inBand = false, bs = 0;
  for (let y = 0; y < H; y++) {
    const hit = rowCount[y] > 40;
    if (hit && !inBand) { inBand = true; bs = y; }
    else if (!hit && inBand) {
      if (y - bs > 6) bands.push({ y0: bs, y1: y - 1 });
      inBand = false;
    }
  }
  if (inBand) bands.push({ y0: bs, y1: H - 1 });

  console.log('全图橙红文字行带:');
  for (const b of bands) console.log(`  y=${b.y0}-${b.y1} 高=${b.y1 - b.y0 + 1}`);

  // 卡片列中心（左右各3）
  const leftCols = [158, 352, 545];
  const rightCols = [1640, 1834, 2027];

  const worker = await createWorker('chi_sim', 1, { langPath: LOCAL_LANG_PATH });
  await worker.setParameters({ tessedit_pageseg_mode: '6' });

  // 只处理下半部（武将名区）的橙红行带
  const nameBands = bands.filter((b) => b.y0 > H * 0.5);
  console.log('下半部名字行带:', nameBands.map((b) => `y=${b.y0}-${b.y1}`).join(' '));

  // 把每条文字行带当作一个战斗面板的名字行，对每张卡做 OCR
  for (const band of nameBands) {
    for (const cx of [...leftCols, ...rightCols]) {
      // 卡内文字框：以卡中心左右各 55px，行带内取文字行
      const x0 = cx - 55, x1 = cx + 55;
      const y0 = Math.max(0, band.y0 - 2), y1 = Math.min(H - 1, band.y1 + 2);
      const bw = x1 - x0, bh = y1 - y0;
      const { data: box, info } = await sharp(src)
        .extract({ left: x0, top: y0, width: bw, height: bh })
        .raw().toBuffer({ resolveWithObject: true });
      const bch = info.channels!;
      // 二值化：橙红 -> 黑字，其余 -> 白底
      const bin = Buffer.alloc(bw * bh);
      for (let i = 0; i < bw * bh; i++) {
        const r = box[i * bch], g = box[i * bch + 1], b = box[i * bch + 2];
        bin[i] = isOrangeText(r, g, b) ? 0 : 255;
      }
      const buf = await sharp(bin, { raw: { width: bw, height: bh, channels: 1 } })
        .resize({ width: bw * 6 }).png().toBuffer();
      const rec = await worker.recognize(buf);
      const t = (rec.data.text ?? '').replace(/\s+/g, '').trim();
      const m = matchGeneral(t);
      console.log(`band y=${band.y0}-${band.y1} 卡x=${cx} → 「${t}」${m ? ' →' + m.name : ''}`);
    }
  }
  await worker.terminate();
}

main().catch((e) => { console.error(e); process.exit(1); });