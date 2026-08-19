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
  alliance: string;    // 该方所属同盟
  result: 'win' | 'lose';
  stars: number;       // 阵容总红度（0-15），未知时为 -1
  ts: number | null;   // 战报时间戳（解析自战报上的时间），未识别为 null
  battleTime: string;  // 战报原始时间字符串（如 "2026/08/05 16:17:24"），未识别为空串
  hp: string;          // 该方兵力（"剩余/战前"，如 "25000/30000"），未识别为空串
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
    // 兼容旧数据：补齐缺失的新增字段（battleTime/hp 默认空串，ts 非数字视为 null）
    cache = (JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8')) as BattleRecord[]).map((r) => ({
      comp: r.comp,
      alliance: r.alliance,
      result: r.result,
      stars: r.stars,
      ts: typeof r.ts === 'number' ? r.ts : null,
      battleTime: r.battleTime ?? '',
      hp: r.hp ?? '',
      image: r.image,
    }));
  } catch {
    cache = [];
  }
  return cache;
}

/** 去重键：同盟 + 阵容 + 红度 + 兵力 + 战报时间，全部相同视为重复战报 */
function recordKey(r: BattleRecord): string {
  return `${r.alliance}|${r.comp}|${r.stars}|${r.hp}|${r.battleTime}`;
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

/** 清空全部记录（用于测试/重置） */
export function clearRecords(): void {
  cache = [];
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify([], null, 2), 'utf-8');
}

/** 将武将列表规范化为阵容 key（排序去重，保证顺序无关） */
export function compOf(generals: General[]): string {
  return generals
    .map((g) => g.name)
    .sort()
    .join('/');
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
    // 左方视角
    records.push({
      comp: compOf(b.leftGenerals),
      alliance: b.leftAlliance,
      result: b.result === 'win' ? 'win' : 'lose',
      stars: leftStars,
      ts,
      battleTime: b.time,
      hp: b.leftHp,
      image: imageName,
    });
    // 右方视角
    records.push({
      comp: compOf(b.rightGenerals),
      alliance: b.rightAlliance,
      result: b.result === 'win' ? 'lose' : 'win',
      stars: rightStars,
      ts,
      battleTime: b.time,
      hp: b.rightHp,
      image: imageName,
    });
  }
  return records;
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