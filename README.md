<div align="center">

# 欧润吉战报分析助手

三国策略游戏战报图像识别与数据分析工具。上传战报截图，自动识别阵营、武将、兵力、胜负与红度，生成胜率排行与战斗矩阵热力图，并支持本地/云端数据同步。

</div>

## 目录

- [功能特性](#功能特性)
- [技术栈](#技术栈)
- [目录结构](#目录结构)
- [快速开始](#快速开始)
- [使用说明](#使用说明)
- [数据与存储](#数据与存储)
- [武将名单自动更新](#武将名单自动更新)
- [配置项](#配置项)
- [打包发布](#打包发布)
- [相关文档](#相关文档)
- [License](#license)

## 功能特性

- **战报识别**：支持 PC 横屏与 PE 竖屏两种截图模式；两阶段 OCR（整图定位 + 区域倍率补全），识别阵容、同盟、兵力、胜负与战报时间。
- **红度识别**：基于连通域分析识别武将名上方的勾玉（0~5 红），自动汇总阵容总红度。
- **阵容胜率排行**：按阵容聚合胜率并排序，直观查看强势阵容。
- **战斗矩阵热力图**：本阵 vs 敌阵的胜率矩阵，连续色阶展示强弱关系。
- **联盟筛选**：按同盟过滤战绩，快速定位目标联盟的数据。
- **标识体系**：自动标注「白板之光」（低红高胜率）、「泥头车」（高胜率高场次）、「陷阱」（高场次低胜率）等阵容。
- **快速升温阵容**：识别最近一段时间内高频出现的新阵容。
- **数据管理**：本地数据增删、导入/导出 JSON、云端（JSONBin.io）下载/合并去重上传/清空。
- **武将名单自动更新**：每次打开网页自动从 GitHub 拉取最新武将名单并热更新。

> 注：项目仅支持简体中文，繁体/生僻字识别率有限。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | 原生 HTML / CSS / JavaScript（单页应用） |
| 后端 | Node.js + TypeScript + Express + tsx |
| 图像处理 | sharp（图片解码/缩略图） |
| OCR 服务 | Python + RapidOCR（`rapidocr_onnxruntime`，ch_PP-OCRv3 简体中文模型）+ OpenCV |
| 云端 | JSONBin.io REST API |

## 目录结构

```
three/
├─ README.md
├─ 技术文档.md            # 技术细节与识别算法说明
├─ 更新日志.md            # 面向用户的更新历史
├─ 开发日志.md            # 开发记录与踩坑
└─ server/
   ├─ package.json
   ├─ src/                # 后端源码（TypeScript）
   │  ├─ index.ts         # Koa/Express 入口与 API 路由
   │  ├─ recognizer.ts    # PC 横屏战报识别（两阶段 + 批量 OCR）
   │  ├─ recognizer-portrait.ts # PE 竖屏战报识别
   │  ├─ ocrService.ts    # OCR HTTP 客户端（/ocr、/ocr/batch）
   │  ├─ red.ts           # 红度（勾玉）识别
   │  ├─ match.ts         # 武将模糊匹配 + OCR 错字映射
   │  ├─ dict.ts          # 内置武将词典（兜底）
   │  ├─ generals.ts      # 武将名单自动更新
   │  ├─ cloud.ts         # 云端数据同步（JSONBin.io）
   │  ├─ store.ts         # 本地持久化与去重合并
   │  └─ analysis.ts      # 胜率分析
   ├─ public/             # 前端静态资源
   └─ py/
      └─ ocr_service.py   # 独立 OCR HTTP 服务（端口 5050）
```

## 快速开始

### 环境要求

- Node.js ≥ 18
- Python ≥ 3.9
- 操作系统：Windows（Linux/macOS 亦可，脚本路径需略作调整）

### 1. 安装依赖

```bash
cd server
npm install
```

```bash
cd server/py
pip install rapidocr-onnxruntime opencv-python numpy
```

### 2. 启动 OCR 服务

```bash
# 端口需与配置一致（默认 127.0.0.1:5050）
python server/py/ocr_service.py 5050
```

### 3. 启动 Web 服务

```bash
cd server
npm run dev            # 开发模式（tsx watch，自动重载）
# 或
npm run start          # 生产/普通模式
```

打开浏览器访问 **http://localhost:3001** 即可。

## 使用说明

1. **战报识别页**：将战报截图（PNG/JPG/WebP）拖入或点击上传，自动识别阵容、同盟、结果与红度。可一键收起/展开战斗卡片，确认后自动持久化。
2. **数据分析页**：查看阵容胜率排行、战斗矩阵热力图；按联盟筛选；查看各类标识阵容与快速升温阵容。
3. **设置页**：自定义标识判定阈值、管理本地/云端数据、清空数据（需口令）。

## 数据与存储

- 本地数据持久化于 `server/data/records.json`（运行时生成，已加入 `.gitignore`），去重键为 `alliance | 阵容 | 红度 | hpAfter | hpBefore | 战斗时间`。
- 支持将本地数据**导入/导出**为 JSON 备份。
- 支持与 **JSONBin.io 云端**同步：下载（云端覆盖本地）、上传（与云端按去重键合并后写回）、清空（需口令）。

## 武将名单自动更新

- 名单源为 GitHub 上的 `generals.json`，形如 `{ "version": "2026-08-27", "generals": ["曹丕", ...] }`。
- 每次打开网页后端会检查远程名单；版本号更高则热替换并持久化，前端弹出版本更新提示。
- 内置多镜像源以应对网络问题；也可通过 `GENERALS_RAW_URL` 覆盖。
- 新武将若存在 OCR 易错的形近字，需在 `server/src/match.ts` 的 `OCR_ALIASES` 中补充映射。

## 配置项

| 环境变量 | 说明 | 默认 |
| --- | --- | --- |
| `PORT` | Web 服务端口 | `3001` |
| `CLOUD_BIN_ID` | JSONBin.io Bin ID | 见 `server/src/cloud.ts` |
| `CLOUD_ACCESS_KEY` | JSONBin.io Access Key | 见 `server/src/cloud.ts` |
| `CLOUD_MASTER_KEY` | JSONBin.io Master Key | 见 `server/src/cloud.ts` |
| `GENERALS_RAW_URL` | 武将名单源地址（覆盖内置镜像） | 内置多镜像 |

> 云端 Key 仅存在于后端源码，切勿置入前端代码；生产环境建议以环境变量覆盖默认值。

## 打包发布

项目支持使用 `@yao-pkg/pkg` 打包为自包含可执行文件（内置 Node 运行时与 `sharp`/ONNX 等原生依赖），免安装即可运行。`start.bat` / `stop.bat` 分别用于一键启动和清理进程并释放端口。详见 `技术文档.md`。

## 相关文档

- [技术文档](技术文档.md)：接口、识别算法、系统设计。
- [更新日志](更新日志.md)：功能更新历史。
- [开发日志](开发日志.md)：开发过程与踩坑记录。

## License

该项目为个人项目，仅用于学习与个人使用。