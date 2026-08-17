import http from 'node:http';
const path = process.argv[2];
const scale = parseFloat(process.argv[3] || '1.3');
const body = JSON.stringify({ image: path, scale });
const req = http.request({ host: '127.0.0.1', port: 5050, path: '/ocr', method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } },
  (res) => { let d=''; res.on('data',c=>d+=c); res.on('end',()=>{
    const r = JSON.parse(d);
    const lines = (r.lines||[]).sort((a,b)=>a.y0-b.y0);
    for (const l of lines) console.log(`y=${String(l.y0).padStart(5)} x=${String(l.x0).padStart(5)}-[${l.y1-l.y0}] ${JSON.stringify(l.text)}`);
    console.log('TOTAL', lines.length);
  }); });
req.on('error', e=>console.log('ERR', e.message));
req.end(body);