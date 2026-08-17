/**
 * 临时：验证同盟名高倍 OCR 精修后所有测试图的识别。
 */
import { parseBattleImage } from './recognizer.js';

async function main() {
  for (const f of ['test1.png', 'test2.png', 'test3.png', 'test4.png', 'test5.png']) {
    const r = await parseBattleImage(`E:/SoftWare/AICoding/Trae/Image/${f}`);
    console.log(`\n== ${f} == battles=${r.battles.length}`);
    r.battles.forEach((b, i) => {
      console.log(
        `[${i}] 左同盟="${b.leftAlliance}" (${b.leftGenerals.map((g) => g.name).join('/')}) ` +
          `右同盟="${b.rightAlliance}" (${b.rightGenerals.map((g) => g.name).join('/')}) 结果=${b.resultText}`
      );
    });
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});