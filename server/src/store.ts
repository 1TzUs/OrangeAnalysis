/**
 * 数据持久化模块：将识别出的战斗记录落盘保存，供分析功能聚合统计。
 * 每条战斗记录按「左方视角」「右方视角」各生成一条条目，
 * 便于直接统计任意阵容/同盟的胜率。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Battle, General } from './recognizer.js';

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
const DATA_FILE = path.join(DATA_DIR, 'records.json');

/** 单条战斗记录（从某一方视角） */
export interface BattleRecord {
  comp: string;        // 阵容：三个武将名拼接，如 "周瑜/诸葛亮/诸葛瑾"
  compReds: number[];  // 逐武将红度，顺序与 comp 中武将一致（0-5，未知 -1），旧数据缺失为空数组
  alliance: string;    // 该方所属同盟
  result: 'win' | 'lose';
  stars: number;       // 阵容总红度（0-15），未知时为 -1
  ts: number | null;   // 战报时间戳（解析自战报上的时间），未识别为 null
  battleTime: string;  // 战报原始时间字符串（如 "2026/08/05 16:17:24"），未识别为空串
  hpAfter: string;     // 战后剩余兵力，如 "25000"，未识别为空串
  hpBefore: string;    // 战前兵力，如 "30000"，未识别为空串
  image: string;       // 来源截图文件名
}

let cache: BattleRecord[] | null = null;

/** 读取全部记录（带缓存） */
export function loadRecords(): BattleRecord[] {
  if (cache) return cache;
  try {
    if (!fs.existsSync(DATA_FILE)) {
      cache = [];
      return cache;
    }
    // 兼容旧数据：补齐缺失的新增字段（battleTime 默认空串，hp 旧格式 "剩余/战前" 拆分为 hpAfter/hpBefore，ts 非数字视为 null）
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as (BattleRecord & { hp?: string })[];
    cache = raw.map((r) => {
      const hp = splitHp(r.hp ?? '');
      return {
        comp: r.comp,
        // 旧数据无 compReds：按空数组处理（无法反推逐武将红度），分析/展示会退化为不显示
        compReds: Array.isArray(r.compReds) ? r.compReds : [],
        alliance: r.alliance,
        result: r.result,
        stars: r.stars,
        ts: typeof r.ts === 'number' ? r.ts : null,
        battleTime: r.battleTime ?? '',
        hpAfter: r.hpAfter ?? hp.after,
        hpBefore: r.hpBefore ?? hp.before,
        image: r.image,
      };
    });
  } catch {
    cache = [];
  }
  return cache;
}

/** 去重键：同盟 + 阵容 + 逐武将红度 + 兵力(战前/战后) + 战报时间，全部相同视为重复战报 */
function recordKey(r: BattleRecord): string {
  return `${r.alliance}|${r.comp}|${r.compReds.join(',')}|${r.hpAfter}|${r.hpBefore}|${r.battleTime}`;
}

/** 追加写入记录并立即落盘（自动去重） */
export function appendRecords(records: BattleRecord[]): void {
  if (!records.length) return;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const all = loadRecords();
  const seen = new Set(all.map(recordKey));
  const added: BattleRecord[] = [];
  for (const r of records) {
    const key = recordKey(r);
    if (seen.has(key)) continue;
    seen.add(key);
    added.push(r);
  }
  if (!added.length) return;
  all.push(...added);
  cache = all;
  fs.writeFileSync(DATA_FILE, JSON.stringify(all, null, 2), 'utf-8');
}

/**
 * 将单条待导入数据校验并规范化为 BattleRecord；不满足核心字段（阵容 comp、同盟 alliance）视为非法，返回 null。
 * 兼容旧记录格式（hp 合并字段、缺省字段）与数字/布尔 result。
 * @param r 待导入的原始记录
 * @returns 规范化后的记录；非法返回 null
 */
function normalizeImported(r: unknown): BattleRecord | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as Record<string, unknown>;
  const comp = typeof o.comp === 'string' && o.comp.trim() ? o.comp.trim() : null;
  const alliance = typeof o.alliance === 'string' && o.alliance.trim() ? o.alliance.trim() : null;
  if (!comp || !alliance) return null; // 缺阵容或同盟，无法参与统计，判为非法
  const hp = splitHp((o.hp as string) ?? '');
  // 兼容旧 hp 格式：新数据优先取独立的 hpAfter/hpBefore 字段
  const hpAfter = typeof o.hpAfter === 'string' ? o.hpAfter : hp.after;
  const hpBefore = typeof o.hpBefore === 'string' ? o.hpBefore : hp.before;
  return {
    comp,
    compReds: Array.isArray(o.compReds) ? o.compReds.map((n) => Number(n)).filter((n) => Number.isFinite(n)) : [],
    alliance,
    // result 兼容 'win'/'lose' 与布尔/数字（0=败，其余视为胜）
    result: o.result === 'lose' || o.result === 0 || o.result === false ? 'lose' : 'win',
    stars: Number.isFinite(Number(o.stars)) ? Number(o.stars) : -1,
    ts: Number.isFinite(Number(o.ts)) ? Number(o.ts) : null,
    battleTime: typeof o.battleTime === 'string' ? o.battleTime : (typeof o.time === 'string' ? o.time : ''),
    hpAfter,
    hpBefore,
    image: typeof o.image === 'string' ? o.image : '',
  };
}

/**
 * 导入一份记录数组：逐条校验并规范化，然后与已有数据合并（按去重键去重）。
 * 返回统计信息供前端展示。
 * @param raw 导入的原始数据（顶层数组，或 { items: [...] } 对象）
 * @returns { added 新增条数, total 有效条数, skipped 非法条数 }
 */
export function importRecords(raw: unknown): { added: number; total: number; skipped: number } {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { items?: unknown[] }).items)
      ? (raw as { items: unknown[] }).items
      : null;
  if (!arr) throw new Error('文件格式不正确：应为战报记录数组');
  const valid: BattleRecord[] = [];
  let skipped = 0;
  for (const r of arr) {
    const n = normalizeImported(r);
    if (n) valid.push(n);
    else skipped++;
  }
  const before = loadRecords().length;
  appendRecords(valid);
  const after = loadRecords().length;
  return { added: after - before, total: valid.length, skipped };
}

/** 清空全部记录（用于测试/重置） */
export function clearRecords(): void {
  cache = [];
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
}

/** 将武将列表规范化为阵容 key 及逐武将红度（排序去重，保证顺序无关，红度顺序与 key 一致） */
export function compOf(generals: General[]): { comp: string; compReds: number[] } {
  const sorted = generals
    .map((g) => ({ name: g.name, red: g.red }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    comp: sorted.map((s) => s.name).join('/'),
    compReds: sorted.map((s) => s.red),
  };
}

/**
 * 将一张图的解析结果拆成多条战斗记录（左、右各一条）。
 * 持久化的时间取战报上的时间（battle.time），而非上传/识别时间；未识别则 ts=null、battleTime 为空串。
 * @param battles 解析出的战斗列表
 * @param imageName 来源截图文件名
 */
export function battleToRecords(battles: Battle[], imageName: string): BattleRecord[] {
  const records: BattleRecord[] = [];
  for (const b of battles) {
    if (!b.leftAlliance || !b.rightAlliance) continue;
    // 任一侧识别出的武将不足 3 个则整场剔除（本文档按 3 武将阵容统计）
    if (b.leftGenerals.length < 3 || b.rightGenerals.length < 3) continue;
    const ts = parseBattleTime(b.time);
    // 阵容总红度 = 各武将红度之和（武将红度未知(-1)则该阵容红度按 -1 处理）
    const leftStars = sumRed(b.leftGenerals);
    const rightStars = sumRed(b.rightGenerals);
    // 左方兵力：原始 "剩余/战前" 拆分为战后剩余 hpAfter、战前 hpBefore
    const leftHp = splitHp(b.leftHp);
    const rightHp = splitHp(b.rightHp);
    // 左方阵容 key 与逐武将红度
    const leftComp = compOf(b.leftGenerals);
    const rightComp = compOf(b.rightGenerals);
    // 左方视角
    records.push({
      comp: leftComp.comp,
      compReds: leftComp.compReds,
      alliance: b.leftAlliance,
      result: b.result === 'win' ? 'win' : 'lose',
      stars: leftStars,
      ts,
      battleTime: b.time,
      hpAfter: leftHp.after,
      hpBefore: leftHp.before,
      image: imageName,
    });
    // 右方视角
    records.push({
      comp: rightComp.comp,
      compReds: rightComp.compReds,
      alliance: b.rightAlliance,
      result: b.result === 'win' ? 'lose' : 'win',
      stars: rightStars,
      ts,
      battleTime: b.time,
      hpAfter: rightHp.after,
      hpBefore: rightHp.before,
      image: imageName,
    });
  }
  return records;
}

/** 拆分兵力字符串 "剩余/战前"（如 "25000/30000"）为战后剩余 hpAfter 与战前 hpBefore；无法解析则两者均为空串 */
function splitHp(hp: string): { after: string; before: string } {
  const parts = (hp ?? '').split('/').map((s) => s.trim());
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { after: parts[0], before: parts[1] };
  }
  return { after: '', before: '' };
}

/**
 * 解析战报时间字符串为时间戳；无法解析返回 null。
 * 兼容 "2026/08/05 16:17:24" 与 "2026-08-05 16:17:24"（斜杠统一替换为短横线）。
 */
function parseBattleTime(t: string): number | null {
  if (!t) return null;
  const ts = Date.parse(t.replace(/\//g, '-'));
  return Number.isNaN(ts) ? null : ts;
}

/** 阵容红度：各武将红度之和；含未知(-1)则为 -1 */
function sumRed(generals: General[]): number {
  if (generals.some((g) => g.red < 0)) return -1;
  return generals.reduce((s, g) => s + g.red, 0);
}