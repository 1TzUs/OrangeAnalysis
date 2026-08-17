/**
 * 像素采样：打印指定区域内出现频率最高的颜色，用于判断文字真实颜色。
 */
import sharp from 'sharp';

const IMG = process.argv[2] ?? 'E:/SoftWare/AICoding/Trae/Image/test1.png';
const X0 = +(process.argv[3] ?? 100), Y0 = +(process.argv[4] ?? 500);
const X1 = +(process.argv[5] ?? 190), Y1 = +(process.argv[6] ?? 528);

async function main() {
  const { data } = await sharp(IMG)
    .extract({ left: X0, top: Y0, width: X1 - X0, height: Y1 - Y0 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const ch = 3;
  const W = X1 - X0, H = Y1 - Y0;
  // 统计显著颜色（量化为 32 步）
  const hist = new Map<string, number>();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * ch;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = (r >> 5) + ',' + (g >> 5) + ',' + (b >> 5);
      hist.set(key, (hist.get(key) ?? 0) + 1);
    }
  }
  const arr = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  console.log('区域', X0, Y0, X1, Y1, ' 总像素', W * H);
  for (const [k, c] of arr.slice(0, 20)) {
    const [r, g, b] = k.split(',').map((n) => (+n) * 32);
    console.log('  rgb≈', r, g, b, ' 计数', c, ' ' + (c / (W * H) * 100).toFixed(1) + '%');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });