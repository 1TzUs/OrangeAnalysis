/**
 * 武将名单动态源：支持从 GitHub 拉取并热替换识别词库。
 *
 * 设计：
 *  1. GitHub 上维护一份 generals.json，形如 { "version": "2026-08-27", "generals": ["曹丕", ...] }。
 *  2. 后端启动时先读本地缓存 data/generals.json；没有则回退到 dict.ts 内置名单。
 *  3. 网页打开时前端调用 /api/generals/update，后端据此拉取远程、校验、持久化并热替换。
 *
 * 安全性：仅接受中文 2~4 字的武将名，去重并限制数量，远程数据非法时保留现有名单不崩溃。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GENERAL_LIST } from './generals-data.js';

// 模块目录：ESM 下用 import.meta.url；被打包为 CJS(exe) 时 import.meta 无 url，回退到 exe 所在目录
const __dirname = (() => {
  try {
    return path.dirname(fileURLToPath(import.meta.url));
  } catch {
    return path.dirname(process.execPath);
  }
})();
// 部署根目录：打包为自包含 exe 时使用 exe 所在目录（data 需外部可写）；
// 开发模式（npm run dev/start）下回退到 server/ 目录。
const ROOT = (process as unknown as { pkg?: unknown }).pkg
  ? path.dirname(process.execPath)
  : path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'generals.json');

/**
 * 名单源仓库常量（手动推送配置）：
 *   1. 将 server/generals.json 上传到你的 GitHub 仓库（OrangeAnalysis 的 master 分支）；
 *   2. 更新时同步修改下面 REPO 指向的 owner/repo 与 BRANCH；
 *   3. SUPPLY 名单靠下方 DEFAULT_MIRRORS 多镜像按序尝试，避免 raw.githubusercontent.com 被墙时拉取失败。
 * 也可用环境变量 GENERALS_RAW_URL 显式指定单个优先源（开发用，优先级最高）。
 * 未配置时检查更新接口直接返回「未配置」，前端静默沿用内置名单，不报错。
 */
const REPO = '1TzUs/OrangeAnalysis';
const BRANCH = 'master';
/** 默认镜像按序尝试：jsDelivr CDN（国内可达）优先，raw.githubusercontent.com 兜底 */
const DEFAULT_MIRRORS = [
  `https://cdn.jsdelivr.net/gh/${REPO}@${BRANCH}/generals.json`,
  `https://raw.githubusercontent.com/${REPO}/refs/heads/${BRANCH}/generals.json`,
];
const SOURCE_URLS = process.env.GENERALS_RAW_URL
  ? [process.env.GENERALS_RAW_URL]
  : DEFAULT_MIRRORS;

/** 武将名合法校验：仅中文 2~4 字（木鹿大王/祝融夫人 为 4 字） */
const NAME_RE = /^[\u4e00-\u9fa5]{2,4}$/;
/** 名单数量上限，防止刷入异常超大词库拖慢编辑距离匹配 */
const MAX_GENERALS = 300;

interface GeneralFile {
  version?: unknown;
  generals?: unknown;
}

let currentList: string[] = GENERAL_LIST.generals;
let currentVersion = GENERAL_LIST.version;

/** 读取当前生效的武将名单 */
export function getGenerals(): string[] {
  return currentList;
}

/** 当前名单版本号（空串表示内置默认） */
export function getVersion(): string {
  return currentVersion;
}

/** 当前名单入口角色数 */
export function getCount(): number {
  return currentList.length;
}

/** 从本地缓存 data/generals.json 恢复名单（无则不处理）。 */
export function loadLocal(): void {
  try {
    if (!fs.existsSync(DATA_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as GeneralFile;
    const list = sanitize(raw.generals);
    if (list.length) {
      currentList = list;
      currentVersion = typeof raw.version === 'string' ? raw.version : '';
    }
  } catch {
    // 缓存损坏则保留内置名单
  }
}

/** 校验并清理远程名单，非法输入返回空数组 */
function sanitize(generals: unknown): string[] {
  if (!Array.isArray(generals)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const g of generals) {
    if (typeof g !== 'string') continue;
    const name = g.trim();
    if (!NAME_RE.test(name)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
    if (out.length >= MAX_GENERALS) break;
  }
  return out;
}

interface UpdateResult {
  updated: boolean;
  version: string;
  count: number;
  source: string;
  error?: string;
}

/** 当前生效名单的赛季号：解析自版本号（sN-YYYY-MM-DD），无赛季/无效时为 null */
export function getSeason(): number | null {
  const { season } = parseVersion(currentVersion);
  return season >= 1 ? season : null;
}

/** 解析版本串为 {赛季号, 日期时间戳}。支持新格式 sN-YYYY-MM-DD，兼容旧纯日期 YYYY-MM-DD（视为初始赛季 0）；无效返回赛季 -1 */
function parseVersion(v: string): { season: number; date: number } {
  const s = (v ?? '').trim();
  const m = /^s(\d+)-(\d{4}-\d{2}-\d{2})$/.exec(s);
  if (m) {
    const date = Date.parse(m[2]);
    return { season: parseInt(m[1], 10), date: Number.isNaN(date) ? 0 : date };
  }
  const d = /^(\d{4}-\d{2}-\d{2})$/.exec(s);
  if (d) {
    const date = Date.parse(d[1]);
    return { season: 0, date: Number.isNaN(date) ? 0 : date }; // 旧纯日期视为赛季 0
  }
  return { season: -1, date: 0 }; // 无效版本视为最低优先级
}

/** 版本号比较：先比赛季号，同赛季再比日期（如 s15-2026-08-28 > s15-2026-08-27；旧纯日期赛季 0 低于任何 sN） */
function cmpVersion(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  if (pa.season !== pb.season) return pa.season - pb.season;
  return pa.date - pb.date;
}

/** 检查并应用远程名单更新：拉取 → 校验 → 热替换 + 持久化。失败时保留现有名单。 */
export async function checkGeneralsUpdate(): Promise<UpdateResult> {
  if (!SOURCE_URLS.length) {
    return {
      updated: false,
      version: currentVersion,
      count: currentList.length,
      source: '',
      error: '未配置名单源（GENERALS_RAW_URL）',
    };
  }
  // 探测所有镜像：CDN 可能有旧缓存（返回合法 JSON 但版本陈旧），因此不能「第一个成功即停」，
  // 而是收集全部成功响应，选版本号最高的一份作为真源，避免陈旧 CDN 覆盖真源的新版本。
  interface Cand { version: string; list: string[]; source: string; }
  const cands: Cand[] = [];
  for (const url of SOURCE_URLS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const p = (await res.json()) as GeneralFile;
      const list = sanitize(p.generals);
      if (!list.length) continue;
      cands.push({ version: typeof p.version === 'string' ? p.version : '', list, source: url });
    } catch {
      continue; // 该镜像失败，尝试下一个
    } finally {
      clearTimeout(timer);
    }
  }
  if (!cands.length) {
    return {
      updated: false,
      version: currentVersion,
      count: currentList.length,
      source: SOURCE_URLS.join(', '),
      error: '名单源均不可达或内容非法',
    };
  }
  // 选版本号最高者；版本相同时取镜像顺序靠前者（稳定排序）
  cands.sort((a, b) => cmpVersion(b.version, a.version) || 0);
  const chosen = cands[0];
  // 仅当远程版本严格「高于」当前生效版本时才升级。引入赛季版本后，新格式 sN-YYYY-MM-DD 可能
  // 在数字上高于/低于旧纯日期格式，若远程为不如当前（如旧格式降级源），应保留现有，避免被覆盖。
  if (cmpVersion(chosen.version, currentVersion) <= 0) {
    return { updated: false, version: currentVersion, count: currentList.length, source: chosen.source };
  }
  // 应用并持久化
  currentList = chosen.list;
  currentVersion = chosen.version;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify({ version: chosen.version, generals: chosen.list }, null, 2), 'utf-8');
  return { updated: true, version: chosen.version, count: chosen.list.length, source: chosen.source };
}

// 启动时恢复上次持久化的名单
loadLocal();