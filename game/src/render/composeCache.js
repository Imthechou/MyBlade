/**
 * Reuse candidate-prewarm composition at visible preview, without sharing the
 * mutable uniforms map. No shader, texture resolution or PBR setting changes.
 * The key covers the complete JSON recipe, NOT the narrower shader fingerprint.
 */
export function composeInputKey(value) {
  return JSON.stringify(value, (_key, item) => {
    if (ArrayBuffer.isView(item)) return Array.from(item);
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]]));
    }
    return item;
  });
}

/**
 * 稳定短 hash（FNV-1a 32 位 → 8 位十六进制）。
 *
 * ★ 2026-10-21（方案 §5 #20「记录 recipeHash / contextEpoch / program keys」）
 *   为什么需要：排查"换了一张卡却复用了旧 program"这类问题时，光看 uniform 值
 *   无法判断"这两次到底是不是同一份配方"。`composeInputKey` 已经是**完整配方的
 *   规范 JSON**（键排序、TypedArray 展开），把它压成一个短串就能写进日志/诊断面板，
 *   和 `program.cacheKey`、`glCtxEpoch` 一起构成三段可对账的身份：
 *     配方（这一帧画什么） × 上下文代（这块 GL 上下文重建过没有） × program（编译产物）
 *   32 位碰撞概率对本用途（同会话内几十个配方）完全可以忽略；
 *   要绝对可靠时用 `composeInputKey` 全文本身，hash 只是给人看的。
 */
export function hashText(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8);
}

export class ComposePackCache {
  constructor(limit = 8) {
    this.limit = Math.max(1, limit);
    this.entries = new Map();
    this.stats = { hits: 0, misses: 0, textureInvalidations: 0, evictions: 0 };
  }
  _drop(key) {
    const entry = this.entries.get(key);
    if (!entry) return;
    this.entries.delete(key);
    for (const texture of entry.textures) texture.removeEventListener?.('dispose', entry.onDispose);
    // Textures belong to the legacy atlas LRU, never dispose them here.
  }
  get(input, create) {
    let key;
    try { key = composeInputKey(input); } catch { return create(); }
    const hash = hashText(key);
    const found = this.entries.get(key);
    if (found) {
      this.stats.hits++;
      this.entries.delete(key); this.entries.set(key, found);
      return { ...found.pack, recipeHash: hash, uniforms: { ...found.pack.uniforms } };
    }
    this.stats.misses++;
    const pack = create();
    if (!pack) return pack;
    const textures = new Set(Object.values(pack.uniforms || {}).filter(value => value?.isTexture));
    const entry = { pack, textures, hash, onDispose: () => {
      this.stats.textureInvalidations++;
      this._drop(key);
    } };
    for (const texture of textures) texture.addEventListener?.('dispose', entry.onDispose);
    this.entries.set(key, entry);
    while (this.entries.size > this.limit) {
      this.stats.evictions++; this._drop(this.entries.keys().next().value);
    }
    return { ...pack, recipeHash: hash, uniforms: { ...pack.uniforms } };
  }
  clear() { for (const key of [...this.entries.keys()]) this._drop(key); }
  summary() { return { ...this.stats, entries: this.entries.size, limit: this.limit }; }
}
