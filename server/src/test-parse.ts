/**
 * 识别测试脚本：对整数战报截图运行新的识别管线，输出结构化结果。
 * 用法: npx tsx src/test-parse.ts <图片路径>
 */
import { parseBattleImage } from './recognizer.js';

async function main() {
  const img = process.argv[2] ?? 'E:/SoftWare/AICoding/Trae/Image/test1.png';
  console.log('识别:', img);
  const r = await parseBattleImage(img);
  console.log(`尺寸: ${r.imageWidth}x${r.imageHeight}, 战斗数: ${r.battles.length}`);
  r.battles.forEach((b, i) => {
    console.log(`\n===== 战斗 ${i + 1} (y=${b.panel.y0}-${b.panel.y1}) =====`);
    console.log(`结果: [${b.resultText}] result=${b.result}`);
    console.log(`左同盟: ${b.leftAlliance}   右同盟: ${b.rightAlliance}`);
    console.log(`左武将: ${b.leftGenerals.map((g) => g.name).join(', ') || '(空)'}`);
    console.log(`右武将: ${b.rightGenerals.map((g) => g.name).join(', ') || '(空)'}`);
    console.log(`兵力: ${b.leftHp} vs ${b.rightHp}   体力-${b.hpCost}`);
  });
}
main().catch((e) => { console.error(e); process.exit(1); });