/**
 * 红度识别模块：识别武将名称上方的勾玉数量（0-5 红）。
 *
 * 勾玉特征（已实测确认）：
 *  - 橙红色实心小图标，颜色统一（rgb ~200,127,73），不随红度变化；
 *  - 紧贴武将名正上方的窄带内横向等间距排列；
 *  - 勾玉是空心结构，连通域会拆成「大面积主块 + 1~3px 内部散点」，
 *    计数时只统计大面积主块，剔除散点碎片；
 *  - 数量即红度（上限 5）。
 */
import sharp from 'sharp';
import type { General } from './recognizer.js';

/** 连通域内一个橙红色块 */
interface Block {
  minX: number;
  maxX: number;
  area: number;
}

/** 判定橙红色（勾玉专属色，区别于立绘/UI 其它红） */
function isMagColor(r: number, g: number, b: number): boolean {
  return r > 170 && g > 95 && g < 165 && b < 100 && r - g > 50 && r - b > 90;
}

/** 在给定区域内做橙红色连通域，返回所有块 */
async function collectBlocks(imagePath: string, x0: number, y0: number, x1: number, y1: number): Promise<Block[]> {
  const { data, info } = await sharp(imagePath)
    .extract({ left: x0, top: y0, width: x1 - x0, height: y1 - y0 })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const visited = new Uint8Array(W * H);
  const out: Block[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (visited[i] || !isMagColor(data[i * 3], data[i * 3 + 1], data[i * 3 + 2])) continue;
      const stack: Array<[number, number]> = [[x, y]];
      visited[i] = 1;
      let minX = x, maxX = x, area = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop()!;
        area++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H || visited[ny * W + nx]) continue;
          if (isMagColor(data[(ny * W + nx) * 3], data[(ny * W + nx) * 3 + 1], data[(ny * W + nx) * 3 + 2])) {
            visited[ny * W + nx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      out.push({ minX: minX + x0, maxX: maxX + x0, area });
    }
  }
  return out;
}

/**
 * 识别单个武将的红度。
 * @param imagePath 图片绝对路径
 * @param g 武将（含 x 中心、y 名顶、nameW 名宽、nameH 名高）
 */
export async function countRedForGeneral(imagePath: string, g: General): Promise<number> {
  const nameH = g.nameH;
  const nameW = g.nameW;
  if (!nameH || !nameW) return 0;

  // 勾玉尺寸按武将名高度缩放
  const estW = Math.round(nameH * 0.6);    // 勾玉宽 ≈ 0.6*名高
  const estH = Math.round(nameH * 0.8);    // 勾玉高 ≈ 0.8*名高
  const estSpace = Math.round(nameH * 0.8); // 勾玉中心距 ≈ 0.8*名高

  // 扫描带：武将名正上方。x 范围按最多 5 个勾玉的排列外扩：
  // 2×勾玉中心距覆盖到最左/最右勾玉的中心，再外扩半个勾玉宽容纳勾玉本体，
  // 避免边缘勾玉被截断导致面积下降、漏计。
  const halfW = Math.round(estW / 2);
  const x0 = Math.max(0, g.x - 2 * estSpace - halfW);
  const x1 = g.x + 2 * estSpace + halfW;
  const y0 = Math.max(0, g.y - Math.round(nameH * 1.0));
  const y1 = Math.max(0, g.y - Math.round(nameH * 0.1));
  if (y1 <= y0) return 0;

  const blocks = await collectBlocks(imagePath, x0, y0, x1, y1);

  // 只统计大面积主块（勾玉实心主体），剔除散点碎片。
  // 阈值取 0.1×勾玉面积：散点仅 1~5px，真实勾玉 ~150px，差距悬殊，
  // 0.1 既能过滤散点，又不会误删稍小/被截断的真实勾玉。
  const minArea = Math.max(estW * estH * 0.1, 12);
  let n = 0;
  for (const b of blocks) {
    if (b.area < minArea) continue;
    const w = b.maxX - b.minX + 1;
    n += w <= estW * 1.5 ? 1 : Math.round(w / estSpace); // 粘连宽块按间距拆分
  }
  return Math.min(n, 5);
}