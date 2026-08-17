/** 调试：打印面板内金色像素列投影，帮助设计卡片列检测 */
import sharp from 'sharp';

const IMG = 'E:/SoftWare/AICoding/Trae/Image/test1.png';

function isGold(r: number, g: number, b: number): boolean {
  return r > 120 && r < 200 && g > 95 && g < 160 && b > 40 && b < 120 && r > g && g >= b;
}

async function main() {
  const { data, info } = await sharp(IMG).raw().toBuffer({ resolveWithObject: true });
  const W = info.width!, H = info.height!;
  const ch = info.channels;

  const panels = [[0, 192], [193, 583], [584, 977]];
  for (const [y0, y1] of panels) {
    const h = y1 - y0;
    const yStart = y0 + Math.round(h * 0.45);
    const col = new Array(W).fill(0);
    for (let y = yStart; y < y1; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * ch;
        if (isGold(data[i], data[i + 1], data[i + 2])) col[x]++;
      }
    }
    // 打印左/右武将区逐列投影（定位卡片边界）
    const regions = [[20, 740, '左'], [1340, 2060, '右']];
    for (const [xa, xb, tag] of regions) {
      console.log('\n  [' + tag + '] 面板 y=' + y0 + '-' + y1 + ' 逐列金色计数:');
      let line = '';
      for (let x = xa; x < xb; x++) {
        if (col[x] > 0) line += x + ':' + col[x] + ' ';
      }
      console.log(line);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });