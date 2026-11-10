/**
 * GPU 资源账本（方案 §5「缓存 / 预算 / lease」的最小落地）。
 *
 * 方案原文要求：
 *   · 「GPU 资源按 renderer/context 分账」——不能把另一个 canvas 的上传算到这里；
 *   · 「保留当前、当前三个候选、导出任务的资源 lease；pin/refCount 为零才可 LRU 淘汰」；
 *   · 「初始 GPU 预算：balanced 96 MiB、high 192 MiB，均为工程软上限，
 *      包含纹理+mip+几何+PMREM+render target+MSAA，超限逐级降分辨率/淘汰非 pin 项」。
 *
 * 本模块只做三件事，**不接管**任何资源的生命周期（owner 仍自己 dispose）：
 *   ① 记账：按格式/尺寸/mip/层数估算字节，按 context（renderer）分账；
 *   ② 预算：给出 profile 对应的软上限与 `overBudget`；
 *   ③ lease：pin/unpin 引用计数 + 只淘汰"标记为 evictable 且 refCount=0"的项。
 *
 * ⚠ 口径：WebGL 拿不到真实显存总量，这里的数字是**估算**（见 docs/render-v2-2026-10-20/RESULT.md §6.7）。
 *   `renderer.info.memory` 是对象数量，不能与这里相加；两者交叉校验即可。
 */

/** 工程软上限（MiB）。方案给的起点值，按实机再修订。 */
export const GPU_BUDGET_MIB = Object.freeze({ balanced: 96, high: 192 });

const MIP_FACTOR = 4 / 3;

/** 单个纹理的估算字节 → MiB。支持 2D / cube / array。 */
export function estimateTextureMiB(texture) {
  const img = texture && texture.image;
  if (!img) return 0;
  const w = Number(img.width || img.videoWidth || 0);
  const h = Number(img.height || img.videoHeight || 0);
  if (!w || !h) return 0;
  /* 通道数：灰度/双通道贴图按 1/2 计；默认 RGBA 4。 */
  const fmt = texture.format;
  const channels = fmt === 1024 /* RED */ ? 1 : fmt === 1025 /* RG */ ? 2 : 4;
  const bytesPerChannel = texture.type === 1016 /* HalfFloat */ ? 2 : 1;
  const layers = texture.isCubeTexture ? 6 : (img.depth || 1);
  const mip = texture.generateMipmaps === false ? 1 : MIP_FACTOR;
  return (w * h * channels * bytesPerChannel * layers * mip) / 1048576;
}

/** 几何体估算：position/normal/uv/自定义属性 + index。 */
export function estimateGeometryMiB(geometry) {
  if (!geometry || !geometry.attributes) return 0;
  let bytes = 0;
  for (const attr of Object.values(geometry.attributes)) {
    if (!attr || !attr.array) continue;
    bytes += attr.array.byteLength || 0;
  }
  if (geometry.index && geometry.index.array) bytes += geometry.index.array.byteLength || 0;
  return bytes / 1048576;
}

const round = (n) => Math.round(n * 100) / 100;

class ResourceLedger {
  constructor() {
    /** @type {Map<string, object>} id → 条目 */
    this.items = new Map();
    this.profile = 'high';
    this.tick = 0;
    this._seq = 0;
    /* 分账：一个 renderer 一个桶（方案要求按 context 分开记） */
    this.contexts = new Map();
    this._ctxId = 0;
  }

  /** 便捷：直接估一张纹理（legacy 侧通过 `K3D.rLedger.textureMiB(tex)` 调用）。 */
  textureMiB(texture) { return estimateTextureMiB(texture); }
  geometryMiB(geometry) { return estimateGeometryMiB(geometry); }

  setProfile(profile) {
    this.profile = profile === 'balanced' ? 'balanced' : 'high';
    return this.profile;
  }

  /** 给一个 renderer 分配稳定的桶 id（同一 renderer 复用）。 */
  contextOf(renderer) {
    if (!renderer) return 0;
    let id = this.contexts.get(renderer);
    if (id == null) { id = ++this._ctxId; this.contexts.set(renderer, id); }
    return id;
  }

  /**
   * 登记一项资源。
   * @param {string} id 稳定键（同名重复登记会覆盖旧条目）
   * @param {object} entry { kind, bytesMiB, renderer, optional, evictable, release, note }
   * @returns {object} 条目
   */
  track(id, entry = {}) {
    const item = {
      id, kind: entry.kind || 'other',
      bytesMiB: Math.max(0, Number(entry.bytesMiB) || 0),
      ctx: this.contextOf(entry.renderer),
      optional: !!entry.optional,
      evictable: !!entry.evictable,
      release: typeof entry.release === 'function' ? entry.release : null,
      note: entry.note || null,
      refs: 0,
      used: ++this.tick,
    };
    this.items.set(id, item);
    return item;
  }

  untrack(id) { this.items.delete(id); }

  /** Forget a destroyed GPU context without affecting other viewers. */
  releaseRenderer(renderer) {
    const ctx = this.contexts.get(renderer);
    if (ctx == null) return false;
    for (const [id, item] of this.items) if (item.ctx === ctx) this.items.delete(id);
    this.contexts.delete(renderer);
    return true;
  }

  /** lease：+1。返回当前引用数。 */
  pin(id) {
    const it = this.items.get(id);
    if (!it) return 0;
    it.refs++;
    it.used = ++this.tick;
    return it.refs;
  }

  /** lease：-1（不小于 0）。 */
  unpin(id) {
    const it = this.items.get(id);
    if (!it) return 0;
    it.refs = Math.max(0, it.refs - 1);
    it.used = ++this.tick;
    return it.refs;
  }

  budgetMiB() {
    /* 诊断用：`K3D.rLedger.forceBudgetMiB = 8` 可以把预算压到很低，
       用来验证"超预算 → 逐级降级 → 无主图集被淘汰 → 按需重烘"这条链路
       真的会执行（正常工况 71/192 MiB 永远走不到降级分支）。 */
    if (Number.isFinite(this.forceBudgetMiB) && this.forceBudgetMiB > 0) return this.forceBudgetMiB;
    return GPU_BUDGET_MIB[this.profile] || GPU_BUDGET_MIB.high;
  }

  /** 预算压力档：0 正常 / 1 吃紧（>80%）/ 2 超限（>100%）。 */
  degradeLevel(renderer = null) {
    const used = this.usedMiB(renderer);
    const budget = this.budgetMiB();
    if (used > budget) return 2;
    if (used > budget * 0.8) return 1;
    return 0;
  }

  /**
   * 预算降级（方案 §5「超限逐级降分辨率 / 淘汰非 pin 项」的**可执行部分**）。
   *
   * 实现的三级：
   *   ① 动画条纹图集：`canAfford` 在建立前就拒绝（每行 128²×12 ≈ 0.75 MiB），
   *      代价是回落静态纹样 —— 已在 `getAnimAtlas` 里接好；
   *   ② 无主可选图集（refs = 0 的 motif/animation atlas）按 LRU 淘汰，按需重烘；
   *   ③ 仍然超限 → 把档位暴露成 `K3D.gpuDegradeLevel = 2` 并只做告警，
   *      **不** 悄悄降分辨率/MSAA（那会改画面，属于视觉取舍，需要单独评审）。
   *
   * @returns {{level:number, released:object[], usedMiB:number, budgetMiB:number}}
   */
  relieve(renderer = null) {
    const level = this.degradeLevel(renderer);
    let released = [];
    if (level >= 1) released = this.evictUnpinned(level >= 2 ? Infinity : 1);
    this.lastLevel = level;
    if (released.length) this.evicted = (this.evicted || []).concat(released);
    try {
      const g = globalThis.K3D || (globalThis.K3D = {});
      g.gpuDegradeLevel = level;
    } catch (_) { /* ignore */ }
    return { level, released, usedMiB: round(this.usedMiB(renderer)), budgetMiB: this.budgetMiB() };
  }

  usedMiB(renderer = null) {
    const ctx = renderer ? this.contextOf(renderer) : null;
    let sum = 0;
    for (const it of this.items.values()) {
      if (ctx != null && it.ctx !== ctx) continue;
      sum += it.bytesMiB;
    }
    return sum;
  }

  overBudget(renderer = null) {
    return this.usedMiB(renderer) > this.budgetMiB();
  }

  /**
   * 加一项之前先问一句：**还剩多少预算**。
   * 图集这类"锦上添花"的资源用它决定要不要建（方案的"逐级降级"最小实现）。
   */
  canAfford(bytesMiB, renderer = null) {
    return this.usedMiB(renderer) + Math.max(0, Number(bytesMiB) || 0) <= this.budgetMiB();
  }

  /** 只淘汰 `evictable && refs === 0` 的项，按最近使用时间升序。 */
  evictUnpinned(limit = Infinity) {
    const victims = [...this.items.values()]
      .filter((it) => it.evictable && it.refs === 0)
      .sort((a, b) => a.used - b.used);
    const released = [];
    let n = 0;
    for (const it of victims) {
      if (n >= limit) break;
      try { if (it.release) it.release(); } catch (_) { /* owner 自己兜底 */ }
      this.items.delete(it.id);
      released.push({ id: it.id, bytesMiB: it.bytesMiB });
      n++;
    }
    return released;
  }

  /** 诊断快照（写进 `__FORGE_PREP.gpuLedger`）。 */
  report() {
    const byKind = {};
    for (const it of this.items.values()) {
      byKind[it.kind] = round((byKind[it.kind] || 0) + it.bytesMiB);
    }
    const used = round(this.usedMiB());
    const budget = this.budgetMiB();
    let pinned = 0, evictable = 0;
    for (const it of this.items.values()) {
      if (it.refs > 0) pinned += it.bytesMiB;
      if (it.evictable) evictable += it.bytesMiB;
    }
    return {
      profile: this.profile,
      budgetMiB: budget,
      usedMiB: used,
      overBudget: used > budget,
      headroomMiB: round(budget - used),
      /* lease 视图：pinnedMiB = 有 owner 的字节；evictableMiB = 可作为淘汰候选的字节 */
      pinnedMiB: round(pinned),
      evictableMiB: round(evictable),
      degradeLevel: this.degradeLevel(),
      evictedTotal: (this.evicted || []).length,
      byKind,
      items: [...this.items.values()]
        .sort((a, b) => b.bytesMiB - a.bytesMiB)
        .slice(0, 12)
        .map((it) => ({ id: it.id, kind: it.kind, MiB: round(it.bytesMiB), optional: it.optional, evictable: it.evictable, refs: it.refs })),
      note: '估算值：纹理按 格式×尺寸×层数×(mip 4/3)，不含驱动内部开销与 MSAA 采样倍数',
    };
  }

  reset() { this.items.clear(); this.contexts.clear(); this._ctxId = 0; this.evicted = []; this.lastLevel = 0; }
}

/** 全局单例：渲染层各处共用一本账。 */
export const gpuLedger = new ResourceLedger();

export default gpuLedger;
