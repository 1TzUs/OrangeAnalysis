/**
 * 布局检测脚本：通过金色边框连通域分析，定位武将头像卡片矩形。
 * 输出每个面板、每个武将卡片的位置，用于后续精确裁剪 OCR。
 */
import sharp from 'sharp';

const IMG = process.argv[2] ?? 'E:/SoftWare/AICoding/Trae/Image/test1.png';

type Rect = { x: number; y: number; w: number; h: number };

/** 判断是否为金色（头像卡片边框） */
function isGold(r: number, g: number, b: number): boolean {
  return r > 140 && g > 90 && g < 200 && b < 110 && r > g && g >= b;
}

/** 判断是否为红色（胜/败 标记） */
function isRed(r: number, g: number, b: number): boolean {
  return r > 150 && r > g + 60 && r > b + 60;
}

async function main() {
  const meta = await sharp(IMG).metadata();
  const W = meta.width!;
  const H = meta.height!;
  const { data, info } = await sharp(IMG).raw().toBuffer({ resolveWithObject: true });
  const ch = info.channels;

  const goldMask = new Uint8Array(W * H);
  const redMask = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * ch;
      goldMask[y * W + x] = isGold(data[i], data[i + 1], data[i + 2]) ? 1 : 0;
      redMask[y * W + x] = isRed(data[i], data[i + 1], data[i + 2]) ? 1 : 0;
    }
  }

  // 连通域标记（金色）
  const comps = connectedComponents(goldMask, W, H);

  // 过滤出卡片边框：面积较大、宽高比接近卡片
  const cards: Rect[] = [];
  for (const c of comps) {
    if (c.area < 200) continue;
    // 卡片边框是空心矩形，这里用外接框即可
    cards.push({ x: c.minX, y: c.minY, w: c.maxX - c.minX + 1, h: c.maxY - c.minY + 1 });
  }

  // 按 y 聚类为面板，按 x 排序
  const sorted = [...cards].sort((a, b) => a.y - b.y || a.x - b.x);
  console.log('=== 金色连通域卡片矩形 ===');
  for (const c of sorted) {
    console.log(`panel? x=${c.x} y=${c.y} w=${c.w} h=${c.h}  (中心 x=${c.x + c.w / 2}, y=${c.y + c.h / 2})`);
  }

  // 红色连通域（胜/败标记）
  const redComps = connectedComponents(redMask, W, H);
  console.log('\n=== 红色连通域 ===');
  for (const c of redComps) {
    if (c.area < 30) continue;
    console.log(`x=${c.minX} y=${c.minY} w=${c.maxX - c.minX + 1} h=${c.maxY - c.minY + 1} area=${c.area} 中心y=${(c.minY + c.maxY) / 2}`);
  }
}

// 4-连通域标记
function connectedComponents(mask: Uint8Array, W: number, H: number) {
  const visited = new Uint8Array(W * H);
  const comps: { area: number; minX: number; minY: number; maxX: number; maxY: number }[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = y * W + x;
      if (mask[idx] && !visited[idx]) {
        let area = 0, minX = x, maxX = x, minY = y, maxY = y;
        const stack = [idx];
        visited[idx] = 1;
        while (stack.length) {
          const cur = stack.pop()!;
          const cx = cur % W, cy = (cur / W) | 0;
          area++;
          if (cx < minX) minX = cx; if (cx > maxX) maxX = cx;
          if (cy < minY) minY = cy; if (cy > maxY) maxY = cy;
          // 4邻域
          const nb = [
            cy > 0 ? cur - W : -1,
            cy < H - 1 ? cur + W : -1,
            cx > 0 ? cur - 1 : -1,
            cx < W - 1 ? cur + 1 : -1,
          ];
          for (const n of nb) {
            if (n >= 0 && mask[n] && !visited[n]) { visited[n] = 1; stack.push(n); }
          }
        }
        comps.push({ area, minX, minY, maxX, maxY });
      }
    }
  }
  comps.sort((a, b) => b.area - a.area);
  return comps;
}

main().catch((e) => { console.error(e); process.exit(1); });