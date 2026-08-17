/**
 * 临时脚本：打印武将名上方带内所有橙红块，分析噪声来源。
 */
import sharp from 'sharp';

function isMag(r: number, g: number, b: number): boolean {
  return r > 170 && g > 95 && g < 165 && b < 100 && r - g > 50 && r - b > 90;
}

async function comps(path: string, x0: number, y0: number, x1: number, y1: number) {
  const { data, info } = await sharp(path)
    .extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;
  const idx = (x: number, y: number) => y * W + x;
  const visited = new Uint8Array(W * H);
  const out: Array<{ minX: number; minY: number; maxX: number; maxY: number; area: number }> = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (visited[i] || !isMag(data[i * 3], data[i * 3 + 1], data[i * 3 + 2])) continue;
    const stack = [[x, y]]; visited[i] = 1;
    let minX = x, maxX = x, minY = y, maxY = y, area = 0;
    while (stack.length) {
      const [cx, cy] = stack.pop()!;
      area++;
      if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
      if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || visited[idx(nx, ny)]) continue;
        if (isMag(data[idx(nx, ny) * 3], data[idx(nx, ny) * 3 + 1], data[idx(nx, ny) * 3 + 2])) {
          visited[idx(nx, ny)] = 1; stack.push([nx, ny]);
        }
      }
    }
    out.push({ minX: minX + x0, minY: minY + y0, maxX: maxX + x0, maxY: maxY + y0, area });
  }
  return out;
}

// PC 诸葛亮名 x94-211 y152-188。带：x[70-235] y[115-150]
const blocks = await comps('E:/SoftWare/AICoding/Trae/Image/PC/test1.png', 70, 115, 235, 150);
console.log(`PC 诸葛亮带内橙红块 ${blocks.length} 个：`);
for (const b of blocks.sort((a, b) => a.minX - b.minX)) {
  const w = b.maxX - b.minX + 1, h = b.maxY - b.minY + 1;
  console.log(`  x[${b.minX}-${b.maxX}] y[${b.minY}-${b.maxY}] ${w}x${h} a${b.area}`);
}

// PE 周瑜名 x124-179 y458-484。带 x[90-200] y[435-457]
const blocks2 = await comps('E:/SoftWare/AICoding/Trae/Image/PE/portrait/test1.jpg', 90, 435, 200, 457);
console.log(`\nPE 周瑜带内橙红块 ${blocks2.length} 个：`);
for (const b of blocks2.sort((a, b) => a.minX - b.minX)) {
  const w = b.maxX - b.minX + 1, h = b.maxY - b.minY + 1;
  console.log(`  x[${b.minX}-${b.maxX}] y[${b.minY}-${b.maxY}] ${w}x${h} a${b.area}`);
}