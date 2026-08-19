/**
 * 区域裁剪探针：将指定图片指定区域放大后保存为 PNG，便于人工/浏览器查看
 * 该区域的实际图像内容（用于判断 OCR 漏识别是否为图像质量问题）。
 *
 * 用法: npx tsx src/probe-crop.ts <图片> <x0> <y0> <x1> <y1> <输出png> [scale]
 */
import sharp from 'sharp';

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 6) {
    console.error('用法: npx tsx src/probe-crop.ts <图片> <x0> <y0> <x1> <y1> <输出png> [scale]');
    process.exit(1);
  }
  const [img, x0, y0, x1, y1, out] = args;
  const scale = Number(args[6] ?? 2);
  const ext = x1 - x0;
  const ey = y1 - y0;
  await sharp(img)
    .extract({ left: Number(x0), top: Number(y0), width: ext, height: ey })
    .resize({ width: Math.round(ext * scale), height: Math.round(ey * scale) })
    .png()
    .toFile(out);
  console.log(`已保存 ${out} (裁剪 ${x0},${y0}-${x1},${y1} x${scale})`);
}
main().catch((e) => { console.error(e); process.exit(1); });
