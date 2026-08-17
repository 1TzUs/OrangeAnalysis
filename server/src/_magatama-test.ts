/**
 * 临时脚本：连通域+形状过滤精确数勾玉(红度)。
 * 勾玉特征：小尺寸橙红块，宽高比~0.7，尺寸随武将名高度缩放。
 */
import sharp from 'sharp';
import { ocrRegionService } from './ocrService.js';
import { matchGeneral } from './match.js';

function isMag(r: number, g: number, b: number): boolean {
  return r > 170 && g > 95 && g < 165 && b < 100 && r - g > 50 && r - b > 90;
}

/** 在带内做连通域，返回橙红块列表 */
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

/** 数勾玉：只统计大面积主块（勾玉实心主体），剔除内部散点碎片 */
function countMags(blocks: Array<{ minX: number; maxX: number; area: number }>, estW: number, estH: number, estSpace: number): number {
  const minArea = estW * estH * 0.25; // 主块阈值，剔除1x1碎片
  const bigs = blocks.filter((b) => b.area >= minArea);
  let n = 0;
  for (const c of bigs) {
    const w = c.maxX - c.minX + 1;
    if (w <= estW * 1.5) n += 1;
    else n += Math.round(w / estSpace); // 粘连宽块按间距拆分
  }
  return n;
}

async function run(path: string, ocrBox: { x0: number; y0: number; x1: number; y1: number }, label: string) {
  const lines = await ocrRegionService(path, ocrBox, 1.5);
  console.log(`\n===== ${label} =====`);
  for (const l of lines) {
    const m = matchGeneral(l.text.trim());
    if (!m) continue;
    const genCX = Math.round((l.x0 + l.x1) / 2);
    const nameH = l.y1 - l.y0;
    const estW = Math.round(nameH * 0.6);   // 勾玉宽 ≈ 0.6*名高
    const estH = Math.round(nameH * 0.8);   // 勾玉高 ≈ 0.8*名高
    const estSpace = Math.round(nameH * 0.8); // 勾玉中心距 ≈ 0.8*名高
    const bw = Math.round(estSpace * 3.2);   // 横向半宽
    const bt = Math.round(nameH * 0.95);     // 上方带高
    const x0 = Math.max(0, genCX - bw), x1 = genCX + bw;
    const y0 = Math.max(0, l.y0 - bt), y1 = Math.max(0, l.y0 - Math.round(nameH * 0.1));
    if (y1 <= y0) { console.log(`  ${m.name} 带无效`); continue; }
    const blocks = await comps(path, x0, y0, x1, y1);
    const n = countMags(blocks, estW, estH, estSpace);
    console.log(`  ${m.name}(${l.text.trim()}) 名高${nameH} estW${estW} → 勾玉${n} 块数${blocks.length}`);
  }
}

await run('E:/SoftWare/AICoding/Trae/Image/PC/test1.png', { x0: 0, y0: 140, x1: 2144, y1: 200 }, 'PC test1');
await run('E:/SoftWare/AICoding/Trae/Image/PE/portrait/test1.jpg', { x0: 0, y0: 450, x1: 1080, y1: 495 }, 'PE portrait test1');