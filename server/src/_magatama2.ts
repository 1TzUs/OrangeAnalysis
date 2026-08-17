/**
 * 临时脚本：精细连通域分析武将立绘上方区域，推断勾玉(红度)形状与数量。
 */
import sharp from 'sharp';

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
  // 小图标：面积 8~3000
  const icons = comps.filter((c) => c.area >= 8 && c.area <= 3000)
    .sort((a, b) => a.minY - b.minY || a.minX - b.minX);
  console.log(`\n===== ${label} 色块 ${icons.length} 个 =====`);
  for (const c of icons) {
    const w = c.maxX - c.minX + 1, h = c.maxY - c.minY + 1;
    console.log(`  原图y[${c.minY}+${box.t}..${c.maxY}+${box.t}] x[${c.minX}+${box.l}..${c.maxX}+${box.l}] 尺寸${w}x${h} 面积${c.area} rgb(${c.r},${c.g},${c.b})`);
  }
}

// PC test1 诸葛亮(x~94-211) 上方区域：覆盖 x[0-650] y[80-165]
await analyze('E:/SoftWare/AICoding/Trae/Image/PC/test1.png', { l: 0, t: 80, w: 650, h: 90 }, 'PC test1 左武将上方 y80-170');