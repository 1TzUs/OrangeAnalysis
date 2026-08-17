# -*- coding: utf-8 -*-
"""红度(星级)检测：统计武将卡片顶部区域橙红色/金色火焰图标的连通域数量。
用法: python star_detect.py <image> <cx> <nameY>
火焰区域约在 nameplate 上方 8~40px、卡片宽度约 60px。
"""
import sys
import cv2
import numpy as np

def count_flames(img_path, cx, name_y):
    img = cv2.imread(img_path)
    if img is None:
        return -1, 'cannot read'
    h, w = img.shape[:2]
    # 火焰区域：name_y 为武将名plate顶部，火焰带在其上方一小段
    x0 = max(0, cx - 36)
    x1 = min(w, cx + 36)
    y_top = max(0, name_y - 38)
    y_bot = min(h, name_y - 6)
    crop = img[y_top:y_bot, x0:x1]
    if crop.size == 0:
        return -1, 'empty region'
    # 火焰特征：橙红色亮部（r 高、g 中、b 低），黑色描边会分隔相邻火焰
    b = crop[:, :, 0].astype(int)
    g = crop[:, :, 1].astype(int)
    r = crop[:, :, 2].astype(int)
    mask = (r > 110) & (r > b + 50) & (g > 40) & (g < 210) & (r - g < 120)
    mask = mask.astype(np.uint8) * 255
    # 闭运算合并同一火焰内部的渐变色缝隙
    kernel = np.ones((3, 3), np.uint8)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    # 去掉细小噪点
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    # X 轴投影：每列火焰像素数，用黑色间距分割相邻火焰
    col_sum = (mask > 0).sum(axis=0)
    thresh = 6
    active = col_sum > thresh
    flames = 0
    in_flame = False
    for v in active:
        if v and not in_flame:
            flames += 1
            in_flame = True
        elif not v:
            in_flame = False
    return flames, f'region x[{x0},{x1}) y[{y_top},{y_bot}) px={mask.sum()//255}'

if __name__ == '__main__':
    img = sys.argv[1]
    cx = int(sys.argv[2])
    name_y = int(sys.argv[3])
    n, info = count_flames(img, cx, name_y)
    print('flames=', n, info)