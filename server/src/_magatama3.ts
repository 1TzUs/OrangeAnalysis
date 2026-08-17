/**
 * 临时脚本：分析 PC 右侧武将 + PE 竖屏武将上方的勾玉色块，确认颜色与排列规律。
 */
import sharp from 'sharp';
import { ocrRegionService } from './ocrService.js';

async function analyze(path: string, box: { l: number; t: number; w: number; h: number }, label: string) {
  const { data, info } = await sharp(path)
    .extract({ left: box.l, top: box.t, width: box.w, height: box.h })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const idx = (x: number, y: number) => y * W + x;
  const visited = new Uint8Array(W * H);
  const isSat = (x: number, y: number) => {
    const i = idx(x, y) * 3;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return Math.max(r, g, b) - Math.min(r, g, b) > 60;
  };
  const comps: any[] = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (visited[i] || !isSat(x, y)) continue;
    const stack = [[x, y]]; visited[i] = 1;
    let minX = x, maxX = x, minY = y, maxY = y, area = 0, sr = 0, sg = 0, sb = 0;
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      area++; const ii = idx(cx, cy) * 3;
      sr += data[ii]; sg += data[ii + 1]; sb += data[ii + 2];
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || visited[idx(nx, ny)]) continue;
        if (isSat(nx, ny)) { visited[idx(nx, ny)] = 1; stack.push([nx, ny]); }
      }
    }
    comps.push({ minX, minY, maxX, maxY, area, r: Math.round(sr / area), g: Math.round(sg / area), b: Math.round(sb / area) });
  }
  // 只保留形状规则的横向小图标（宽高比 0.5~2，面积 300~900 的矩形状）
  const icons = comps.filter((c) => {
    const w = c.maxX - c.minX + 1, h = c.maxY - c.minY + 1;
    return c.area >= 300 && c.area <= 900 && w / h > 0.5 && w / h < 2.2;
  }).sort((a, b) => a.minY - b.minY || a.minX - b.minX);
  console.log(`\n===== ${label} 规则小图标 ${icons.length} 个 =====`);
  for (const c of icons) {
    const w = c.maxX - c.minX + 1, h = c.maxY - c.minY + 1;
    console.log(`  原图y[${c.minY + box.t}-${c.maxY + box.t}] x[${c.minX + box.l}-${c.maxX + box.l}] ${w}x${h} rgb(${c.r},${c.g},${c.b})`);
  }
}

// PC test1 右侧武将上方
await analyze('E:/SoftWare/AICoding/Trae/Image/PC/test1.png', { l: 650, t: 80, w: 1494, h: 90 }, 'PC test1 右侧 y80-170');

// PE 竖屏：先 OCR 顶部定位武将名
console.log('\n--- PE portrait test1 顶部 OCR ---');
const lines = await ocrRegionService('E:/SoftWare/AICoding/Trae/Image/PE/portrait/test1.jpg', { x0: 0, y0: 0, x1: 1080, y1: 700 }, 1.5);
for (const l of lines) console.log(`  y[${l.y0}-${l.y1}] x[${l.x0}-${l.x1}] "${l.text}"`);