import cv2
import numpy as np

img = cv2.imread(r"E:\SoftWare\AICoding\Trae\function\function2.jpg")
h, w = img.shape[:2]

# 定位网格：在 y=640 行找绿色单元格的边界过渡
gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
y = 640
# 找该行颜色突变点
runs = []
prev = None
start = 0
for x in range(w):
    g = gray[y, x]
    # 量化
    q = g//12
    if prev is None:
        prev = q; start = x
    elif q != prev:
        runs.append((start, x, prev))
        start = x; prev = q
runs.append((start, w, prev))
print("=== y=640 runs (x0,x1,gray) ===")
for r in runs:
    if r[1]-r[0] > 3:
        print(r)