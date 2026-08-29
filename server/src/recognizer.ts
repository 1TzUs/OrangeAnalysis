/**
 * 战报识别核心模块：解析国谋定天下战报截图。
 *
 * 策略：整图 OCR 一次定位「胜/败」结果锚点并据此划分战斗；
 * 再对每个战斗的结果字下方区域做高倍 OCR，提取武将名/兵力/体力。
 * 相比逐面板裁剪，整图 OCR + 结果锚点分组对面板边界不敏感，更稳健。
 */
import sharp from 'sharp';
import { ocrImage, ocrRegionsBatch, ocrRegionService, OcrLine, OcrRegion } from './ocrService.js';
import { matchGeneral } from './match.js';
import { countRedForGeneral } from './red.js';

export interface General {
  name: string;
  raw: string;
  x: number;
  y: number;
  /** 武将名行宽（用于定位上方勾玉） */
  nameW: number;
  /** 武将名行高（用于按比例估算勾玉尺寸） */
  nameH: number;
  /** 红度：武将名称上方的勾玉数量（0-5），未识别为 -1 */
  red: number;
}

export interface Battle {
  leftGenerals: General[];
  rightGenerals: General[];
  leftAlliance: string;
  rightAlliance: string;
  /** 战报时间（如 "2026/08/05 16:17:24"），未识别为空串 */
  time: string;
  result: 'win' | 'lose' | 'unknown';
  resultText: string;
  leftHp: string;
  rightHp: string;
  hpCost: string;
  panel: { y0: number; y1: number };
}

export interface ParseResult {
  imageWidth: number;
  imageHeight: number;
  battles: Battle[];
}

/** 结果字（胜/败/平）——作为战斗锚点 */
export const RESULT_CHARS = new Set(['胜', '败', '平']);

/**
 * 战报时间模式：形如 "2026/08/05 16:17:24" 或 "2026-08-05 16:17:24"。
 * OCR 可能漏掉日期与时间间的空格（如竖屏 "2026/08/1509:30:08"），故分隔符用 \s*。
 */
export const TIME_PAT = /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}\s*\d{1,2}:\d{2}(?::\d{2})?/;

/** 从一行文本中提取战报时间字符串；无则返回空串 */
export function extractTime(text: string): string {
  const m = text.match(TIME_PAT);
  if (!m) return '';
  // OCR 可能漏掉日期与时间间的空格（如 "2026/08/1510:01:37"），统一补齐为单空格
  return m[0].replace(/^(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\s*(\d{1,2}:\d{2}(?::\d{2})?)$/, '$1 $2');
}

/** 单字徽标（盟/面/明等装饰字），应忽略 */
const BADGE_CHARS = new Set(['盟', '面', '明', '攻', '防', '三']);

/**
 * 顶部 UI 导航/筛选词：战报界面固定存在的页签/筛选按钮文字，
 * 绝不可能作为同盟名。若它们出现在战斗顶部区域，说明
 * 该战斗是从列表中间截取的（同盟名被截到图外），属非完整战斗。
 */
const UI_NAV_WORDS = new Set([
  '战报', '全部', '开拓', '交战', '同盟', '个人', '返回',
  '防守', '进攻', '工坊', '编队', '城建', '世界', '赛季',
  '活动', '战历', '胜负', '精进', '战况', '战果',
]);

/**
 * 判断一场战斗顶部是否为非完整（顶部被 UI 导航栏截断/占位）。
 * 完整战斗结果字上方应有同盟名；若结果字上方只有成排的 UI
 * 导航词（无任何战斗内容行），说明该战斗从列表中间截取、同盟名被截到图外。
 * 注意：UI 导航可能位于完整第一场的上方，因此必须同时满足
 * 「成排 UI 词」且「无战斗内容行」才判定不完整，避免误删完整第一场。
 */
function isTopTruncated(allLines: OcrLine[], range: { y0: number }, anchor: OcrLine | null): boolean {
  const genTop = anchor ? Math.max(0, anchor.y1 - 15) : range.y0;
  const band = allLines.filter((l) => l.y0 >= range.y0 && l.y0 < genTop);
  const uiHits = band.filter((l) => UI_NAV_WORDS.has(l.text.trim()));
  // 无成排 UI 导航词 => 顶部正常，非截断
  if (uiHits.length < 2) return false;
  // 有 UI 导航，再检查是否仍含战斗内容行（同盟名）
  const hasContent = band.some((l) => {
    const t = l.text.trim();
    if (UI_NAV_WORDS.has(t)) return false;
    if (RESULT_CHARS.has(t)) return false;
    if (isNoiseLine(l) || isFooterText(t)) return false;
    if ([...t].length < 2) return false;
    return /[\u4e00-\u9fa5]/.test(t);
  });
  // 只有 UI 导航而无战斗内容行 => 顶部被 UI 占据，战斗不完整
  return !hasContent;
}

/** 判断一行是否为战斗结果锚点：文本恰为结果字且字形足够大 */
export function isResultGlyph(line: OcrLine, fontH: number): boolean {
  const t = line.text.trim();
  if (!RESULT_CHARS.has(t)) return false;
  return line.y1 - line.y0 >= Math.round(fontH * 0.5);
}

/** 判断一行是否为底部信息（进攻/坐标/时间） */
export function isFooterText(text: string): boolean {
  const t = text.trim();
  if (t.includes('进攻') || t.includes('防守')) return true;
  if (/\(\d+\s*,\s*\d+\)/.test(t)) return true; // 坐标如 (194,1463)
  if (TIME_PAT.test(t)) return true; // 时间（日期与时间可能无空格）
  return false;
}

/** 判断一行是否为纯数字/徽标/无意义字符 */
export function isNoiseLine(line: OcrLine): boolean {
  const t = line.text.trim();
  if (!t) return true;
  if (/^\d+$/.test(t) || /^\d+\s*万?$/.test(t)) return true; // 纯数字
  if ([...t].length === 1 && BADGE_CHARS.has(t)) return true; // 单字徽标
  return false;
}

/** 同盟名标准别名：OCR 偶发漏掉分隔符"|"时，归一化到标准写法，避免同一同盟被拆成两个 */
const ALLIANCE_ALIASES: Record<string, string> = {
  '百战凌云': '百战|凌云',
  '风花雪月': '风花雪月',
  '剑来': '剑来',
  '宇宙洪荒': '宇宙洪荒',
};

/** 清理同盟名文本 */
export function cleanAlliance(raw: string): string {
  // 先归一化分隔符（竖线/中文竖线/间隔号 → "|"）
  let t = String(raw).replace(/[丨|｜·・]/g, '|');
  // 仅保留中文字符与"|"分隔符，去除引号/字母/符号等粘连噪声（如"剑来""→"剑来"）
  t = [...t].filter((c) => /[\u4e00-\u9fa5|]/.test(c)).join('');
  // 去掉粘连的"盟"徽标字
  t = t.replace(/盟/g, '');
  // OCR 常把分隔符"|"误读为"一"或"1"（如"百战一凌云"），当它作为名字中间
  // 的分隔符（两侧各至少 2 字）时归一化回"|"，避免同一同盟被当成多个。
  t = t.replace(/([^|]{2,})[一1]([^|]{2,})/g, '$1|$2');
  // 兜底去掉末尾已知噪声后缀（高倍 OCR 也可能读回粘连的装饰字）
  t = t.replace(new RegExp(`[${[...ALLIANCE_NOISE_SUFFIX].join('')}]+$`, 'g'), '');
  // 别名归一化：漏分隔符等 OCR 变体统一回标准名
  t = ALLIANCE_ALIASES[t] ?? t;
  return t.slice(0, 16);
}

/**
 * 解析单张战报截图。
 *
 * 效率优化（两阶段）：
 * 阶段1 只用整图 OCR 结果做纯计算，把「需要高倍识别」的区域（武将带补全、
 *       同盟名精修）收集成请求列表，但暂不调用 OCR；
 * 阶段2 一次性批量请求这些区域（合并 HTTP 往返，见 /ocr/batch），
 *       再应用结果 —— 避免了原实现「每个战斗都无条件发一次高倍 OCR」的重复检测。
 * @param imagePath 图片绝对路径
 */
export async function parseBattleImage(imagePath: string): Promise<ParseResult> {
  const meta = await sharp(imagePath).metadata();
  const W = meta.width!;
  const H = meta.height!;
  const cx = Math.round(W / 2);

  // 阶段0：整图一次 OCR，定位所有文本行
  const allLines = await ocrImage(imagePath, 1.3);

  // 结果锚点：大字「胜/败/平」
  const fontH = Math.round(H * 0.1);
  const anchors = allLines.filter((l) => isResultGlyph(l, fontH)).sort((a, b) => a.y0 - b.y0);

  // 若找不到结果锚点，退化为整图仅一个战斗
  const centers = anchors.length
    ? anchors.map((a) => (a.y0 + a.y1) / 2)
    : [H / 2];

  const battleRanges: Array<{ y0: number; y1: number }> = [];
  for (let i = 0; i < centers.length; i++) {
    const top = i === 0 ? 0 : Math.round((centers[i - 1] + centers[i]) / 2);
    const bot = i === centers.length - 1 ? H : Math.round((centers[i] + centers[i + 1]) / 2);
    battleRanges.push({ y0: top, y1: bot });
  }

  // 需要高倍 OCR 的区域任务：批量合并后一次发送
  interface RegionJob {
    region: OcrRegion;
    kind: 'alli' | 'band';
    idx: number;
    side?: 'left' | 'right';
    box?: { x0: number; y0: number; x1: number; y1: number };
  }
  const jobs: RegionJob[] = [];
  const battles: Battle[] = [];

  // 阶段1：纯计算收集区域需求
  for (let i = 0; i < battleRanges.length; i++) {
    const range = battleRanges[i];
    const anchor = anchors[i];

    // 完整战斗判定：顶部被 UI 导航栏截断/占位时同盟名被截到图外，整场剔除
    if (isTopTruncated(allLines, range, anchor)) continue;

    // 阶段2 按 battles 实际下标回写；前面可能被 continue 跳过的战斗不会计入，故用 battles.length 而非循环下标 i
    const idx = battles.length;

    const battle: Battle = {
      leftGenerals: [],
      rightGenerals: [],
      leftAlliance: '',
      rightAlliance: '',
      time: '',
      result: 'unknown',
      resultText: '',
      leftHp: '',
      rightHp: '',
      hpCost: '',
      panel: { y0: range.y0, y1: range.y1 },
    };

    // ---- 武将带：结果字下方约 80px 区域 ----
    const genTop = anchor ? Math.max(0, anchor.y1 - 15) : range.y0;
    const genBot = Math.min(H, genTop + 80);
    if (genBot > genTop) {
      // 先用整图 OCR 行在该区域直接提取武将/兵力/体力（零额外检测）
      const bandLines = allLines.filter((l) => l.y0 >= genTop && l.y0 < genBot);
      classifyGeneralBand(bandLines, cx, battle);
      // 仅当某侧武将不足 3 名时才触发高倍补全（多数整图已可识全，省掉一次高倍 det）
      if (battle.leftGenerals.length < 3 || battle.rightGenerals.length < 3) {
        jobs.push({
          region: { tag: `band${i}`, x0: 0, y0: genTop, x1: W, y1: genBot, scale: 2 },
          kind: 'band',
          idx,
        });
      }
    }

    // ---- 结果 ----
    if (anchor) {
      battle.resultText = anchor.text.trim();
      battle.result = battle.resultText === '胜' ? 'win'
        : battle.resultText === '败' ? 'lose'
        : 'unknown';
    }

    // ---- 同盟名：战斗顶部区域（range.y0 ~ 武将带顶）----
    const allianceBand = allLines.filter((l) => l.y0 >= range.y0 && l.y0 < genTop);
    const alliLines = extractTopInfo(allianceBand, cx);
    for (const side of ['left', 'right'] as const) {
      const line = alliLines[side];
      if (needAllianceRefine(line ? line.text : '')) {
        const box = allianceRefineBox(line!);
        jobs.push({ region: { tag: `alli${i}:${side}`, ...box, scale: 2 }, kind: 'alli', idx, side, box });
        battle[side === 'left' ? 'leftAlliance' : 'rightAlliance'] = cleanAlliance(line!.text);
      } else {
        battle[side === 'left' ? 'leftAlliance' : 'rightAlliance'] = cleanAlliance(line ? line.text : '');
      }
    }

    // ---- 战报时间：结果字上方区域挑离结果字最近的一条时间行 ----
    const timeLo = Math.max(0, range.y0 - 8);
    const timeLine = allLines
      .filter((l) => l.y0 >= timeLo && l.y0 < genTop)
      .filter((l) => TIME_PAT.test(l.text))
      .sort((a, b) => b.y0 - a.y0)[0];
    if (timeLine) battle.time = extractTime(timeLine.text);

    battles.push(battle);
  }

  // 阶段2：批量高倍识别（一次请求），再应用结果
  const batch = await ocrRegionsBatch(imagePath, jobs.map((j) => j.region));
  for (const job of jobs) {
    const battle = battles[job.idx];
    const lines = batch[job.region.tag] ?? [];
    if (job.kind === 'alli' && job.box) {
      const refined = pickRefinedAlliance(lines, job.box);
      if (refined) battle[job.side === 'left' ? 'leftAlliance' : 'rightAlliance'] = refined;
    } else if (job.kind === 'band') {
      // 高倍补全结果合并（classifyGeneralBand 内部会按名去重）
      classifyGeneralBand(lines, cx, battle);
    }
  }

  // 对每场战斗识别武将红度（纯像素连通域，非 OCR）
  for (const b of battles) {
    await fillRed(imagePath, b);
  }

  return { imageWidth: W, imageHeight: H, battles };
}

/** 判断一行是否为"盟"徽标（同盟名旁的小字标识） */
function isAllianceBadge(line: OcrLine): boolean {
  return line.text.trim() === '盟';
}

/**
 * 从顶部条带提取左右同盟名所在行。
 * 同盟名行旁通常带独立"盟"徽标；
 * 因此优先取与"盟"徽标 y 重叠/紧邻的行作为同盟名，缺失时回退到最下方一行。
 * @returns 每侧同盟名对应的文本行（含 bbox），未命中为 null
 */
function extractTopInfo(lines: OcrLine[], cx: number): {
  left: OcrLine | null;
  right: OcrLine | null;
} {
  const badgeLines = lines.filter(isAllianceBadge);
  const candLines = lines.filter((l) => {
    const t = l.text.trim();
    // 排除单字行：很可能是"盟"徽标或其 OCR 形近字（如"盈"/"文"），非同盟名
    if ([...t].length < 2) return false;
    // 同盟名必含中文，纯字母/符号行（如"LLLLL"）是 OCR 噪声，直接排除
    if (!/[\u4e00-\u9fa5]/.test(t)) return false;
    return !isNoiseLine(l) && !isFooterText(t) && !RESULT_CHARS.has(t) && !UI_NAV_WORDS.has(t);
  });

  const sideOf = (l: OcrLine): 'left' | 'right' | null =>
    l.x1 <= cx ? 'left' : l.x0 >= cx ? 'right' : null;

  const pickAlliance = (side: 'left' | 'right'): OcrLine | null => {
    const badges = badgeLines.filter((b) => sideOf(b) === side);
    const cands = candLines.filter((l) => sideOf(l) === side);
    if (!cands.length) return null;
    // 优先：与"盟"徽标 y 重叠或紧邻的行 => 同盟名
    if (badges.length) {
      const hit = cands.find((c) =>
        badges.some((b) => Math.min(c.y1, b.y1) - Math.max(c.y0, b.y0) > 0 || Math.abs(c.y0 - b.y0) < 20)
      );
      if (hit) return hit;
    }
    // 回退：取最下方一行（同盟名通常位于区域最下方）
    return [...cands].sort((a, b) => b.y0 - a.y0)[0];
  };

  return { left: pickAlliance('left'), right: pickAlliance('right') };
}

/**
 * 判断同盟名是否需要高倍 OCR 精修。
 * 同盟名末尾若出现疑似徽标粘连噪声字（如整图 OCR 把"剑来"识别成"剑来画"），
 * 才需要对该区域单独高倍识别；否则信任整图 OCR 结果。
 */
const ALLIANCE_NOISE_SUFFIX = new Set(['画', '盟', '盈', '文', '反', '入', '占', '面', '明', '飞']);
// 前缀噪声字：整图 OCR 有时把同盟名左侧的淡字/装饰粘连成首字（如"宇宙洪荒"读成"博宇宙洪荒"）。
// 命中时触发高倍精修重新读取（精修读回原样即保留，不会误删真实以该字开头的同盟名）。
const ALLIANCE_NOISE_PREFIX = new Set(['博']);
export function needAllianceRefine(raw: string): boolean {
  const t = cleanAlliance(raw);
  if (!t) return false;
  const len = [...t].length;
  const first = [...t][0]!;
  const last = [...t][len - 1]!;
  return ALLIANCE_NOISE_PREFIX.has(first) || ALLIANCE_NOISE_SUFFIX.has(last);
}

/**
 * 同盟名高倍识别区域框：放大覆盖同盟名及其右侧可能的徽标粘连。
 */
export function allianceRefineBox(line: OcrLine): { x0: number; y0: number; x1: number; y1: number } {
  return {
    x0: Math.max(0, line.x0 - 8),
    y0: Math.max(0, line.y0 - 4),
    x1: line.x1 + 16,
    y1: line.y1 + 4,
  };
}

/**
 * 从同盟名高倍识别结果中挑选候选行。
 * 选与同盟行区域 y 重叠、非数字、非单字、非结果/底部信息的行中最下方一条。
 */
export function pickRefinedAlliance(hi: OcrLine[], box: { x0: number; y0: number; x1: number; y1: number }): string {
  const cands = hi
    .filter((l) => {
      const t = l.text.trim();
      if ([...t].length < 2) return false;
      if (/^\d/.test(t)) return false;
      if (isFooterText(t) || RESULT_CHARS.has(t)) return false;
      return Math.min(l.y1, box.y1) - Math.max(l.y0, box.y0) > 0;
    })
    .sort((a, b) => b.y0 - a.y0);
  return cleanAlliance(cands.length ? cands[0].text : '');
}

/**
 * 对同盟名所在区域做高倍 OCR，修正整图 OCR 的粘连误识别（如"剑来"→"剑来画"）。
 * @param imagePath 图片路径
 * @param line 整图 OCR 识别出的同盟名行（含 bbox）
 */
export async function refineAlliance(imagePath: string, line: OcrLine | null): Promise<string> {
  if (!line) return '';
  const box = allianceRefineBox(line);
  let hi: OcrLine[] = [];
  try {
    hi = await ocrRegionService(imagePath, box, 2);
  } catch {
    return cleanAlliance(line.text);
  }
  return pickRefinedAlliance(hi, box) || cleanAlliance(line.text);
}

/** 分类武将带：提取武将名/兵力/体力，按左右归入战斗 */
export function classifyGeneralBand(lines: OcrLine[], cx: number, battle: Battle): void {
  for (const l of lines) {
    const t = l.text.trim();
    if (!t || isNoiseLine(l) || isFooterText(t) || RESULT_CHARS.has(t)) continue;

    // 体力消耗
    const cost = t.match(/体力\s*[-−:号]?\s*(\d+)/);
    if (cost) {
      battle.hpCost = cost[1];
      continue;
    }

    // 兵力： x/y 形式
    if (/^\d+\s*\/\s*\d+$/.test(t)) {
      if (l.x1 <= cx) battle.leftHp = t;
      else if (l.x0 >= cx) battle.rightHp = t;
      continue;
    }

    // 武将名：词典模糊匹配
    const m = matchGeneral(t);
    if (!m) continue;
    const g: General = {
      name: m.name,
      raw: t,
      x: Math.round((l.x0 + l.x1) / 2),
      y: l.y0,
      nameW: l.x1 - l.x0,
      nameH: l.y1 - l.y0,
      red: -1,
    };
    if (l.x1 <= cx) battle.leftGenerals.push(g);
    else if (l.x0 >= cx) battle.rightGenerals.push(g);
  }
  // 同一阵容不会出现同名武将，去重避免 OCR 重复/邻域噪声
  battle.leftGenerals = dedupeGenerals(battle.leftGenerals);
  battle.rightGenerals = dedupeGenerals(battle.rightGenerals);
}

/** 按武将名去重（保留 x 最小者） */
function dedupeGenerals(list: General[]): General[] {
  const seen = new Map<string, General>();
  for (const g of list) {
    const prev = seen.get(g.name);
    if (!prev || g.x < prev.x) seen.set(g.name, g);
  }
  return [...seen.values()];
}

/** 识别一场战斗中所有武将的红度（勾玉数量） */
export async function fillRed(imagePath: string, battle: Battle): Promise<void> {
  for (const g of [...battle.leftGenerals, ...battle.rightGenerals]) {
    g.red = await countRedForGeneral(imagePath, g);
  }
}