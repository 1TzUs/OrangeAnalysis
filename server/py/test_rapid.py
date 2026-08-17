# -*- coding: utf-8 -*-
"""RapidOCR 测试：对武将名裁剪区域做识别，验证对书法橙红字体的识别效果。"""
import sys
import cv2
import numpy as np

def main():
    img_path = r'E:\SoftWare\AICoding\Trae\Image\test1.png'
    img = cv2.imread(img_path)
    if img is None:
        print('无法读取图片'); sys.exit(1)
    h, w = img.shape[:2]
    print('原图尺寸:', w, 'x', h)

    # 面板1（y193-583）名字行 y509-535，卡中心 x=158/352/545, 1640/1834/2027
    cards = [158, 352, 545, 1640, 1834, 2027]
    for cx in cards:
        x0, x1 = cx - 55, cx + 55
        y0, y1 = 502, 542
        crop = img[y0:y1, x0:x1]
        # 放大 3 倍
        big = cv2.resize(crop, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
        print(f'卡x={cx} 裁剪 {x0}-{x1} x {y0}-{y1}')

        from rapidocr_onnxruntime import RapidOCR
        ocr = RapidOCR()
        result, _ = ocr(big)
        if result:
            for box, text, conf in result:
                print(f'  「{text}」 conf={conf:.2f}')
        else:
            print('  无识别结果')

if __name__ == '__main__':
    main()