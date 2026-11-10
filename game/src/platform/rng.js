/**
 * 平台服务层 · 可复现随机数
 *
 * ★ 全游戏唯一的随机来源。禁止在 core / data 里出现 Math.random()。
 *   理由：每日挑战要求「同一 Seed 所有玩家条件一致」，图鉴复现、断刀复盘、
 *   无头验收都依赖可复现；一旦某处漏出 Math.random()，这些能力全部失效。
 *
 * 实现：mulberry32（32 位状态、快、分布够好），配 FNV-1a 变体做种子杂凑。
 * 无 DOM 依赖，Node 下可直接跑（供 tools/ 无头验收使用）。
 */

/** 把任意个数的字符串/数字杂凑成 32 位无符号整数 */
export function hashSeed(...parts) {
  let h = 0x811c9dc5;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x9e3779b9;
    h = Math.imul(h, 0x85ebca6b);
    h ^= h >>> 13;
  }
  return h >>> 0;
}

/**
 * 造一个确定性随机源。
 * @param {number|string} seed
 * @returns {() => number} [0,1)
 */
export function makeRng(seed) {
  let a = (typeof seed === 'number' ? seed : hashSeed(seed)) >>> 0;
  if (a === 0) a = 0x6d2b79f5;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 派生具名随机流：同一局内「抽卡」「断裂判定」「锤击」各用独立流，
 * 避免"多用一次随机数就错位"的连锁漂移。
 */
export function stream(rootSeed, name, ...extra) {
  return makeRng(hashSeed(rootSeed, name, ...extra));
}

/** [0,n) 整数 */
export function randInt(rng, n) {
  return Math.floor(rng() * n) % Math.max(1, n);
}

/** 从数组里取一个 */
export function pickOne(rng, arr) {
  if (!arr || !arr.length) return null;
  return arr[randInt(rng, arr.length)];
}

/** 按权重取一个：items 需带 weight 字段 */
export function pickWeighted(rng, items, weightOf = (x) => x.weight ?? 1) {
  if (!items || !items.length) return null;
  let total = 0;
  for (const it of items) total += Math.max(0, weightOf(it));
  if (total <= 0) return items[randInt(rng, items.length)];
  let r = rng() * total;
  for (const it of items) {
    r -= Math.max(0, weightOf(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

/** Fisher–Yates（不改动入参） */
export function shuffle(rng, arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(rng, i + 1);
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

/** 生成一个 8 位可读种子（给玩家看的每日挑战编号等） */
export function readableSeed(rng) {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += A[randInt(rng, A.length)];
  return s;
}

export default { hashSeed, makeRng, stream, randInt, pickOne, pickWeighted, shuffle, readableSeed };
