/**
 * 临时脚本：分析武将带顶部区域的彩色小色块（勾玉/红度）分布。
 * 在两块区域扫描，找出强饱和色（红/金/白）像素聚类，推断勾玉位置与颜色。
 */
import sharp from 'sharp';

interface Pix { r: number; g: number; b: number; x: number; y: number; }

async function scan(path: string, box: { l: number; t: number; w: number; h: number }, label: string) {
  const { data, info } = await sharp(path)
    .extract({ left: box.l, top: box.t, width: box.w, height: box.h })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  const pix: Pix[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 3;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max - min;
      // 强饱和：区分于浅色背景
      if (sat > 60) pix.push({ r, g, b, x, y });
    }
  }
  console.log(`\n===== ${label}（${W}x${H}）强饱和像素 ${pix.length} =====`);
  // 按颜色粗分类统计
  const clusters: Record<string, number> = {};
  for (const p of pix) {
    const key = p.r > p.g + 40 && p.r > p.b + 40 ? '红' : p.g > p.r + 40 && p.g > p.b + 40 ? '绿' : p.b > p.r + 40 && p.b > p.g + 40 ? '蓝' : '其它';
    clusters[key] = (clusters[key] || 0) + 1;
  }
  console.log('颜色分类:', clusters);
  // 按 y 分桶（每 20px），看色块垂直分布
  const yBuckets: Record<number, number> = {};
  for (const p of pix) { const by = Math.floor(p.y / 20); yBuckets[by] = (yBuckets[by] || 0) + 1; }
  console.log('y分桶(每20px):', Object.entries(yBuckets).map(([k, v]) => `${k*20}-${k*20+19}:${v}`).join(', '));
  // 输出前 40 个红色像素的坐标范围（粗看勾玉区域）
  const reds = pix.filter((p) => p.r > p.g + 40 && p.r > p.b + 40);
  if (reds.length) {
    const xs = reds.map((p) => p.x), ys = reds.map((p) => p.y);
    console.log(`红色像素范围 x:[${Math.min(...xs)}..${Math.max(...xs)}] y:[${Math.min(...ys)}..${Math.max(...ys)}] 数量${reds.length}`);
  }
}

// PC test1 顶部
await scan('E:/SoftWare/AICoding/Trae/Image/PC/test1.png', { l: 0, t: 0, w: 2144, h: 300 }, 'PC test1 顶部');
// PE portrait test1 顶部
await scan('E:/SoftWare/AICoding/Trae/Image/PE/portrait/test1.jpg', { l: 0, t: 0, w: 1080, h: 500 }, 'PE portrait test1 顶部');