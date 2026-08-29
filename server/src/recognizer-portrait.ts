/**
 * 竖屏战报识别模块：适配 PE 端竖屏截图（1080x2376 单列纵向面板）。
 *
 * 与 PC 横屏的关键差异：结果字「胜/败」位于每个战斗面板的【顶部/偏上】，
 * 向下依次为 武将带 → 同盟名 → 兵力。因此同盟名需在武将带【下方】查找，
 * 并借助兵力（x/y 形式）行锚定，避免误吸底部导航栏（全部/返回/同盟等）。
 */
import sharp from 'sharp';
import { ocrImage, ocrRegionsBatch, OcrLine, OcrRegion } from './ocrService.js';
import {
  Battle,
  ParseResult,
  cleanAlliance,
  extractTime,
  TIME_PAT,
  isFooterText,
  isNoiseLine,
  RESULT_CHARS,
  classifyGeneralBand,
  fillRed,
  needAllianceRefine,
  allianceRefineBox,
  pickRefinedAlliance,
} from './recognizer.js';

/** 竖屏结果字最小高度（结果字 ~90-110px，武将名/表头 ~30-38px） */
const RESULT_MIN_H = 55;

/** 兵力行：x/y 形式 */
const HP_PAT = /^\d+\s*\/\s*\d+$/;

/** 底部导航/UI 按钮词，绝不可能作为同盟名，需排除 */
const UI_BUTTONS = new Set(['全部', '开拓', '交战', '返回', '同盟', '战报', '防守', '进攻']);

/** 竖屏同盟名噪声后缀（右侧装饰徽标粘连，如 "风花雪月飞" 的 "飞"） */
const NOISE_SUFFIX = new Set([
  // 复用 PC 端
  '画', '盟', '盈', '文', '反', '入', '占', '面', '明',
  // 竖屏常见装饰粘连
  '飞', '圈', '口', '图', '徽', '标', '纹', '底', '签', '燕', '猫',
]);

/** 判定竖屏结果锚点：恰为 胜/败/平 且字形足够大 */
export function isPortraitResultGlyph(line: OcrLine): boolean {
  const t = line.text.trim();
  if (!RESULT_CHARS.has(t)) return false;
  return line.y1 - line.y0 >= RESULT_MIN_H;
}

/**
 * 判断同盟名是否需要高倍精修。
 * 复用 PC 端判定（前缀「博」+ 常用后缀噪声），再附加竖屏特有小徽标粘连后缀。
 */
function needPortraitRefine(raw: string): boolean {
  if (needAllianceRefine(raw)) return true;
  const t = cleanAlliance(raw);
  if (!t) return false;
  return NOISE_SUFFIX.has([...t].pop()!);
}

/**
 * 取列表中最顶部的一行文本簇。
 * 竖屏的武将带里，武将名行位于最上，其下是同盟名/兵力等行；
 * 仅保留顶部武将行，避免下方行（经模糊匹配可能命中的武将）混入。
 */
function topRowCluster(lines: OcrLine[]): OcrLine[] {
  const meaningful = lines.filter((l) => !isNoiseLine(l));
  if (!meaningful.length) return [];
  const top = Math.min(...meaningful.map((l) => l.y0));
  return lines.filter((l) => l.y0 < top + 40);
}

/**
 * 解析单张 PE 竖屏战报截图。
 *
 * 与 PC 横屏一致采用两阶段 + 批量优化：
 * 阶段1 只用整图 OCR 结果做纯计算，把「需要高倍识别」的区域（武将带补全、
 *       同盟名精修）收集成请求列表，但暂不调用 OCR；
 * 阶段2 一次性批量请求这些区域（合并 HTTP 往返，见 /ocr/batch），再应用结果。
 * 避免原实现「每场战斗无条件发一次高倍 OCR」的重复检测，显著提速。
 * @param imagePath 图片绝对路径
 */
export async function parsePortraitImage(imagePath: string): Promise<ParseResult> {
  const meta = await sharp(imagePath).metadata();
  const W = meta.width!;
  const H = meta.height!;
  const cx = Math.round(W / 2);

  // 阶段1：整图一次 OCR 定位所有文本行
  const allLines = await ocrImage(imagePath, 1.3);

  // 结果锚点：大字「胜/败/平」（竖屏位于面板偏上）
  const anchors = allLines.filter(isPortraitResultGlyph).sort((a, b) => a.y0 - b.y0);

  /** 需高倍 OCR 的区域任务：批量合并后一次发送 */
  interface RegionJob {
    region: OcrRegion;
    kind: 'alli' | 'band';
    idx: number;
    side?: 'left' | 'right';
    /** band 精修：需要以 scale2 结果重建的异常侧（某侧 <3 或 >3） */
    sides?: Array<'left' | 'right'>;
    box?: { x0: number; y0: number; x1: number; y1: number };
  }
  const jobs: RegionJob[] = [];
  const battles: Battle[] = [];

  // 阶段1：纯计算收集区域需求
  for (let i = 0; i < anchors.length; i++) {
    const anchor = anchors[i];
    const battle: Battle = {
      leftGenerals: [],
      rightGenerals: [],
      leftAlliance: '',
      rightAlliance: '',
      time: '',
      result: 'unknown',
      resultText: anchor.text.trim(),
      leftHp: '',
      rightHp: '',
      hpCost: '',
      panel: { y0: anchor.y0, y1: H },
    };
    battle.result = battle.resultText === '胜' ? 'win' : battle.resultText === '败' ? 'lose' : 'unknown';

    // ---- 战报时间：位于结果字上方（坐标/战斗场次所在 footer 区域）----
    // 取上一场结果字底边到本场结果字顶边之间、离结果字最近的一条时间行。
    const timeLo = i === 0 ? 0 : anchors[i - 1].y1;
    const timeLine = allLines
      .filter((l) => l.y0 >= timeLo && l.y0 < anchor.y0)
      .filter((l) => TIME_PAT.test(l.text))
      .sort((a, b) => b.y0 - a.y0)[0];
    if (timeLine) battle.time = extractTime(timeLine.text);

    // ---- 武将带：结果字下方约 80px 区域 ----
    const genTop = Math.max(0, anchor.y1 - 15);
    const genBot = Math.min(H, genTop + 80);
    if (genBot > genTop) {
      // 先只用整图 OCR 行在该区域直接提取武将（零额外检测），只取最顶一行文本簇作武将行
      const bandLines = allLines.filter((l) => l.y0 >= genTop && l.y0 < genBot);
      classifyGeneralBand(topRowCluster(bandLines), cx, battle);
      // 某侧武将不足 3（漏识别）或超过 3（误报）时，才触发高倍精修重建该侧。
      const abnormalSides = (['left', 'right'] as const).filter(
        (s) => battle[`${s}Generals`].length < 3 || battle[`${s}Generals`].length > 3
      );
      if (abnormalSides.length) {
        jobs.push({
          region: { tag: `band${i}`, x0: 0, y0: genTop, x1: W, y1: genBot, scale: 2 },
          kind: 'band',
          idx: i,
          sides: abnormalSides,
        });
      }
    }

    // ---- 同盟名 + 兵力：武将带下方（同盟名 → 兵力 依次向下）----
    // 区间从武将带顶开始，覆盖紧贴武将带下方的同盟名行。
    const alStart = genTop;
    const alEnd = Math.min(H, genTop + 350);
    const zoneLines = allLines.filter((l) => l.y0 >= alStart && l.y0 < alEnd);

    const sideOf = (l: OcrLine): 'left' | 'right' | null =>
      l.x1 <= cx ? 'left' : l.x0 >= cx ? 'right' : null;

    // 兵力行（x/y 形式），每侧取最下方一条作为锚点
    const hpLines = zoneLines.filter((l) => HP_PAT.test(l.text.trim()));
    const hpOf = (side: 'left' | 'right') =>
      hpLines.filter((h) => sideOf(h) === side).sort((a, b) => b.y1 - a.y1)[0];

    // 同盟候选行：>=2 字、非数字、非兵力、非底部/结果/UI按钮
    const cands = zoneLines.filter((l) => {
      const t = l.text.trim();
      if ([...t].length < 2) return false;
      if (HP_PAT.test(t)) return false;
      if (/^\d/.test(t)) return false;
      if (isNoiseLine(l) || isFooterText(t) || RESULT_CHARS.has(t)) return false;
      if (UI_BUTTONS.has(t)) return false;
      return true;
    });

    // 提取单侧同盟名：同盟名 = 兵力行上方最近的候选行。
    // 返回文本行及其清洗结果，精修动作推迟到阶段2批量处理。
    const pickSide = (side: 'left' | 'right'): { raw: string; line: OcrLine | null } => {
      const sideCands = cands.filter((l) => sideOf(l) === side);
      if (!sideCands.length) return { raw: '', line: null };
      const hp = hpOf(side);
      const alliHit = hp
        ? (sideCands.filter((c) => c.y0 < hp.y0).length
            ? sideCands.filter((c) => c.y0 < hp.y0)
            : sideCands
          ).sort((a, b) => b.y0 - a.y0)[0]
        : [...sideCands].sort((a, b) => b.y0 - a.y0)[0];
      return { raw: cleanAlliance(alliHit.text), line: alliHit };
    };

    // 同盟名：需精修时收集区域任务，否则直接采用整图清洗结果
    for (const side of ['left', 'right'] as const) {
      const { raw, line } = pickSide(side);
      if (line && needPortraitRefine(raw)) {
        const box = allianceRefineBox(line);
        jobs.push({
          region: { tag: `alli${i}:${side}`, ...box, scale: 2 },
          kind: 'alli',
          idx: i,
          side,
          box,
        });
        battle[side === 'left' ? 'leftAlliance' : 'rightAlliance'] = raw;
      } else {
        battle[side === 'left' ? 'leftAlliance' : 'rightAlliance'] = raw;
      }
    }

    const lhp = hpOf('left');
    const rhp = hpOf('right');
    if (lhp) battle.leftHp = lhp.text.trim();
    if (rhp) battle.rightHp = rhp.text.trim();

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
    } else if (job.kind === 'band' && job.sides?.length) {
      // 高倍精修结果：以 scale2 为权威，重建异常侧武将（而非简单追加，避免误报累积）
      const hi = topRowCluster(lines);
      const tmp = { leftGenerals: [], rightGenerals: [] } as unknown as Battle;
      classifyGeneralBand(hi, cx, tmp);
      for (const s of job.sides) {
        battle[s === 'left' ? 'leftGenerals' : 'rightGenerals'] =
          tmp[s === 'left' ? 'leftGenerals' : 'rightGenerals'];
      }
    }
  }

  // 对每场战斗识别武将红度（纯像素连通域，非 OCR）
  for (const b of battles) {
    await fillRed(imagePath, b);
  }

  return { imageWidth: W, imageHeight: H, battles };
}