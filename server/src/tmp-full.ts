/**
 * 临时：诊断 test1 战斗1 左/右同盟行的高倍 OCR 与整图 OCR 差异。
 */
import { ocrImage, ocrRegionService } from './ocrService.js';

async function main() {
  const all = await ocrImage('E:/SoftWare/AICoding/Trae/Image/test1.png', 1.3);
  console.log('整图OCR同盟相关行:');
  all
    .filter((l) => /百战|风花|叶|桂系/.test(l.text))
    .forEach((l) => console.log(`  y[${l.y0}-${l.y1}] x[${l.x0}-${l.x1}] "${l.text}"`));

  for (const box of [
    { x0: 690, y0: 400, x1: 890, y1: 460 }, // 战斗1左同盟 百战|凌云
    { x0: 1320, y0: 400, x1: 1490, y1: 460 }, // 战斗1右同盟 风花雪月
  ]) {
    const hi = await ocrRegionService('E:/SoftWare/AICoding/Trae/Image/test1.png', box, 2);
    console.log(`\n高倍OCR box x[${box.x0}-${box.x1}] y[${box.y0}-${box.y1}]:`);
    hi.sort((a, b) => a.y0 - b.y0).forEach((l) =>
      console.log(`  y[${l.y0}-${l.y1}] x[${l.x0}-${l.x1}] "${l.text}"`)
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});