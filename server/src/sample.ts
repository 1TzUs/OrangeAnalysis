/**
 * 采样脚本：抽样图片中若干位置的像素RGB，用于校准各类颜色阈值。
 */
import sharp from 'sharp';

const IMG = 'E:/SoftWare/AICoding/Trae/Image/test1.png';

async function main() {
  const { data, info } = await sharp(IMG).raw().toBuffer({ resolveWithObject: true });
  const W = info.width!;
  const ch = info.channels;
  const at = (x: number, y: number) => {
    const i = (y * W + x) * ch;
    return `(${x},${y})=[${data[i]},${data[i + 1]},${data[i + 2]}]`;
  };

  // 采样区域：
  console.log('--- 武将卡片边框（左上角卡片区域）---');
  // card1 大致 x=61..245, y=52..198
  for (const y of [52, 60, 100, 150, 197]) {
    for (const x of [61, 62, 180, 244]) console.log(at(x, y));
  }

  console.log('--- 红色结果标记区域（面板中部 x~1300-1700）---');
  for (const y of [186, 190, 349, 365, 577, 740, 782]) {
    for (const x of [1300, 1336, 1372, 1440, 1680]) console.log(at(x, y));
  }

  console.log('--- 背景 / 名字文字区域 ---');
  for (const y of [159, 160, 165, 170]) {
    for (const x of [1598, 1600, 1610, 1620]) console.log(at(x, y));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });