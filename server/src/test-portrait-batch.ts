/** 批量验证竖屏识别器：对 portrait 目录全部图片识别并输出 */
import fs from 'node:fs';
import { parsePortraitImage } from './recognizer-portrait.js';

const dir = 'E:/SoftWare/AICoding/Trae/Image/PE/portrait';
const files = fs.readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();

let totalBattles = 0;
let totalRecords = 0;
for (const f of files) {
  const r = await parsePortraitImage(`${dir}/${f}`);
  totalBattles += r.battles.length;
  console.log(`\n=== ${f} (${r.imageWidth}x${r.imageHeight}) 共 ${r.battles.length} 场 ===`);
  for (const b of r.battles) {
    const lc = b.leftGenerals.map((g) => g.name).join('/');
    const rc = b.rightGenerals.map((g) => g.name).join('/');
    const ok = b.leftAlliance && b.rightAlliance && lc && rc;
    if (ok) totalRecords++;
    console.log(
      `  [${b.resultText}] ${b.leftAlliance || '?'}(${lc || '?'}) vs ${b.rightAlliance || '?'}(${rc || '?'}) HP=${b.leftHp}/${b.rightHp}${ok ? '' : '  <<< 数据缺失'}`
    );
  }
}
console.log(`\n===== 汇总：${files.length} 张图，${totalBattles} 场，可生成记录 ${totalRecords} 条 =====`);