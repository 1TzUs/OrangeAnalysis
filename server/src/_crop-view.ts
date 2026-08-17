/**
 * 临时脚本：裁剪并放大武将带区域，便于人工查看勾玉（红度）外观与位置。
 */
import sharp from 'sharp';

/** 待裁剪的图片区域（每项：标签、路径、裁剪框、放大倍数、输出路径） */
const jobs: Array<{ label: string; path: string; box: { l: number; t: number; w: number; h: number }; scale: number; out: string }> = [
  {
    label: 'PC test1 顶部武将带',
    path: 'E:/SoftWare/AICoding/Trae/Image/PC/test1.png',
    box: { l: 0, t: 0, w: 2144, h: 300 },
    scale: 2,
    out: 'tmp/view_pc_test1.png',
  },
  {
    label: 'PE portrait test1 顶部武将带',
    path: 'E:/SoftWare/AICoding/Trae/Image/PE/portrait/test1.jpg',
    box: { l: 0, t: 0, w: 1080, h: 500 },
    scale: 2,
    out: 'tmp/view_pep_test1.png',
  },
];

for (const j of jobs) {
  await sharp(j.path)
    .extract({ left: j.box.l, top: j.box.t, width: j.box.w, height: j.box.h })
    .resize({ width: j.box.w * j.scale })
    .ensureAlpha()
    .toFile(j.out);
  console.log(`已生成 ${j.out}（${j.label}）`);
}