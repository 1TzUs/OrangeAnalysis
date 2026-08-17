/** 裁剪检测到的面板区域，便于查看内部布局 */
import sharp from 'sharp';

const IMG = 'E:/SoftWare/AICoding/Trae/Image/test1.png';
const OUT = 'E:/SoftWare/AICoding/Trae/three/server/tmp';

async function main() {
  const meta = await sharp(IMG).metadata();
  const W = meta.width!;
  const panels = [[0, 192], [193, 583], [584, 977]];
  for (let i = 0; i < panels.length; i++) {
    const [y0, y1] = panels[i];
    await sharp(IMG).extract({ left: 0, top: y0, width: W, height: y1 - y0 }).toFile(`${OUT}/det${i + 1}.png`);
    console.log('saved', i + 1);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });