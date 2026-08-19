/**
 * 分析聚合模块：基于已持久化的战斗记录，计算阵容胜率排行与对战矩阵。
 * 支持按同盟、时间范围筛选。
 */
import { loadRecords, BattleRecord } from './store.js';

/** 红度分档边界（阵容三武将合计 0-15 红） */
export const STAR_BRACKETS = [
  { label: '0-5红', min: 0, max: 5 },
  { label: '6-8红', min: 6, max: 8 },
  { label: '9-11红', min: 9, max: 11 },
  { label: '12-14红', min: 12, max: 14 },
  { label: '15红', min: 15, max: 15 },
];

/** 阵容统计条目 */
export interface CompStat {
  comp: string;
  total: number;
  wins: number;
  winRate: number; // 0-100
  avgStars: number; // 平均红度，无数据时为 0
  starsKnown: number; // 有红度数据的场次
  brackets: Record<string, { total: number; wins: number; winRate: number }>;
}

/** 对战矩阵单元 */
export interface MatrixCell {
  total: number;
  wins: number; // 行阵容获胜场次
  winRate: number;
}

/** 分析结果 */
export interface AnalysisResult {
  comps: CompStat[];     // 按胜率/场次排序的阵容列表
  matrix: {
    comps: string[];     // 矩阵行列阵容（按场次降序）
    cells: Record<string, Record<string, MatrixCell>>; // [row][col]
  };
  filters: { alliance: string; hours: number };
  generatedAt: number | null;
}

/** 筛选后的记录 */
function filterRecords(alliance: string, hours: number): BattleRecord[] {
  const now = Date.now();
  return loadRecords().filter((r) => {
    if (alliance && r.alliance !== alliance) return false;
    // 未识别战报时间（ts 为 null）的记录无法判定是否在时间范围内，按范围外处理
    if (hours > 0 && (r.ts == null || now - r.ts > hours * 3600 * 1000)) return false;
    return true;
  });
}

/** 计算胜率 */
function rate(wins: number, total: number): number {
  return total ? Math.round((wins / total) * 1000) / 10 : 0;
}

/**
 * 生成分析结果。
 * @param alliance 同盟名（空串表示全部）
 * @param hours 时间范围小时数（0 表示不限）
 */
export function analyze(alliance: string, hours: number): AnalysisResult {
  const filtered = filterRecords(alliance, hours);

  // 剔除任一侧识别武将不足 3 个的战斗。
  // 记录按「左右两条相邻」写入（同一 image+ts），故按相邻对成对剔除，
  // 既不影响同图其它正常战斗，也保持剩余记录仍成对相邻，供下方矩阵两两配对。
  const records: BattleRecord[] = [];
  for (let i = 0; i + 1 < filtered.length; i += 2) {
    const a = filtered[i];
    const b = filtered[i + 1];
    // 防御：非同一战斗的两条（或单条）直接丢弃，避免破坏配对
    if (a.image !== b.image || a.ts !== b.ts) continue;
    if (a.comp.split('/').length < 3 || b.comp.split('/').length < 3) continue;
    records.push(a, b);
  }

  // 阵容统计
  const compMap = new Map<string, CompStat>();
  const compWins = new Map<string, number>();
  const compStars = new Map<string, number[]>();
  const bracketMap = new Map<string, Map<string, { total: number; wins: number }>>();

  for (const r of records) {
    if (!compMap.has(r.comp)) {
      compMap.set(r.comp, {
        comp: r.comp,
        total: 0,
        wins: 0,
        winRate: 0,
        avgStars: 0,
        starsKnown: 0,
        brackets: {},
      });
    }
    const stat = compMap.get(r.comp)!;
    stat.total++;
    if (r.result === 'win') {
      stat.wins++;
      compWins.set(r.comp, (compWins.get(r.comp) ?? 0) + 1);
    }
    if (r.stars >= 0) {
      stat.starsKnown++;
      if (!compStars.has(r.comp)) compStars.set(r.comp, []);
      compStars.get(r.comp)!.push(r.stars);
      const bracket = STAR_BRACKETS.find((b) => r.stars >= b.min && r.stars <= b.max);
      if (bracket) {
        if (!bracketMap.has(r.comp)) bracketMap.set(r.comp, new Map());
        const bm = bracketMap.get(r.comp)!;
        if (!bm.has(bracket.label)) bm.set(bracket.label, { total: 0, wins: 0 });
        const cell = bm.get(bracket.label)!;
        cell.total++;
        if (r.result === 'win') cell.wins++;
      }
    }
  }

  // 计算胜率、平均红度、分档胜率
  const comps: CompStat[] = [...compMap.values()].map((s) => {
    s.winRate = rate(s.wins, s.total);
    const starsArr = compStars.get(s.comp) ?? [];
    s.avgStars = starsArr.length
      ? Math.round((starsArr.reduce((a, b) => a + b, 0) / starsArr.length) * 10) / 10
      : 0;
    const bm = bracketMap.get(s.comp);
    s.brackets = {};
    for (const b of STAR_BRACKETS) {
      const c = bm?.get(b.label);
      s.brackets[b.label] = c
        ? { total: c.total, wins: c.wins, winRate: rate(c.wins, c.total) }
        : { total: 0, wins: 0, winRate: 0 };
    }
    return s;
  });

  // 排序：先按场次降序，再按胜率降序
  comps.sort((a, b) => b.total - a.total || b.winRate - a.winRate);

  // 对战矩阵：取场次前 N 的阵容
  const matrixComps = comps.slice(0, 15).map((c) => c.comp);
  const cells: Record<string, Record<string, MatrixCell>> = {};
  for (const row of matrixComps) {
    cells[row] = {};
    for (const col of matrixComps) cells[row][col] = { total: 0, wins: 0, winRate: 0 };
  }
  // 逐战斗配对：需要成对的左右记录。这里按记录顺序两两配对（每战斗两条相邻记录）
  for (let i = 0; i + 1 < records.length; i += 2) {
    const a = records[i];
    const b = records[i + 1];
    // 仅处理同一战斗的左右两条（image+ts 相同）
    if (a.image !== b.image || a.ts !== b.ts) continue;
    if (!matrixComps.includes(a.comp) || !matrixComps.includes(b.comp)) continue;
    const cell = cells[a.comp][b.comp];
    cell.total++;
    if (a.result === 'win') cell.wins++;
    // 反向单元（b 视角）也累计相同场次
    const rcell = cells[b.comp][a.comp];
    rcell.total++;
    if (b.result === 'win') rcell.wins++;
  }
  // 计算矩阵胜率
  for (const row of matrixComps) {
    for (const col of matrixComps) {
      const c = cells[row][col];
      c.winRate = rate(c.wins, c.total);
    }
  }

  return {
    comps,
    matrix: { comps: matrixComps, cells },
    filters: { alliance, hours },
    generatedAt: records.length ? Date.now() : null,
  };
}