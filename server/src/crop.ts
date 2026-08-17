/**
 * 裁剪调试脚本：将战报截图按红色标记分段裁剪成多个面板区域，
 * 保存为临时PNG，便于浏览器直接查看精确布局。
 */
import sharp from 'sharp';

const IMG = 'E:/SoftWare/AICoding/Trae/Image/test1.png';
const OUT = 'E:/SoftWare/AICoding/Trae/three/server/tmp';

async function main() {
  const meta = await sharp(IMG).metadata();
  const W = meta.width!;
  const H = meta.height!;
  console.log(`尺寸 ${W}x${H}`);

  // 红色标记所在的行段（来自 analyze.ts）
  const redBands: [number, number][] = [
    [93, 198],
    [349, 382],
    [515, 589],
    [876, 900],
  ];

  // 依据红色标记推断面板：以红色段中心为锚点，划分面板
  const anchors = redBands.map(([a, b]) => Math.round((a + b) / 2));

  // 面板边界：取相邻锚点中点，首尾取图片边界
  const bounds: [number, number][] = [];
  bounds.push([0, anchors.length ? Math.round((anchors[0] + anchors[1]) / 2) : H]);
  for (let i = 1; i < anchors.length - 1; i++) {
    bounds.push([Math.round((anchors[i - 1] + anchors[i]) / 2), Math.round((anchors[i] + anchors[i + 1]) / 2)]);
  }
  if (anchors.length >= 2) {
    bounds.push([Math.round((anchors[anchors.length - 2] + anchors[anchors.length - 1]) / 2), H]);
  }

  console.log('面板边界:', JSON.stringify(bounds));

  // 保存每个面板裁剪图
  for (let i = 0; i < bounds.length; i++) {
    const [y0, y1] = bounds[i];
    const h = y1 - y0;
    const out = `${OUT}/panel${i + 1}.png`;
    await sharp(IMG).extract({ left: 0, top: y0, width: W, height: h }).toFile(out);
    console.log(`存 ${out}  (y=${y0}-${y1}, h=${h})`);
  }

  // 存整图缩略图
  await sharp(IMG).resize({ width: 1200 }).toFile(`${OUT}/full_small.png`);
  console.log('存缩略图完成');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});