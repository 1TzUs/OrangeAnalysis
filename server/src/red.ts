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

/** 解码后的整图原始像素（用于在内存中按子区域采样，避免逐武将重复解码整图） */
interface RawImage {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

// 原始像素缓存：一次解析中同一张图会被多个武将反复取色，
// 原实现对每个武将都重新 sharp().toBuffer() 解码整张图，极其耗时。
// 这里缓存解码后的原始像素，同一图内直接内存切片，像素完全一致，精度零影响。
const RAW_CACHE = new Map<string, RawImage>();
const RAW_CACHE_MAX = 2;

async function getRaw(imagePath: string): Promise<RawImage | null> {
  const cached = RAW_CACHE.get(imagePath);
  if (cached) return cached;
  const { data, info } = await sharp(imagePath).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const raw: RawImage = { data, width: info.width, height: info.height, channels: info.channels || 3 };
  if (RAW_CACHE.size >= RAW_CACHE_MAX) {
    const first = RAW_CACHE.keys().next().value;
    if (first !== undefined) RAW_CACHE.delete(first);
  }
  RAW_CACHE.set(imagePath, raw);
  return raw;
}

/** 在给定区域内做橙红色连通域，返回所有块（从整图原始像素中内存切片，不再重复解码） */
async function collectBlocks(imagePath: string, x0: number, y0: number, x1: number, y1: number): Promise<Block[]> {
  const raw = await getRaw(imagePath);
  if (!raw) return [];
  const { data, channels } = raw;
  const W = x1 - x0;
  const H = y1 - y0;
  const visited = new Uint8Array(W * H);
  const out: Block[] = [];
  // 子区域在整图原始缓冲区中的首行偏移
  const base = (y0 * raw.width + x0) * channels;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (visited[i]) continue;
      const off = base + (y * raw.width + x) * channels;
      if (!isMagColor(data[off], data[off + 1], data[off + 2])) continue;
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
          // 邻居像素绝对偏移：base 已含子区域左上角 (y0,x0) 的偏移，
          // 只叠加相对坐标 (ny,nx)*raw.width，绝不能再加 y0/x0，否则越界读错。
          const off2 = base + (ny * raw.width + nx) * channels;
          if (isMagColor(data[off2], data[off2 + 1], data[off2 + 2])) {
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