# -*- coding: utf-8 -*-
"""RapidOCR 文本识别服务：常驻进程，接收图片路径+裁剪框，返回带坐标的文本。
用法: python ocr_service.py [port]
请求: POST /ocr  JSON: {"image": <abs path>, "x0":..,"y0":..,"x1":..,"y1":.., "scale": int}
       POST /ocr/batch  JSON: {"image": <abs path>, "regions":[{"tag":..,"x0":..,"y0":..,"x1":..,"y1":..,"scale":int}]}
返回: {"lines":[...]}
      /ocr/batch 返回 {"results":{tag:[lines]}}
"""
import json
import os
import sys
import threading
from collections import OrderedDict
import numpy as np
import cv2
from http.server import BaseHTTPRequestHandler, HTTPServer
from rapidocr_onnxruntime import RapidOCR

# 可选请求日志：设环境变量 OCR_VERBOSE=1 时打印每次请求的类型与区域数，便于统计识图调用次数
_VERBOSE = os.environ.get('OCR_VERBOSE') == '1'

_ocr = None
_ocr_lock = threading.Lock()

def get_ocr():
    """取共享 OCR 引擎；并发下用锁保证只初始化一次。"""
    global _ocr
    if _ocr is None:
        with _ocr_lock:
            if _ocr is None:
                _ocr = RapidOCR()
    return _ocr

# 解码缓存：同一张图在一次解析中会被整图 + 多个区域识别反复读取。
# 每次 cv2.imread 都要把整张图从磁盘重新解码（PNG 尤慢），这里按路径缓存解码结果，
# 让后续整图/区域请求复用同一像素数组 —— 像素完全一致，识别精度零影响。
_MAX_CACHE = 4
_img_cache = OrderedDict()
_cache_lock = threading.Lock()

def get_image(img_path):
    """按路径取解码后的图像；命中缓存直接复用，未命中解码并写入 LRU 缓存。"""
    with _cache_lock:
        if img_path in _img_cache:
            _img_cache.move_to_end(img_path)
            return _img_cache[img_path]
    img = cv2.imread(img_path)
    if img is not None:
        with _cache_lock:
            _img_cache[img_path] = img
            _img_cache.move_to_end(img_path)
            while len(_img_cache) > _MAX_CACHE:
                _img_cache.popitem(last=False)
    return img

class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _ocr_region(self, img, x0, y0, x1, y1, scale):
        """对单区域做 OCR，返回带原图坐标的文本行列表（scale 会换算回原图坐标）。"""
        scale = float(scale or 1.0)
        h, w = img.shape[:2]
        x0 = max(0, min(int(x0), w)); x1 = max(x0, min(int(x1), w))
        y0 = max(0, min(int(y0), h)); y1 = max(y0, min(int(y1), h))
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
        return lines

    def do_POST(self):
        if _VERBOSE:
            print(f"[ocr] path={self.path}", flush=True)
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length))
            img_path = body['image']
            img = get_image(img_path)
            if img is None:
                self._send({'error': 'cannot read ' + img_path})
                return
            # 批量路径：一次请求识别多个区域，省掉逐区域 HTTP 往返；region 内标签原样返回。
            if self.path.rstrip('/').endswith('/ocr/batch'):
                regions = body.get('regions', [])
                if _VERBOSE:
                    print(f"[ocr] batch regions={[r.get('tag') for r in regions]}", flush=True)
                results = {}
                for r in regions:
                    tag = r.get('tag', '')
                    results[tag] = self._ocr_region(
                        img, r.get('x0', 0), r.get('y0', 0),
                        r.get('x1', img.shape[1]), r.get('y1', img.shape[0]),
                        r.get('scale', 1.0))
                self._send({'results': results})
                return
            lines = self._ocr_region(
                img, body.get('x0', 0), body.get('y0', 0),
                body.get('x1', img.shape[1]), body.get('y1', img.shape[0]),
                body.get('scale', 1.0))
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