/**
 * 灰度亮度图：把区域转灰度后按亮度分层输出，用于观察字符笔画结构。
 * 分层:  .低暗(0-60)  :中暗(60-120)  o中亮(120-180)  #亮(180-255)
 */
import sharp from 'sharp';

const [IMG, x0s, y0s, x1s, y1s, cs, rs] = process.argv.slice(2);
const x0 = +x0s, y0 = +y0s, x1 = +x1s, y1 = +y1s;
const COLS = +(cs ?? 60), ROWS = +(rs ?? 30);

async function main() {
  const { data } = await sharp(IMG)
    .extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 })
    .resize({ width: COLS, height: ROWS, fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pxW = (x1 - x0) / COLS, pxH = (y1 - y0) / ROWS;
  let out = `region x[${x0},${x1}) y[${y0},${y1}) grid=${COLS}x${ROWS}\n`;
  for (let y = 0; y < ROWS; y++) {
    let line = String(Math.round(y0 + y * pxH)).padStart(4) + ' ';
    for (let x = 0; x < COLS; x++) {
      const v = data[y * COLS + x];
      line += v < 60 ? '.' : v < 120 ? ':' : v < 180 ? 'o' : '#';
    }
    out += line + '\n';
  }
  console.log(out);
}
main().catch((e) => { console.error(e); process.exit(1); });