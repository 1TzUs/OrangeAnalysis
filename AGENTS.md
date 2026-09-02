# AGENTS.md

本文件是给 AI 编码助手（Agent）的项目规范。修改本项目代码前请先阅读本文件，确保符合约定、不踩坑、不破坏既有行为。

***

## 项目概览

**欧润吉战报分析助手**：三国策略游戏战报截图识别与胜率分析工具。
上传战报截图 → 自动识别武将阵容、同盟、兵力、胜负、红度 → 生成「阵容胜率排行」与「对战热力图」，并支持本地/云端数据同步。

- 仅支持**简体中文**，繁体/生僻字识别率有限，不提供繁转简。

- 部署形态：`npm run dev` 开发 / `@yao-pkg/pkg` 打包为免安装自包含 exe。

***

## 技术栈

| 层    | 技术                                                                |
| ---- | ----------------------------------------------------------------- |
| 前端   | 原生 HTML / CSS / JS（单页应用，`server/public`）                          |
| 后端   | Node.js + TypeScript + Express + tsx（ESM，`"type":"module"`）       |
| 图像处理 | sharp                                                             |
| OCR  | Python + RapidOCR（`rapidocr_onnxruntime`，ch\_PP-OCRv3），独立 HTTP 服务 |
| 云端   | JSONBin.io REST API                                               |

***

## 运行与命令

固定端口（硬约束，勿改）：

- Web 服务：**<http://localhost:3001>**

- OCR 服务：**127.0.0.1:5050**

```bash
# 安装
cd server && npm install
cd server/py && pip install rapidocr-onnxruntime opencv-python numpy

# 开发（tsx watch，改后端代码自动重载）——注意不打 reload 请勿用此方式
cd server && npm run dev

# 普通运行（不监听文件变化，改配置后需重启）
cd server && npm run start

# OCR 服务（独立进程，另开终端）
python server/py/ocr_service.py 5050
```

> 调试注意：`npm start`（非 watch）**不会**重载配置/代码，改后必须重启；`npm run dev` 会自动重载。数据变更后若需清内存缓存，重启服务。

***

## 目录结构

```
three/
├─ README.md            # 用户手册（阅前注意更新一致性）
├─ 技术文档.md          # 接口、识别算法、系统设计
├─ 更新日志.md          # 面向用户的更新历史
├─ 开发日志.md          # 开发记录与踩坑
├─ generals.json        # 武将名单（推送到 GitHub 的源文件）
└─ server/
   ├─ package.json
   ├─ src/              # 后端源码（TypeScript）
   │  ├─ index.ts           # Express 入口与全部 API 路由
   │  ├─ recognizer.ts      # PC 横屏识别（整图 OCR + 区域精修，批量 /ocr/batch）
   │  ├─ recognizer-portrait.ts # PE 竖屏识别
   │  ├─ ocrService.ts      # OCR HTTP 客户端（/ocr、/ocr/batch）
   │  ├─ red.ts             # 红度（勾玉）识别
   │  ├─ match.ts           # 武将模糊匹配 + OCR 错字映射（OCR_ALIASES / PLAYER_ALIASES）
   │  ├─ dict.ts            # 匹配规则配套数据（停用词、同盟词），不含武将名单
   │  ├─ generals-data.ts   # 内置武将名单数据点（同构 {version, generals}，兜底，仅简体）
   │  ├─ generals.ts        # 武将名单自动更新（三级回退 + 赛季版本比较）
   │  ├─ cloud.ts           # 云端同步（JSONBin.io）
   │  ├─ store.ts           # 本地持久化与去重合并
   │  └─ analysis.ts        # 胜率/标识分析
   ├─ public/           # 前端静态资源（app.js / index.html / style.css）
   └─ py/
      └─ ocr_service.py # 独立 OCR HTTP 服务
```

***

## 数据模型

`BattleRecord`（见 `store.ts`），每条战斗记录按「左方视角」「右方视角」各生成一条条目：

```ts
interface BattleRecord {
  comp: string;        // 阵容，如 "周瑜/诸葛亮/诸葛瑾"（三个武将按名排序，/ 分隔）
  compReds: number[];  // 逐武将红度（0-5，未知 -1），顺序与 comp 对应，旧数据可能为空数组
  alliance: string;    // 该方同盟
  result: 'win' | 'lose';
  stars: number;       // 阵容总红度（0-15），含未知则为 -1
  ts: number | null;   // 战报时间戳（取战报上时间，非上传时间）
  battleTime: string;  // 战报时间字符串，如 "2026/08/05 16:17:24"，未识别为空串
  hpAfter: string;     // 战后剩余兵力，未识别为空串
  hpBefore: string;    // 战前兵力，未识别为空串
  image: string;       // 来源截图文件名
}
```

**去重键**（`store.ts` 的 `recordKey`）：`alliance | comp | compReds | hpAfter | hpBefore | battleTime`，全部相同视为重复战报，自动剔除不持久化。

***

## 关键约定与硬约束

### 端口 / 页面

- Web = 3001、OCR = 5050，不允许改动。

- 网页标题与主页大标题均为「**欧润吉战报分析助手**」，不可改回「战报分析」。

### 识别与数据

- **每侧武将 <3 个的战报整体剔除**，不参与统计。

- 阵容必须显示完整格式（如 `曹丕/荀攸/郭嘉`），不得缩写；行列表头共用 `compChips()` 渲染。

- 同盟名必须 ≥2 个字符（排除单字玩家名）；用「盟」logo 提取，无 logo 回退到底线行。

- 同盟 OCR 用 scale 2 区域精修去前后缀噪声（`ALLIANCE_NOISE_PREFIX` / 后缀集合）。

- 红度识别走连通域分析（`red.ts`）。阵容总红度 = 逐武将红度之和；武将红度未知标记 -1。

- 战报时间取自截图上时间（兼容粘连格式，如 `2026/08/1509:30:08` 自动补空格），而非上传时间。

- OCR 采用**两阶段**：先整图 OCR（scale 1.3），任一侧识别数 <3 才触发 scale 2 区域精修。**不要并行化 OCR 推理**（纯 CPU 下单次 onnxruntime 已占满线程池，并行反而更慢，保持顺序推理 + HTTPServer）。

- 图片解码有缓存（ocr\_service.py 按路径 LRU、red.ts 按原图缓存），勿破坏。

### 名单更新（generals-data.ts / generals.ts）

- **名单数据与代码解耦**：武将名单存在 `generals-data.ts`（同构 `{version, generals}`），`dict.ts` 只含配套匹配规则；`match.ts` 通过 `getGenerals()` 用运行时生效名单，识别词库与名单管理同源。

- **版本号格式**：`s{赛季}-{YYYY-MM-DD}`（如 `s16-2026-09-01`）。新武将随赛季发布，内置名单独占赛季号（当前 **16**）。

- **三级回退**：内置 `generals-data.ts` → 本地缓存 `data/generals.json` → GitHub 源。本地缓存存在则优先于内置（内置仅无缓存时兜底）。

- 源：`REPO=1TzUs/OrangeAnalysis`、`BRANCH=master`，多镜像按序（jsDelivr CDN 优先，raw\.github 兜底），**需探测全部镜像取版本号最高一份**，不可「首个成功即停」（避免陈旧 CDN 覆盖）。

- `GENERALS_RAW_URL` 环境变量可覆盖源（优先级最高）。

- 校验：仅中文 2\~4 字，去重，上限 300。非法时保留现有名单，不崩溃。

- **版本比较** **`cmpVersion`**：解析版本为 `{season, date}`，**先比赛季号，同赛季再比日期**；旧纯日期 `YYYY-MM-DD` 视为赛季 0，低于任何 `sN` 版本；无效串视为最低。

- **防降级**：`update` 仅当远程版本**严格高于**当前生效版本时才热替换+持久化（`cmpVersion>0`），否则保留现有——避免旧格式源/陈旧源覆盖新赛季版本。

- 数据持久化到 `data/generals.json`；本地缓存损坏回退内置名单。

- API：`/api/generals` 返回 `{generals, version, season, count}`；赛季号取当前生效版本解析值。

- **前端展示**：设置页「武将名单」卡片只显示**赛季**（`S{season}`），无赛季/内置时显示「内置默认」；**不显示武将数量**。更新弹窗用完整版本「武将名单已更新至 s16-2026-09-01」。

- **维护约定**：新增/改名武将须**同时更新** `generals-data.ts` 与 GitHub `generals.json`，并抬升 version 为 `s{新赛季}-{更新日期}`，二者须保持同构一致。

### 云端（cloud.ts / 路由）

- **Access/Master Key 只允许存后端源码**，禁止出现在前端 JS。生产以 `CLOUD_ACCESS_KEY` / `CLOUD_MASTER_KEY` 环境变量覆盖默认。

- Bin ID `6a8d859ada38895dfe0e7cd5`；数据文件名 `records.json`。

- 下拉上传文案用「与云端数据合并去重后上传」（行为是合并去重，非覆盖），勿写成会误导的词。

- 当前端**下载覆盖本地成功后**必须刷新：删分析缓存（`delete dataset.last`）、重建联盟 chips（`refreshAllianceChips()`）、若在分析页重载（`loadAnalysis()`）。

- 清空云端需口令 `orange`，清后写入占位 `{"records":[]}`。

### 前端缓存

- 静态 JS（`app.js`）改动后必须更新 `index.html` 中 script 的缓存指纹（`?v=YYYYMMDD-N`）。

- 后端对 `index.html`/HTML 设 `Cache-Control: no-store`，强制每次获取最新入口（勿移除）。

### 时长标识（subject 阈值）

- 各阈值参数由前端设置页下发，**显式 0 值要原样下发，不被默认值覆盖**（见 `/api/analyze` 中 `wbMin/truckMin/trapMin` 的空值判断逻辑）。

***

## 编码规范

- 全局中文注释；**所有函数添加函数级 JSDoc 注释**（功能/参数/返回值/异常）。

- TypeScript，ESM（`import ... from '...'`），`.js` 后缀引入（NodeNext 风格）。

- 变量/函数名用英文 camelCase，常量 UPPER\_SNAKE；文件/路径英文。

- 优先最小改动，倾向编辑现有文件而非新建。

- 注释只写在逻辑不自明处；不改动他人代码时不要顺手重构无关部分。

***

## 红线（必须先经用户同意）

- 删除文件/目录/git 历史。

- 修改 `.env`、密钥、token、证书、CI/CD 配置。

- `git push`、`git rebase`、`git reset --hard`、强推。

- 公开发布。

- 项目相关文件不写入 C 盘（除用户明确指定）。

## Git

- **不自动 commit / push**，除非用户明确要求；提交前先展示变更摘要；commit message 用简洁英文。

- 仓库为含 CRLF/换行符历史问题的 Windows repo，建议配合 `.gitattributes` 规范换行符，避免伪差异。

## 其他

- 每次打开网页前端自动调 `/api/generals/update` 检查名单更新；仅检测到**版本更新**时前端弹一次通知「武将名单已更新至 ${version}」（完整版本，如 s16-2026-09-01）。

- 改动识别/前端后需自验效果，有问题先定位再按用户要求修复，修复独立完成后再交付。

- 保持预置文档（技术文档.md / 更新日志.md / 开发日志.md / README.md）与实际行为一致，避免文档漂移。

