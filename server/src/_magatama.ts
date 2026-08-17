/**
 * 临时脚本：连通域分析武将带顶部区域，输出强饱和小色块（候选勾玉/红度图标）。
 * 同时用 OCR 定位武将名行，便于判断色块是否位于武将名上方。
 */
import sharp from 'sharp';
import { ocrRegionService } from './ocrService.js';

async function analyze(path: string, box: { l: number; t: number; w: number; h: number }, label: string) {
  const { data, info } = await sharp(path)
    .extract({ left: box.l, top: box.t, width: box.w, height: box.h })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const idx = (x: number, y: number) => y * W + x;
  const visited = new Uint8Array(W * H);

  const isSat = (x: number, y: number) => {
    const i = idx(x, y) * 3;
    const r = data[i], g = data[i + 1], b = data[i + 2];
    return Math.max(r, g, b) - Math.min(r, g, b) > 60;
  };

  const comps: Array<{ minX: number; minY: number; maxX: number; maxY: number; area: number; r: number; g: number; b: number }> = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = idx(x, y);
      if (visited[i] || !isSat(x, y)) continue;
      // BFS
      const stack = [[x, y]];
      visited[i] = 1;
      let minX = x, maxX = x, minY = y, maxY = y, area = 0, sr = 0, sg = 0, sb = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        area++;
        const ii = idx(cx, cy) * 3;
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
  }

  // 过滤：小图标（面积 30~4000），排除巨大立绘/整块UI
  const icons = comps.filter((c) => c.area >= 30 && c.area <= 4000);
  console.log(`\n===== ${label} 候选小色块 ${icons.length} 个 =====`);
  // 按 y 分组，观察行分布
  const rows = new Map<number, typeof icons>();
  for (const c of icons) { const ry = Math.floor(c.minY / 15); if (!rows.has(ry)) rows.set(ry, []); rows.get(ry)!.push(c); }
  for (const [ry, list] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    const xs = list.map((c) => `${c.minX}-${c.maxX}(a${c.area},r${c.r})`).join(' ');
    console.log(`  y=${ry * 15}-${ry * 15 + 14} 共${list.length}: ${xs}`);
  }
}

// PC test1 顶部
await analyze('E:/SoftWare/AICoding/Trae/Image/PC/test1.png', { l: 0, t: 0, w: 2144, h: 300 }, 'PC test1 顶部');
console.log('\n--- PC test1 武将带 OCR（定位武将名行） ---');
const genTop = 60; // 结果字下沿附近，粗略
const lines = await ocrRegionService('E:/SoftWare/AICoding/Trae/Image/PC/test1.png', { x0: 0, y0: 0, x1: 2144, y1: 300 }, 1.5);
for (const l of lines) {
  console.log(`  y[${l.y0}-${l.y1}] x[${l.x0}-${l.x1}] "${l.text}"`);
}