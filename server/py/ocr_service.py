# -*- coding: utf-8 -*-
"""RapidOCR 文本识别服务：常驻进程，接收图片路径+裁剪框，返回带坐标的文本。
用法: python ocr_service.py [port]
请求: POST /ocr  JSON: {"image": <abs path>, "x0":..,"y0":..,"x1":..,"y1":.., "scale": int}
返回: {"lines":[{"text":..,"x0":..,"y0":..,"x1":..,"y1":..,"conf":..}]}
"""
import json
import sys
import numpy as np
import cv2
from http.server import BaseHTTPRequestHandler, HTTPServer
from rapidocr_onnxruntime import RapidOCR

_ocr = None

def get_ocr():
    global _ocr
    if _ocr is None:
        _ocr = RapidOCR()
    return _ocr

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))
            img_path = body['image']
            img = cv2.imread(img_path)
            if img is None:
                self._send({'error': 'cannot read ' + img_path})
                return
            x0 = int(body.get('x0', 0)); y0 = int(body.get('y0', 0))
            x1 = int(body.get('x1', img.shape[1])); y1 = int(body.get('y1', img.shape[0]))
            scale = float(body.get('scale', 1.0))
            h, w = img.shape[:2]
            x0 = max(0, min(x0, w)); x1 = max(x0, min(x1, w))
            y0 = max(0, min(y0, h)); y1 = max(y0, min(y1, h))
            crop = img[y0:y1, x0:x1]
            if scale != 1.0:
                crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
            result, _ = get_ocr()(crop)
            lines = []
            if result:
                for box, text, conf in result:
                    xs = [p[0] for p in box]; ys = [p[1] for p in box]
                    lines.append({
                        'text': text,
                        'x0': int(min(xs) / scale + x0), 'y0': int(min(ys) / scale + y0),
                        'x1': int(max(xs) / scale + x0), 'y1': int(max(ys) / scale + y0),
                        'conf': float(conf),
                    })
            self._send({'lines': lines})
        except Exception as e:
            self._send({'error': str(e)})

    def _send(self, obj):
        data = json.dumps(obj).encode('utf-8')
        self.send_response(200)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5050
    print('OCR service on port', port, flush=True)
    HTTPServer(('127.0.0.1', port), Handler).serve_forever()