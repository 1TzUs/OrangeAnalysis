/**
 * 布局色图脚本：把整张战报截图降采样成 ASCII 色图，
 * 用 R=红 / G=金 / .=亮 / #=暗 / :=中性 表示每个网格单元，
 * 帮助人工或 AI 理解整体排版（面板、卡片、结果区位置）。
 */
import sharp from 'sharp';

const IMG = process.argv[2] ?? 'E:/SoftWare/AICoding/Trae/Image/test1.png';
const COLS = 140;

async function main() {
  const meta = await sharp(IMG).metadata();
  const W = meta.width!, H = meta.height!;
  const rows = Math.round((H * COLS) / W);
  const { data } = await sharp(IMG)
    .resize({ width: COLS, height: rows, fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = 3;
  let out = `W=${W} H=${H} grid=${COLS}x${rows}\n`;
  for (let y = 0; y < rows; y++) {
    let line = String(y).padStart(3) + ' ';
    for (let x = 0; x < COLS; x++) {
      const i = (y * COLS + x) * ch;
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