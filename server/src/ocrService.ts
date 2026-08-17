/**
 * RapidOCR 服务客户端：通过 HTTP 调用本地 Python OCR 服务。
 * 服务返回带坐标的文本行，用于按区域/字段组装识别结果。
 */
import http from 'node:http';

export interface OcrLine {
  text: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  conf: number;
}

const PORT = 5050;

/**
 * 对整张图片做 OCR，返回全部文本行（坐标为原图坐标）。
 * @param imagePath 图片绝对路径
 * @param scale 预处理放大倍数（坐标会自动还原）
 */
export function ocrImage(imagePath: string, scale = 1.2): Promise<OcrLine[]> {
  return requestOcr({ image: imagePath, scale });
}

/** 对图片指定区域做 OCR */
export function ocrRegionService(
  imagePath: string,
  box: { x0: number; y0: number; x1: number; y1: number },
  scale = 2
): Promise<OcrLine[]> {
  return requestOcr({ image: imagePath, x0: box.x0, y0: box.y0, x1: box.x1, y1: box.y1, scale });
}

function requestOcr(payload: Record<string, unknown>): Promise<OcrLine[]> {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: PORT,
        path: '/ocr',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => {
          try {
            const r = JSON.parse(d);
            if (r.error) return reject(new Error(r.error));
            resolve(r.lines as OcrLine[]);
          } catch (e) {
            reject(e as Error);
          }
        });
      }
    );
    req.on('error', reject);
    req.end(body);
  });
}