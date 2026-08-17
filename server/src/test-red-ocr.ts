/**
 * 红色文字 OCR 测试：把裁剪区域中红色像素二值化为黑字、其余为白底，
 * 验证对武将名（红色三字）的识别效果。
 */
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { LOCAL_LANG_PATH } from './recognizer.js';

const IMG = process.argv[2] ?? 'E:/SoftWare/AICoding/Trae/Image/test1.png';

/** 判断是否为红色文字像素 */
function isRedText(r: number, g: number, b: number): boolean {
  // 亮红：红通道显著高于绿/蓝
  return r > 150 && r > g + 60 && r > b + 60;
}

/** 把 crop 区域内的红色像素二值化为黑字白底，返回待识别 buffer */
async function redBinary(img: Buffer, crop: { left: number; top: number; width: number; height: number }, scale = 4): Promise<Buffer> {
  const meta = await sharp(img).metadata();
  const W = meta.width!, H = meta.height!;
  const left = Math.max(0, Math.min(crop.left, W - 1));
  const top = Math.max(0, Math.min(crop.top, H - 1));
  const width = Math.max(1, Math.min(crop.width, W - left));
  const height = Math.max(1, Math.min(crop.height, H - top));
  const { data, info } = await sharp(img)
    .extract({ left, top, width, height })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = info.channels!;
  const out = Buffer.alloc(width * height);
  for (let i = 0; i < width * height; i++) {
    const r = data[i * ch], g = data[i * ch + 1], b = data[i * ch + 2];
    out[i] = isRedText(r, g, b) ? 0 : 255;
  }
  // 放大 + 平滑，交给 tesseract 识别
  return sharp(out, { raw: { width, height, channels: 1 } })
    .resize({ width: Math.round(width * scale) })
    .png()
    .toBuffer();
}

async function main() {
  const src = await sharp(IMG).toBuffer();
  const worker = await createWorker('chi_sim', 1, { langPath: LOCAL_LANG_PATH });
  await worker.setParameters({ tessedit_pageseg_mode: '6' });

  // 面板2 第一张左卡：x≈90-210, y≈500-530
  const crops: Record<string, { left: number; top: number; width: number; height: number }> = {
    'panel2-card1': { left: 90, top: 498, width: 120, height: 35 },
    'panel2-card2': { left: 285, top: 498, width: 130, height: 35 },
    'panel2-card3': { left: 480, top: 498, width: 130, height: 35 },
    'panel2-right1': { left: 1575, top: 498, width: 130, height: 35 },
    'panel2-right2': { left: 1770, top: 498, width: 130, height: 35 },
    'panel2-right3': { left: 1965, top: 498, width: 130, height: 35 },
    'panel1-card1': { left: 90, top: 114, width: 120, height: 35 },
    'panel1-right1': { left: 1575, top: 114, width: 130, height: 35 },
  };
  for (const [name, crop] of Object.entries(crops)) {
    const buf = await redBinary(src, crop, 4);
    // 保存二值图供诊断
    await sharp(buf).toFile('tmp/red_' + name + '.png');
    if (name === 'panel2-card1') {
      await sharp(buf).resize({ width: 120 }).toFile('tmp/red_diag.png');
    }
    const { data } = await worker.recognize(buf);
    console.log(name + '  →  「' + (data.text ?? '').replace(/\s+/g, '').trim() + '」');
  }
  await worker.terminate();
}

main().catch((e) => { console.error(e); process.exit(1); });