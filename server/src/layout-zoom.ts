/**
 * 局部高分辨率色图：聚焦某个区域看细节（卡片边框、文字位置）。
 * 用法: layout-zoom <img> <x0> <y0> <x1> <y1> <cols> <rows>
 */
import sharp from 'sharp';

const [IMG, x0s, y0s, x1s, y1s, cs, rs] = process.argv.slice(2);
const x0 = +x0s, y0 = +y0s, x1 = +x1s, y1 = +y1s;
const COLS = +(cs ?? 120), ROWS = +(rs ?? 40);
const W = x1 - x0, H = y1 - y0;

async function main() {
  const { data } = await sharp(IMG)
    .extract({ left: x0, top: y0, width: W, height: H })
    .resize({ width: COLS, height: ROWS, fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let out = `region x[${x0},${x1}) y[${y0},${y1}) grid=${COLS}x${ROWS}\n`;
  const pxW = W / COLS, pxH = H / ROWS;
  for (let y = 0; y < ROWS; y++) {
    let line = String(Math.round(y0 + y * pxH)).padStart(4) + ' ';
    for (let x = 0; x < COLS; x++) {
      const i = (y * COLS + x) * 3;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      let c = ':';
      if (r > 180 && g < 130 && b < 130 && r > g + 60 && r > b + 60) c = 'R';
      else if (r > 120 && r < 200 && g > 95 && g < 165 && b > 40 && b < 120 && r > g && g >= b) c = 'G';
      else if (r > 200 && g > 200 && b > 200) c = '.';
      else if (r < 60 && g < 60 && b < 60) c = '#';
      line += c;
    }
    out += line + '\n';
  }
  console.log(out);
}

main().catch((e) => { console.error(e); process.exit(1); });