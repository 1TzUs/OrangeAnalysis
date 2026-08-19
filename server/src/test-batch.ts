/**
 * 批量回归测试脚本：遍历 Image 目录下横屏/竖屏测试截图，调用对应识别管线，
 * 输出每张图的战斗摘要与问题标记，并将详细结果写入 tmp/batch-result.json。
 *
 * 用法: npx tsx src/test-batch.ts [pc|landscape|portrait|all]
 *   - pc        Image/PC 横屏（test*.png + fold/* + unfolded/*）
 *   - landscape Image/PE/landscape 横屏（jpg）
 *   - portrait  Image/PE/portrait 竖屏（jpg）
 *   - all       （默认）全部
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseBattleImage, ParseResult } from './recognizer.js';
import { parsePortraitImage } from './recognizer-portrait.js';

const IMAGE_ROOT = 'E:/SoftWare/AICoding/Trae/Image';
// 脚本自身目录（src/），结果写到 server/tmp/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_FILE = path.resolve(__dirname, '../tmp/batch-result.json');

interface BattleView {
  result: string;
  leftAlliance: string;
  rightAlliance: string;
  time: string;
  leftGenerals: string[];
  rightGenerals: string[];
  leftRed: number[];
  rightRed: number[];
  leftHp: string;
  rightHp: string;
}

interface ImageResult {
  mode: string;
  file: string;
  size: string;
  battles: BattleView[];
  problems: string[];
}

/** 收集某模式下的待测图片路径列表 */
function collectFiles(mode: string): string[] {
  const dirs: Record<string, string[]> = {
    pc: [
      `${IMAGE_ROOT}/PC`,
      `${IMAGE_ROOT}/PC/fold`,
      `${IMAGE_ROOT}/PC/unfolded`,
    ],
    landscape: [`${IMAGE_ROOT}/PE/landscape`],
    portrait: [`${IMAGE_ROOT}/PE/portrait`],
  };
  const list: string[] = [];
  for (const d of dirs[mode] ?? []) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      if (/\.(png|jpe?g|webp|bmp)$/i.test(f)) list.push(path.join(d, f));
    }
  }
  return list.sort();
}

/** 对单个解析结果做摘要与问题标记 */
function summarize(mode: string, file: string, r: ParseResult): ImageResult {
  const img: ImageResult = {
    mode,
    file,
    size: `${r.imageWidth}x${r.imageHeight}`,
    battles: [],
    problems: [],
  };
  if (!r.battles.length) img.problems.push('未解析出任何战斗');
  r.battles.forEach((b, i) => {
    const bv: BattleView = {
      result: b.resultText || b.result,
      leftAlliance: b.leftAlliance,
      rightAlliance: b.rightAlliance,
      time: b.time,
      leftGenerals: b.leftGenerals.map((g) => g.name),
      rightGenerals: b.rightGenerals.map((g) => g.name),
      leftRed: b.leftGenerals.map((g) => g.red),
      rightRed: b.rightGenerals.map((g) => g.red),
      leftHp: b.leftHp,
      rightHp: b.rightHp,
    };
    img.battles.push(bv);
    // 问题标记
    if (!b.leftAlliance || !b.rightAlliance) img.problems.push(`战斗${i + 1} 同盟缺失`);
    if (b.leftGenerals.length < 3 || b.rightGenerals.length < 3)
      img.problems.push(`战斗${i + 1} 武将不足3`);
    if (!b.time) img.problems.push(`战斗${i + 1} 时间缺失`);
    if (b.leftGenerals.some((g) => g.red < 0) || b.rightGenerals.some((g) => g.red < 0))
      img.problems.push(`战斗${i + 1} 含未识别红度(-1)`);
  });
  return img;
}

/** 批量识别一个模式目录下全部图片 */
async function runMode(mode: string): Promise<ImageResult[]> {
  const files = collectFiles(mode);
  const parser = mode === 'portrait' ? parsePortraitImage : parseBattleImage;
  const results: ImageResult[] = [];
  for (const f of files) {
    try {
      const r = await parser(f);
      results.push(summarize(mode, f, r));
    } catch (e) {
      results.push({
        mode,
        file: f,
        size: '-',
        battles: [],
        problems: [`识别异常: ${(e as Error).message}`],
      });
    }
  }
  return results;
}

async function main() {
  const mode = process.argv[2] ?? 'all';
  const modes = mode === 'all' ? ['pc', 'landscape', 'portrait'] : [mode];
  const all: ImageResult[] = [];
  for (const m of modes) {
    all.push(...(await runMode(m)));
  }
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(all, null, 2), 'utf-8');

  // 控制台输出：每张图一行摘要 + 问题
  let okCount = 0;
  for (const r of all) {
    const short = r.file.replace(IMAGE_ROOT, '');
    if (r.problems.length) {
      console.log(`[问题] ${short}  -> ${r.problems.join('; ')}`);
    } else {
      okCount++;
      console.log(`[OK]   ${short}  战斗${r.battles.length}场`);
    }
  }
  console.log(`\n===== 汇总 =====`);
  console.log(`共 ${all.length} 张图，无问题 ${okCount} 张，有问题 ${all.length - okCount} 张`);
  console.log(`详细结果已写入 ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
