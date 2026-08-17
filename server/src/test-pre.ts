/**
 * 名字 OCR 预处理对比：测试不同预处理方法在正确名字区域上的识别效果。
 * 方法: red-binary / grayscale-norm / invert-red / full-color
 */
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { LOCAL_LANG_PATH } from './recognizer.js';

const IMG = process.argv[2] ?? 'E:/SoftWare/AICoding/Trae/Image/test1.png';

function isRedText(r: number, g: number, b: number): boolean {
  return r > 150 && r > g + 60 && r > b + 60;
}

/** 方法1：红像素→黑，其余→白 */
async function redBinary(img: Buffer, c: Crop, scale: number): Promise<Buffer> {
  const { data, info } = await sharp(img).extract(c).raw().toBuffer({ resolveWithObject: true });
  const chw = info.channels!;
  const out = Buffer.alloc(c.width * c.height);
  for (let i = 0; i < c.width * c.height; i++) {
    const r = data[i * chw], g = data[i * chw + 1], b = data[i * chw + 2];
    out[i] = isRedText(r, g, b) ? 0 : 255;
  }
  return sharp(out, { raw: { width: c.width, height: c.height, channels: 1 } })
    .resize({ width: Math.round(c.width * scale) }).png().toBuffer();
}

/** 方法2：灰度 + 归一化（保留自然笔画） */
async function grayNorm(img: Buffer, c: Crop, scale: number): Promise<Buffer> {
  return sharp(img).extract(c).resize({ width: Math.round(c.width * scale) })
    .grayscale().normalize().png().toBuffer();
}

/** 方法3：反色（红字变亮字，黑底） + 灰度 */
async function invertGray(img: Buffer, c: Crop, scale: number): Promise<Buffer> {
  return sharp(img).extract(c).resize({ width: Math.round(c.width * scale) })
    .grayscale().normalize().negate().png().toBuffer();
}

type Crop = { left: number; top: number; width: number; height: number };

async function main() {
  const src = await sharp(IMG).toBuffer();
  const worker = await createWorker('chi_sim', 1, { langPath: LOCAL_LANG_PATH });
  await worker.setParameters({ tessedit_pageseg_mode: '6' });

  const crops: Record<string, Crop> = {
    'p2-left1': { left: 95, top: 500, width: 130, height: 35 },
    'p2-left2': { left: 290, top: 500, width: 130, height: 35 },
    'p2-left3': { left: 485, top: 500, width: 130, height: 35 },
    'p2-right1': { left: 1580, top: 500, width: 130, height: 35 },
    'p2-right2': { left: 1775, top: 500, width: 130, height: 35 },
    'p1-left1': { left: 95, top: 116, width: 130, height: 35 },
    'p1-right1': { left: 1580, top: 116, width: 130, height: 35 },
  };
  const methods: [string, (img: Buffer, c: Crop, s: number) => Promise<Buffer>][] = [
    ['red-binary', redBinary],
    ['gray-norm', grayNorm],
    ['invert-gray', invertGray],
  ];
  for (const [name, crop] of Object.entries(crops)) {
    for (const [mname, fn] of methods) {
      const buf = await fn(src, crop, 4);
      const { data } = await worker.recognize(buf);
      const t = (data.text ?? '').replace(/\s+/g, '').trim();
      console.log(name + ' [' + mname + '] → 「' + t + '」');
    }
  }
  await worker.terminate();
}

main().catch((e) => { console.error(e); process.exit(1); });