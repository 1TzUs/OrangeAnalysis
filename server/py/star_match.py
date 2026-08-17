# -*- coding: utf-8 -*-
"""红度(星级)检测 v2：模板匹配火焰图标，计数每张武将卡片的火焰数量。
用法: python star_match.py <image> <cx> <flame_y> <panel_y0>
  cx: 卡片中心X; flame_y: 火焰带Y(任意参考); panel_y0: 面板顶部Y
火焰带在卡片名plate上方，用模板匹配自动定位并计数。
"""
import sys
import cv2
import numpy as np

TPL_PATH = 'C:/Users/Us/star_tpl.png'

def count_stars(img_path, cx, tpl, name_y):
    img = cv2.imread(img_path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return -1, 'cannot read'
    h, w = img.shape[:2]
    th, tw = tpl.shape
    x0 = max(0, cx - 45)
    x1 = min(w, cx + 45)
    # 搜索带：武将名 plate 上方（火焰带固定在这一小段）
    y0 = max(0, name_y - 46)
    y1 = min(h, name_y - 4)
    band = img[y0:y1, x0:x1]
    if band.size == 0:
        return -1, 'empty band'
    res = cv2.matchTemplate(band, tpl, cv2.TM_CCOEFF_NORMED)
    # 非极大值抑制，找响应峰
    score_thresh = 0.5
    ys, xs = np.where(res >= score_thresh)
    cands = list(zip(xs, ys, res[ys, xs]))
    cands.sort(key=lambda p: -p[2])
    suppressed = []
    for x, y, s in cands:
        if any(abs(x - px) < tw * 0.7 and abs(y - py) < th * 0.7 for px, py, _ in suppressed):
            continue
        suppressed.append((x, y, s))
    return len(suppressed), f'cx={cx} band y[{y0},{y1}) peaks={len(suppressed)}'

if __name__ == '__main__':
    img = sys.argv[1]
    cx = int(sys.argv[2])
    name_y = int(sys.argv[3]) if len(sys.argv) > 3 else 541
    tpl = cv2.imread(TPL_PATH, cv2.IMREAD_GRAYSCALE)
    n, info = count_stars(img, cx, tpl, name_y)
    print('stars=', n, info)