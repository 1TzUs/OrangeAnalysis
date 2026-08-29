/**
 * JSONBin.io 云端存储封装。
 *
 * 安全说明：Access-Key 只存在于服务端（本文件），由后端代理请求 JSONBin，
 * 绝不下发到浏览器前端 JS。部署/打包时可用环境变量覆盖默认值，避免 Key 硬编码进产物：
 *   CLOUD_BIN_ID       Bin ID
 *   CLOUD_ACCESS_KEY   访问 Key（读；最小权限）
 *   CLOUD_MASTER_KEY   主 Key（写，覆盖云端必需）
 */
import { BattleRecord } from './store.js';

/** Bin ID 与访问 Key（优先读环境变量） */
const BIN_ID = process.env.CLOUD_BIN_ID ?? '6a8d859ada38895dfe0e7cd5';
const ACCESS_KEY =
  process.env.CLOUD_ACCESS_KEY ?? '$2a$10$GBsdXRvfpV6r25dCWLE0s.CWe0qyDzHs/PsiuEbDVolJuqkRKpGu2';
const MASTER_KEY =
  process.env.CLOUD_MASTER_KEY ?? '$2a$10$raFBFZ14g7HPNFZgxn3BXuQ3oHm7kDMVvVaMdY5XLNRb9z98txJdK';

const API = 'https://api.jsonbin.io/v3/b/';

/**
 * 读取请求头。
 * 实测：用 X-Access-Key 可正常读（200）；读操作携带最小权限 Key 即可。
 */
function readHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Access-Key': ACCESS_KEY,
  };
}

/** 写入请求头：覆盖云端必须携带 X-Master-Key（Access-Key 只读会被拒） */
function writeHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'X-Master-Key': MASTER_KEY,
  };
}

/**
 * 从云端读取战报记录数组。
 * 兼容两种已存格式：顶层数组（有数据的旧格式）与空态占位对象 { records: [] }（清空云端后写入）。
 */
export async function fetchRecords(): Promise<BattleRecord[]> {
  const res = await fetch(`${API}${BIN_ID}/latest`, { headers: readHeaders() });
  if (!res.ok) throw new Error(`云端读取失败（HTTP ${res.status}）`);
  const body = await res.json() as { record?: unknown };
  const rec = body.record;
  if (Array.isArray(rec)) return rec as BattleRecord[];
  // 空态占位对象 { records: [] }（清空云端时的写入结构）
  if (rec && typeof rec === 'object') {
    const inner = (rec as { records?: unknown }).records;
    if (Array.isArray(inner) && inner.length === 0) return [];
  }
  throw new Error('云端数据格式异常：不是战报记录数组');
}

/**
 * 清空云端数据。
 * JSONBin 不允许 record 为空（空数组会返回 400 "Bin cannot be blank"），
 * 故清空时写入非空占位对象 { records: [] }，fetchRecords 按空数组读回。
 */
export async function clearRemote(): Promise<void> {
  const res = await fetch(`${API}${BIN_ID}`, {
    method: 'PUT',
    headers: writeHeaders(),
    body: JSON.stringify({ records: [] }),
  });
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new Error('写入被拒绝：当前密钥无云端写入权限（需 Bin 的 X-Master-Key）');
  }
  if (!res.ok) throw new Error(`云端清空失败（HTTP ${res.status}）`);
}

/**
 * 把本地记录数组推送到云端（覆盖云端数据）。
 * 注：写入 JSONBin 通常需 X-Master-Key；若当前是只读的 X-Access-Key，会在此抛出权限错误，
 * 前端会将其作为"无写入权限"提示给用户。
 */
export async function pushRecords(records: BattleRecord[]): Promise<{ version: string }> {
  const res = await fetch(`${API}${BIN_ID}`, {
    method: 'PUT',
    headers: writeHeaders(),
    body: JSON.stringify(records),
  });
  // JSONBin 对无写入权限的 Bin 可能返回 401/403，也可能返回 400「Access denied」。
  // 正常 PUT 请求体必为合法 JSON 数组，400 基本可判定为权限不足，故一并归入权限提示。
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    throw new Error('写入被拒绝：当前密钥无云端写入权限（需 Bin 的 X-Master-Key）');
  }
  if (!res.ok) throw new Error(`云端写入失败（HTTP ${res.status}）`);
  const body = await res.json() as { metadata?: { version?: string } };
  return { version: String(body?.metadata?.version ?? '') };
}