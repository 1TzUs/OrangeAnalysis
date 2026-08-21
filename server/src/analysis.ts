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

/** 单个武将的红度统计 */
export interface GeneralRedStat {
  name: string;      // 武将名
  avgRed: number;    // 平均红度（0-5），无有效数据时为 0
  known: number;     // 参与平均的有效红度场次数
}

/** 阵容统计条目 */
export interface CompStat {
  comp: string;
  total: number;
  wins: number;
  winRate: number; // 0-100
  avgStars: number; // 平均红度，无数据时为 0
  starsKnown: number; // 有红度数据的场次
  genReds: GeneralRedStat[]; // 逐武将平均红度（顺序与 comp 中武将一致）
  brackets: Record<string, { total: number; wins: number; winRate: number }>;
  hot: boolean; // 是否「快速升温」：近 3h 新出现且出场占比达标
  hotCount: number; // 近 3h 出场场次
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
  filters: { alliance: string; hours: number; minHp: number; minCount: number };
  generatedAt: number | null;
}

/** 筛选判定：同盟精确相等 + 时间窗口 + 战前兵力下限；任一不满足则剔除 */
function passFilter(r: BattleRecord, alliance: string, hours: number, minHp: number, now: number): boolean {
  if (alliance && r.alliance !== alliance) return false;
  // 未识别战报时间（ts 为 null）的记录无法判定是否在时间范围内，按范围外处理
  if (hours > 0 && (r.ts == null || now - r.ts > hours * 3600 * 1000)) return false;
  // 兵力筛选：按战前兵力 hpBefore（未识别或低于阈值则剔除）
  if (minHp > 0 && Number(r.hpBefore) < minHp) return false;
  return true;
}

/** 计算胜率 */
function rate(wins: number, total: number): number {
  return total ? Math.round((wins / total) * 1000) / 10 : 0;
}

/**
 * 生成分析结果。
 * @param alliance 同盟名（空串表示全部）
 * @param hours 时间范围小时数（0 表示不限）
 * @param minHp 战前兵力下限（0 表示不限）
 * @param minCount 阵容总场次下限（0 表示不限）
 * @param hot 快速升温判定配置（默认近 3h、至少 5 场、占比 10%）
 */
export function analyze(
  alliance: string,
  hours: number,
  minHp = 0,
  minCount = 0,
  hot: { min: number; rate: number; ms: number } = { min: 5, rate: 0.1, ms: 3 * 3600 * 1000 },
): AnalysisResult {
  const now = Date.now();
  const all = loadRecords();

  // 战斗分组：同 image + ts + battleTime 视为同一场战斗（一对左右视角记录），按组配对
  const groups = new Map<string, BattleRecord[]>();
  for (const r of all) {
    const key = `${r.image}|${r.ts}|${r.battleTime}`;
    const list = groups.get(key);
    if (list) list.push(r);
    else groups.set(key, [r]);
  }
  // 剔除任一侧识别武将不足 3 个的战斗（整组剔除，避免污染统计与矩阵配对）
  for (const [key, list] of groups) {
    if (list.some((r) => r.comp.split('/').length < 3)) groups.delete(key);
  }
  const validKeys = new Set(groups.keys());

  // 参与统计的记录 = 筛选命中的记录（逐条统计，无需成对，同盟筛选后单条即可计入）
  const records = all.filter(
    (r) => validKeys.has(`${r.image}|${r.ts}|${r.battleTime}`) && passFilter(r, alliance, hours, minHp, now),
  );

  // 阵容统计
  const compMap = new Map<string, CompStat>();
  const compWins = new Map<string, number>();
  const compStars = new Map<string, number[]>();
  const bracketMap = new Map<string, Map<string, { total: number; wins: number }>>();
  // 逐武将红度累计：comp -> 武将名 -> { sum, count }（-1 未知不累计）
  const genRedMap = new Map<string, Map<string, { sum: number; count: number }>>();

  // 「快速升温」统计：由设置页阈值驱动，统计新出现且出场占比达标的阵容
  const HOT_MS = hot.ms;
  const HOT_MIN = hot.min; // 近 HOT_MS 至少出场 HOT_MIN 场，避免低场次偶然视为升温
  const HOT_RATE = hot.rate; // 近 HOT_MS 出场数 / 近 HOT_MS 总战报数 >= HOT_RATE 视为升温
  const hotCut = now - HOT_MS;
  let hotTotal = 0; // 近 HOT_MS 内有效记录总条数
  // comp -> { count(近HOT_MS场次), hasOld(是否有早于HOT_MS的旧记录) }
  const compHot = new Map<string, { count: number; hasOld: boolean }>();

  for (const r of records) {
    // 时间窗归类：ts 有效时才按新旧归类（ts 为 null 不参与 hot 判定，也不标记为旧）
    if (r.ts != null) {
      if (now - r.ts <= HOT_MS) {
        hotTotal++;
        let he = compHot.get(r.comp);
        if (!he) { he = { count: 0, hasOld: false }; compHot.set(r.comp, he); }
        he.count++;
      } else {
        let he = compHot.get(r.comp);
        if (!he) { he = { count: 0, hasOld: false }; compHot.set(r.comp, he); }
        he.hasOld = true;
      }
    }
    if (!compMap.has(r.comp)) {
      compMap.set(r.comp, {
        comp: r.comp,
        total: 0,
        wins: 0,
        winRate: 0,
        avgStars: 0,
        starsKnown: 0,
        genReds: [],
        brackets: {},
        hot: false,
        hotCount: 0,
      });
    }
    const stat = compMap.get(r.comp)!;
    stat.total++;
    if (r.result === 'win') {
      stat.wins++;
      compWins.set(r.comp, (compWins.get(r.comp) ?? 0) + 1);
    }
    // 逐武将红度：compReds 与 comp 顺序一一对应（旧数据缺失时跳过）
    const genNames = r.comp.split('/');
    if (r.compReds?.length && r.compReds.length === genNames.length) {
      if (!genRedMap.has(r.comp)) genRedMap.set(r.comp, new Map());
      const gm = genRedMap.get(r.comp)!;
      r.compReds.forEach((red, idx) => {
        if (red < 0) return; // 未识别红度不计入平均
        const name = genNames[idx];
        if (!gm.has(name)) gm.set(name, { sum: 0, count: 0 });
        const e = gm.get(name)!;
        e.sum += red;
        e.count++;
      });
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
  let comps: CompStat[] = [...compMap.values()].map((s) => {
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
    // 逐武将平均红度：按 comp 中武将顺序输出，保持与前端 chip 顺序一致
    const gm = genRedMap.get(s.comp);
    s.genReds = s.comp.split('/').map((name) => {
      const e = gm?.get(name);
      return e && e.count > 0
        ? { name, avgRed: Math.round((e.sum / e.count) * 10) / 10, known: e.count }
        : { name, avgRed: 0, known: 0 };
    });
    // 「快速升温」判定：近 3h 新出现（此前无旧记录）、至少出场 HOT_MIN 场，且占比达阈值
    const he = compHot.get(s.comp);
    s.hotCount = he ? he.count : 0;
    s.hot = !!(
      he &&
      !he.hasOld &&
      he.count >= HOT_MIN &&
      hotTotal > 0 &&
      he.count / hotTotal >= HOT_RATE
    );
    return s;
  });

  // 排序：先按场次降序，再按胜率降序
  comps.sort((a, b) => b.total - a.total || b.winRate - a.winRate);
  // 场次筛选：仅保留总场次达到阈值的阵容（针对聚合后的整体场次，非单条记录）
  if (minCount > 0) {
    const idx = comps.findIndex((c) => c.total < minCount);
    if (idx >= 0) comps = comps.slice(0, idx);
  }

  // 对战矩阵：取场次前 N 的阵容
  const matrixComps = comps.slice(0, 15).map((c) => c.comp);
  // 「快速升温」阵容即使场次不足也纳入矩阵行列，避免新阵容未出现在热力图首行
  for (const c of comps) {
    if (c.hot && !matrixComps.includes(c.comp)) matrixComps.push(c.comp);
  }
  const cells: Record<string, Record<string, MatrixCell>> = {};
  for (const row of matrixComps) {
    cells[row] = {};
    for (const col of matrixComps) cells[row][col] = { total: 0, wins: 0, winRate: 0 };
  }
  // 逐战斗组配对：以组内第一条命中记录为主视角，与组内其它记录配对一次（双向各累计一场）。
  // 同盟筛选后组内通常只有 1 条命中（该同盟方视角），对手取自组内未命中记录，
  // 从而矩阵仍能反映该同盟阵容对阵其它同盟的胜率；不筛选时组内两条均命中，行为与原一致。
  for (const list of groups.values()) {
    const hits = list.filter((r) => passFilter(r, alliance, hours, minHp, now));
    if (!hits.length) continue;
    const h = hits[0];
    if (!matrixComps.includes(h.comp)) continue;
    for (const op of list) {
      if (op === h || !matrixComps.includes(op.comp)) continue;
      const cell = cells[h.comp][op.comp];
      cell.total++;
      if (h.result === 'win') cell.wins++;
      // 反向单元（对手视角）也累计相同场次
      const rcell = cells[op.comp][h.comp];
      rcell.total++;
      if (op.result === 'win') rcell.wins++;
    }
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
    filters: { alliance, hours, minHp, minCount },
    generatedAt: records.length ? Date.now() : null,
  };
}