/**
 * 调试：打印面板边界与卡片列中心，用于设计识别区域。
 */
import sharp from 'sharp';
import { detectPanels, detectCardColumns, readPixelsForDebug } from './recognizer.js';

async function main() {
  const img = process.argv[2] ?? 'E:/SoftWare/AICoding/Trae/Image/test1.png';
  const src = await sharp(img).toBuffer();
  const { width, height, data, channels } = await readPixelsForDebug(src);
  console.log(`size=${width}x${height}`);
  const panels = detectPanels(width, height, data, channels);
  console.log('panels:', JSON.stringify(panels));
  for (const p of panels) {
    const cards = detectCardColumns(width, p, data, channels);
    console.log(`panel y=${p.y0}-${p.y1} h=${p.y1 - p.y0} left=${JSON.stringify(cards.left)} right=${JSON.stringify(cards.right)}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });