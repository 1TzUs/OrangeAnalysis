/**
 * OCR 探针：调用本地 RapidOCR 服务识别指定区域，输出文本。
 * 用法: npx tsx src/probe.ts <image> <x0> <y0> <x1> <y1> [scale]
 */
import http from 'node:http';

const [img, x0, y0, x1, y1, scale] = process.argv.slice(2);
const task = {
  image: img,
  x0: +x0, y0: +y0, x1: +x1, y1: +y1,
  scale: +(scale ?? 1),
};

const body = JSON.stringify(task);
const req = http.request({
  host: '127.0.0.1', port: 5050, path: '/ocr', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
}, (res) => {
  let d = '';
  res.on('data', (c) => (d += c));
  res.on('end', () => {
    const r = JSON.parse(d);
    if (r.error) { console.log('ERROR:', r.error); return; }
    for (const l of r.lines) {
      console.log(`[x=${l.x0}-${l.x1} y=${l.y0}-${l.y1} conf=${l.conf.toFixed(2)}] 「${l.text}」`);
    }
    if (!r.lines.length) console.log('(无识别结果)');
  });
});
req.end(body);