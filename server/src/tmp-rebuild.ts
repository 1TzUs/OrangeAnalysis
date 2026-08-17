/**
 * 临时：清空旧记录，用修复后的识别逻辑重新识别 test1-test5 并持久化。
 */
import { parseBattleImage } from './recognizer.js';
import { clearRecords, appendRecords, battleToRecords } from './store.js';

async function main() {
  clearRecords();
  const files = ['test1.png', 'test2.png', 'test3.png', 'test4.png', 'test5.png'];
  for (const f of files) {
    const r = await parseBattleImage(`E:/SoftWare/AICoding/Trae/Image/${f}`);
    const recs = battleToRecords(r.battles, f);
    appendRecords(recs);
    console.log(`${f}: ${r.battles.length} 场 -> ${recs.length} 条，同盟=${[
      ...new Set(r.battles.flatMap((b) => [b.leftAlliance, b.rightAlliance])),
    ].join(',')}`);
  }
  console.log('重建完成');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});