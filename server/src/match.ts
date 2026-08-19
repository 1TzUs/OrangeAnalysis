/**
 * 模糊匹配工具：用武将词典纠正 OCR 结果，提升识别准确性。
 */
import { GENERALS } from './dict.js';

/**
 * OCR 已知错字 → 正确武将 映射表。
 * 这些错字存在明确的形近/OCR 规律，直接映射比通用编辑距离更可靠，
 * 可避免歧义（如"曹不"到"曹操"/"曹丕"距离都为 1 时被误纠正）。
 * 映射优先于编辑距离匹配。
 */
const OCR_ALIASES: Record<string, string> = {
  '曹不': '曹丕', // 丕/不 形近，OCR 常混
  '涂盛': '徐盛', // 徐/涂 形近
  '下夫人': '卞夫人', // 卞/下 形近
  '卡夫人': '卞夫人', // 卞/卡 形近
  '张合': '张郃', // 郃/合 形近，极常见
  '荀或': '荀彧', // 彧/或 形近
  '夏侯敦': '夏侯惇', // 惇/敦 形近
  '孟和': '孟获', // 获/和 形近
  '徐蔗': '徐庶', // 庶/蔗 形近
  '苟攸': '荀攸', // 荀/苟 形近（OCR 常把"荀攸"识别成"苟攸"）
  '公孙璜': '公孙瓒', // 瓒/璜 形近
  '朱俊': '朱儁', // 儁/俊 形近，OCR 常把"朱儁"识别成"朱俊"
};

/** 编辑距离（Levenshtein） */
export function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(
        dp[j] + 1,
        dp[j - 1] + 1,
        prev + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      prev = tmp;
    }
  }
  return dp[n];
}

/**
 * 在词典中模糊匹配最接近的武将名。
 * 返回 { name, distance }；若距离超过阈值返回 null。
 */
export function matchGeneral(raw: string): { name: string; distance: number } | null {
  const s = raw.replace(/[\s·・…，,。.!！?？:：]/g, '');
  if (!s) return null;
  // 已知 OCR 错字 → 正确武将，直接命中（distance 视为 0，避免歧义）
  const alias = OCR_ALIASES[s];
  if (alias) return { name: alias, distance: 0 };
  let best: { name: string; distance: number } | null = null;
  for (const cand of GENERALS) {
    const d = editDistance(s, cand);
    if (!best || d < best.distance) best = { name: cand, distance: d };
  }
  if (!best) return null;
  // 2-3 字名，允许 1 个字符误差；同时要求长度相近
  const lenOk = Math.abs(best.name.length - s.length) <= 1;
  const maxDist = s.length <= 2 ? 1 : Math.floor(s.length / 3) + 1;
  if (lenOk && best.distance <= maxDist) return best;
  return null;
}