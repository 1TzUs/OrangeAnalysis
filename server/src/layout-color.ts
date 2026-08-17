/**
 * 颜色分类 ASCII 渲染：把区域像素按颜色类别输出，便于盲看布局。
 * 类别: R=橙红文字  G=金边框  B=蓝  W=亮底  .==暗底  灰=其他
 */
import sharp from 'sharp';

const [IMG, x0s, y0s, x1s, y1s, cs, rs] = process.argv.slice(2);
const x0 = +x0s, y0 = +y0s, x1 = +x1s, y1 = +y1s;
const COLS = +(cs ?? 80), ROWS = +(rs ?? 30);

function classify(r: number, g: number, b: number): string {
  // 橙红文字
  if (r > 140 && r > g + 40 && r > b + 60 && g > 40 && g < 200) return 'R';
  // 金色边框
  if (r > 120 && r < 200 && g > 95 && g < 200 && b > 40 && b < 130 && r > g && g >= b) return 'G';
  // 蓝色
  if (b > 120 && b > r + 30 && b > g + 30) return 'B';
  // 亮底
  if (r > 200 && g > 200 && b > 200) return 'W';
  // 暗底
  if (r < 60 && g < 60 && b < 60) return '.';
  return 'o';
}

async function main() {
  const { data } = await sharp(IMG)
    .extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 })
    .resize({ width: COLS, height: ROWS, fit: 'fill' })
    .raw().toBuffer({ resolveWithObject: true });
  const ch = 3;
  const pxW = (x1 - x0) / COLS, pxH = (y1 - y0) / ROWS;
  let out = `region x[${x0},${x1}) y[${y0},${y1}) grid=${COLS}x${ROWS}\n`;
  for (let y = 0; y < ROWS; y++) {
    let line = String(Math.round(y0 + y * pxH)).padStart(4) + ' ';
    for (let x = 0; x < COLS; x++) {
      const i = (y * COLS + x) * ch;
      line += classify(data[i], data[i + 1], data[i + 2]);
    }
    out += line + '\n';
  }
  console.log(out);
}
main().catch((e) => { console.error(e); process.exit(1); });