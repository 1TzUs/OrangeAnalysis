/** 测试现有识别器在竖屏图上的表现 */
import { parseBattleImage } from './recognizer.js';

const img = process.argv[2] ?? 'E:/SoftWare/AICoding/Trae/Image/PE/portrait/test1.jpg';
const r = await parseBattleImage(img);
console.log(`=== ${img} ${r.imageWidth}x${r.imageHeight} 共 ${r.battles.length} 场 ===`);
for (const b of r.battles) {
  console.log(`[${b.resultText}] panel y=${b.panel.y0}-${b.panel.y1}`);
  console.log(`  左同盟=${b.leftAlliance} 阵容=${b.leftGenerals.map(g=>g.name).join('/')} HP=${b.leftHp}`);
  console.log(`  右同盟=${b.rightAlliance} 阵容=${b.rightGenerals.map(g=>g.name).join('/')} HP=${b.rightHp}`);
  console.log(`  体力=${b.hpCost}`);
}