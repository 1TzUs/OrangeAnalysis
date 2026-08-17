/**
 * 图像布局分析脚本：通过像素颜色分析定位战报中的关键元素。
 * - 红色像素（胜/败标记）
 * - 金色像素（武将头像卡片边框）
 * 输出各行分布，用于确定面板边界与武将卡片位置。
 */
import sharp from 'sharp';

const IMG = process.argv[2] ?? 'E:/SoftWare/AICoding/Trae/Image/test1.png';

type RGB = { r: number; g: number; b: number };

/** 判断是否接近目标颜色 */
function near(c: RGB, t: RGB, tol: number): boolean {
  return Math.abs(c.r - t.r) <= tol && Math.abs(c.g - t.g) <= tol && Math.abs(c.b - t.b) <= tol;
}

async function main() {
  const meta = await sharp(IMG).metadata();
  const W = meta.width!;
  const H = meta.height!;
  const { data, info } = await sharp(IMG).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;

  // 红色：鲜明红（胜/败标记通常为红字）
  const RED = { r: 200, g: 40, b: 40 };
  // 金色：头像卡片边框（金黄）
  const GOLD = { r: 210, g: 165, b: 60 };

  const redRows = new Array(H).fill(0);
  const redCols = new Array(W).fill(0);
  const goldRows = new Array(H).fill(0);
  const goldCols = new Array(W).fill(0);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * ch;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (near({ r, g, b }, RED, 55) && r > g + 60 && r > b + 60) {
        redRows[y]++; redCols[x]++;
      } else if (near({ r, g, b }, GOLD, 45) && r > g && g > b) {
        goldRows[y]++; goldCols[x]++;
      }
    }
  }

  console.log(`尺寸 ${W}x${H}`);

  // 输出红色像素的行分布（只打印有内容的部分）
  console.log('\n=== 红色标记 行分布（>0 的连续段）===');
  printSegments(redRows, H, 'red');
  console.log('\n=== 金色边框 行分布（>阈值的连续段）===');
  printSegments(goldRows, H, 'gold');
}

/** 打印行分布中超过阈值且连续的段 */
function printSegments(arr: number[], H: number, label: string) {
  let start = -1;
  const th = 3; // 行内至少3个该颜色像素才算有效行
  for (let y = 0; y <= H; y++) {
    const active = y < H && arr[y] >= th;
    if (active && start < 0) start = y;
    if (!active && start >= 0) {
      if (y - start > 5) {
        const peak = rangeMax(arr, start, y);
        console.log(`${label}: y=[${start}, ${y}) 峰值=${peak}`);
      }
      start = -1;
    }
  }
}

function rangeMax(arr: number[], a: number, b: number): number {
  let m = 0;
  for (let i = a; i < b; i++) if (arr[i] > m) m = arr[i];
  return m;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});