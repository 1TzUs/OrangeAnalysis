/**
 * 战报识别服务端入口：提供图片上传→识别→返回数据的 HTTP API，并托管前端静态资源。
 */
import express from 'express';
import multer from 'multer';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseBattleImage } from './recognizer.js';
import { parsePortraitImage } from './recognizer-portrait.js';
import { battleToRecords, appendRecords, loadRecords, clearRecords, BattleRecord } from './store.js';
import { analyze } from './analysis.js';

// 模块目录：ESM 下用 import.meta.url；被打包为 CJS(exe) 时 import.meta 无 url，回退到 exe 所在目录
const __dirname = (() => {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return path.dirname(process.execPath);
  }
})();
// 部署根目录：打包为自包含 exe 时使用 exe 所在目录（data/tmp 需外部可写，public 随 exe 分发）；
// 开发模式（npm run dev/start）下回退到 server/ 目录。
const ROOT = (process as unknown as { pkg?: unknown }).pkg
  ? path.dirname(process.execPath)
  : path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const UPLOAD_DIR = path.join(ROOT, 'tmp', 'uploads');

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 仅允许图片上传，限制 20MB
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase() || '.png';
      cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(png|jpe?g|webp|bmp)$/i.test(file.originalname);
    cb(null, ok);
  },
});

const app = express();
app.use(cors());
app.use(express.json({ limit: '20mb' }));

// 静态资源（前端）
app.use(express.static(PUBLIC_DIR));

/**
 * 根据上传模式选择识别器。
 * @param mode 识别模式：'portrait'（PE 竖屏）或 'pc'（PC 横屏，默认）
 */
function pickParser(mode: string) {
  return mode === 'portrait' ? parsePortraitImage : parseBattleImage;
}

/** 单图识别（mode=pc 横屏 / mode=portrait 竖屏） */
app.post('/api/parse', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: '未收到图片文件' });
      return;
    }
    const mode = String(req.body.mode ?? 'pc');
    const parse = pickParser(mode);
    const result = await parse(req.file.path);
    // 解析出的战斗记录自动持久化，供分析模块聚合
    appendRecords(battleToRecords(result.battles, req.file.filename));
    // 返回识别结果，同时附带缩略图访问地址
    res.json({
      mode,
      image: `/uploads/${req.file.filename}`,
      ...result,
    });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** 多图识别（表单字段 images，可多选） */
app.post('/api/parse-many', upload.array('images', 20), async (req, res) => {
  try {
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (!files.length) {
      res.status(400).json({ error: '未收到图片文件' });
      return;
    }
    // 顺序识别：实测多图并行无加速（4张整版图：顺序17.4s vs 并行17.7s）。
    // 纯 CPU 下单次 onnxruntime 推理已占满线程池，并行只是排队/线程争用，不改此循环。
    const items = [];
    for (const f of files) {
      const result = await parseBattleImage(f.path);
      items.push({ image: `/uploads/${f.filename}`, ...result });
      // 持久化该图的战斗记录
      appendRecords(battleToRecords(result.battles, f.filename));
    }
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

// 上传目录静态访问（返回缩略图原图）
app.use('/uploads', express.static(UPLOAD_DIR));

/** 分析接口：按同盟、时间范围、战前兵力下限、阵容场次下限获取统计结果 */
app.get('/api/analyze', (req, res) => {
  try {
    const { alliance = '', hours = 0, minHp = 0, minCount = 0, hotMin = 5, hotRate = 0.1, hotHours = 3, wbRate = 51, wbMin = 5, truckRate = 60, truckMin = 5, trapMin = 20 } = req.query;
    // 快速升温阈值由前端设置页驱动；未传时回退到默认值（近3h、至少5场、占比10%）
    const hot = {
      min: Number(hotMin) || 5,
      rate: Number(hotRate) || 0.1,
      ms: Math.max(1, Number(hotHours) || 3) * 3600 * 1000,
    };
    // 白板之光 / 泥头车 / 陷阱判定阈值由设置页独立下发；未传时回退默认（白板 0-5红段 ≥51%；泥头 >60%；陷阱 ≥20场且 <50%）
    const badge = {
      wbRate: Number(wbRate) || 51,
      wbMin: wbMin === undefined || wbMin === '' ? 5 : Number(wbMin),
      truckRate: Number(truckRate) || 60,
      truckMin: truckMin === undefined || truckMin === '' ? 5 : Number(truckMin),
      trapMin: trapMin === undefined || trapMin === '' ? 20 : Number(trapMin),
    };
    const result = analyze(String(alliance), Number(hours), Number(minHp) || 0, Number(minCount) || 0, hot, badge);
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message });
  }
});

/** 获取全部原始战斗记录（供前端展示/调试） */
app.get('/api/records', (_req, res) => {
  res.json({ items: loadRecords() });
});

/** 清空全部记录 */
app.post('/api/records/clear', (_req, res) => {
  clearRecords();
  res.json({ ok: true, count: 0 });
});

const PORT = Number(process.env.PORT ?? 3001);
app.listen(PORT, () => {
  console.log(`战报识别服务已启动: http://localhost:${PORT}`);
});