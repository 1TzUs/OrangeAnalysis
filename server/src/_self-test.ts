/** 自测脚本：批量识别 PC / PE-landscape / PE-portrait 三组截图，评估识别准确度 */
import path from 'node:path';
import fs from 'node:fs';
import { parseBattleImage } from './recognizer.js';
import { parsePortraitImage } from './recognizer-portrait.js';
import { GENERALS } from './dict.js';

/** 汇总统计 */
const stat = { files: 0, battles: 0, ok3v3: 0, badComp: 0, badAlliance: 0, allianceMiss: 0, genMiss: 0 };

/** 识别一组文件 */
async function runGroup(label: string, files: string[], parser: (p: string) => Promise<any>) {
  console.log(`\n========== ${label}（${files.length} 张） ==========`);
  for (const f of files) {
    stat.files++;
    let r;
    try {
      r = await parser(f);
    } catch (e) {
      console.log(`  ✗ ${path.basename(f)} 识别失败: ${(e as Error).message}`);
      continue;
    }
    console.log(`\n=== ${path.basename(f)}（${r.imageWidth}x${r.imageHeight}）${r.battles.length} 场 ===`);
    for (const b of r.battles) {
      stat.battles++;
      const lc = b.leftGenerals.map((g) => g.name);
      const rc = b.rightGenerals.map((g) => g.name);
      const lraw = b.leftGenerals.map((g) => g.raw);
      const rraw = b.rightGenerals.map((g) => g.raw);
      const compOk = lc.length >= 3 && rc.length >= 3;
      if (compOk) stat.ok3v3++;
      else stat.badComp++;

      // 武将是否在名单内（raw 与 name 不一致时提示）
      const mismatch: string[] = [];
      b.leftGenerals.forEach((g, i) => { if (g.raw !== g.name) mismatch.push(`L:${g.raw}→${g.name}`); });
      b.rightGenerals.forEach((g, i) => { if (g.raw !== g.name) mismatch.push(`R:${g.raw}→${g.name}`); });

      const alOk = !!(b.leftAlliance && b.rightAlliance);
      if (!alOk) stat.allianceMiss++;
      // 同盟名可疑（含噪声特征）
      const badAl = [b.leftAlliance, b.rightAlliance].some((a) => a && /^[^\u4e00-\u9fa5]/.test(a));
      if (badAl) { stat.badAlliance++; console.log(`    ⚠ 同盟名异常: ${b.leftAlliance} / ${b.rightAlliance}`); }

      const flag = compOk ? '' : ' <<< 武将不足3';
      const lr = b.leftGenerals.map((g) => g.red).join(',');
      const rr = b.rightGenerals.map((g) => g.red).join(',');
      console.log(
        `  [${b.resultText}] ${b.leftAlliance || '?'}(红${lr}|${lc.join('/') || '?'}) vs ${b.rightAlliance || '?'}(红${rr}|${rc.join('/') || '?'})${flag}`
      );
      mismatch.forEach((m) => console.log(`      ↳ 词典纠错: ${m}`));
    }
  }
}

// 目录
const base = 'E:/SoftWare/AICoding/Trae/Image';
const pc = `${base}/PC`;
const peL = `${base}/PE/landscape`;
const peP = `${base}/PE/portrait`;

const ls = (dir: string) => fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort().map((f) => `${dir}/${f}`);

// PC 横屏 → parseBattleImage
await runGroup('PC 横屏', ls(pc), parseBattleImage);
// PE 横屏 → parseBattleImage
await runGroup('PE 横屏 (landscape)', ls(peL), parseBattleImage);
// PE 竖屏 → parsePortraitImage
await runGroup('PE 竖屏 (portrait)', ls(peP), parsePortraitImage);

// 汇总
console.log(`\n\n========== 汇总 ==========`);
console.log(`文件 ${stat.files}，战斗 ${stat.battles}`);
console.log(`可生成记录(双方≥3将): ${stat.ok3v3}，武将不足3: ${stat.badComp}`);
console.log(`同盟缺失: ${stat.allianceMiss}，同盟名异常: ${stat.badAlliance}`);
console.log(`可生成记录率: ${stat.battles ? Math.round((stat.ok3v3 / stat.battles) * 100) : 0}%`);
console.log(`词典武将总数: ${GENERALS.length}`);