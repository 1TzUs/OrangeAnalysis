/**
 * 临时脚本：精细确认勾玉排列。裁剪武将名正上方区域，输出所有饱和色块。
 */
import sharp from 'sharp';

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
    return Math.max(r, g, b) - Math.min(r, g, b) > 50;
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
  const icons = comps.filter((c) => c.area >= 200).sort((a, b) => a.minY - b.minY || a.minX - b.minX);
  console.log(`\n===== ${label} 色块(${icons.length}) =====`);
  for (const c of icons) {
    const w = c.maxX - c.minX + 1, h = c.maxY - c.minY + 1;
    console.log(`  y[${c.minY + box.t}-${c.maxY + box.t}] x[${c.minX + box.l}-${c.maxX + box.l}] ${w}x${h} a${c.area} rgb(${c.r},${c.g},${c.b})`);
  }
}

// PC 右侧诸葛亮(x1972-2093)上方
await analyze('E:/SoftWare/AICoding/Trae/Image/PC/test1.png', { l: 1900, t: 90, w: 244, h: 70 }, 'PC test1 右侧诸葛亮上方 y90-160');
// PE portrait test1 武将名(y458-484)上方 y410-460
await analyze('E:/SoftWare/AICoding/Trae/Image/PE/portrait/test1.jpg', { l: 0, t: 410, w: 1080, h: 50 }, 'PE portrait test1 武将名上方 y410-460');