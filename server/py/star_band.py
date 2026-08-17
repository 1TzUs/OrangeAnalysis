# -*- coding: utf-8 -*-
"""红度检测 v3：自适应火焰带定位。
对每个战斗 panel，在武将卡片区用橙红像素的 Y 投影找到火焰带（所有卡片火焰同 Y），
再对每张卡片列做 X 投影计数火焰数量。
"""
import sys
import cv2
import numpy as np

def detect_panel_stars(img_path, panel_y0, panel_y1, cols_x, plate_y):
    """cols_x: 6 个卡片列中心 [左3, 右3]; plate_y: 武将名plate带(顶部Y, 底部Y)"""
    img = cv2.imread(img_path)
    if img is None:
        return None, 'cannot read'
    h, w = img.shape[:2]
    # 卡片区：名字plate 上方找火焰带
    search_y0 = max(0, plate_y[0] - 60)
    search_y1 = min(h, plate_y[1])
    region = img[search_y0:search_y1, 0:w]
    # 橙红火焰掩码
    b = region[:, :, 0].astype(int)
    g = region[:, :, 1].astype(int)
    r = region[:, :, 2].astype(int)
    mask = (r > 110) & (r > b + 50) & (g > 40) & (g < 210) & (r - g < 120)
    mask = mask.astype(np.uint8)
    # 在每列卡片中心区域找火焰带 Y 范围（用 X 限制到卡片列）
    # 先对整行做 Y 投影，找橙红密集带
    row_sum = mask.sum(axis=1)
    # 找出火焰带（row_sum 局部高的连续段）
    thr = 15
    rows_active = row_sum > thr
    bands = []
    in_band = False
    for idx, v in enumerate(rows_active):
        if v and not in_band:
            band_start = idx
            in_band = True
        elif not v and in_band:
            bands.append((band_start, idx))
            in_band = False
    if in_band:
        bands.append((band_start, len(rows_active)))
    # 选择最接近 plate 上方的火焰带
    if not bands:
        return None, 'no flame band'
    # 取包含最多橙红像素的带
    best = max(bands, key=lambda bd: row_sum[bd[0]:bd[1]].sum())
    fy0 = search_y0 + best[0]
    fy1 = search_y0 + best[1]
    # 对每列计数
    results = []
    for cx in cols_x:
        cx0 = max(0, cx - 36)
        cx1 = min(w, cx + 36)
        colmask = mask[best[0]:best[1], cx0 - search_y0:cx1] if False else mask[best[0]:best[1], cx0:cx1]
        colsum = colmask.sum(axis=0)
        thr2 = 5
        active = colsum > thr2
        n = 0
        inside = False
        for v in active:
            if v and not inside:
                n += 1
                inside = True
            elif not v:
                inside = False
        results.append(n)
    return results, f'band y[{fy0},{fy1}) rows={len(bands)}'

if __name__ == '__main__':
    img = sys.argv[1]
    py0 = int(sys.argv[2]); py1 = int(sys.argv[3])
    cols = [int(x) for x in sys.argv[4].split(',')]
    pty0 = int(sys.argv[5]); pty1 = int(sys.argv[6])
    res, info = detect_panel_stars(img, py0, py1, cols, (pty0, pty1))
    print('stars=', res, info)