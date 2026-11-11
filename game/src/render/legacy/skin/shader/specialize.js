/**
 * 编译期特化（compile-time specialization）—— 只裁剪「运行时走不到」的分支。
 *
 * ── 为什么需要 ─────────────────────────────────────────────────────────
 * 本工程的着色器里，有 4 处用**运行时 uniform 整数**在一堆重量级程序化分支
 * 之间做选择：
 *
 *   k3dPattern     (patterns.js)   24 路  ← uTexId
 *   k3dCardMotif   (cardEffects.js) 25 路  ← 卡 rank 派生的 family
 *   k3dApplyFinish (finishes.js)   11 路  ← uFinId
 *   k3dHandleLook  (handleLook.js) 24 路  ← uHandlePatternKind
 *
 * GLSL 不会折叠这些分支，于是 Chrome 的 ANGLE→HLSL→D3D11(fxc) 后端必须把
 * **全部分支体**都翻译并内联一遍。实测（`tools/probe-bisect.mjs`）：
 *
 *   全部保留      ~195 s
 *   只留 1 条图案  38.2 s   ← 源码只少了 1 631 字节（0.7%）！
 *   四处都只留 1 条 2.0 s
 *
 * 即 **代价 ∝ 运行时分派路数，不 ∝ 代码量**（`deadMain` 变体证明：158 个函数定义
 * 全留着、一行不执行时只要 0.1 s —— 定义本身是免费的）。
 *
 * ── 做法 ───────────────────────────────────────────────────────────────
 * 把「当前材质真正会走的那一条分支」之外的分支从源码里删掉，其余**逐字保留**。
 * 因为是同一段 GLSL、同一套数学，只是不执行的分支不再进入编译，
 * **渲染结果与特化前逐像素等价** —— 不是"近似"，是完全一样。
 *
 * 唯一代价：id 变化时 `signature` 变化 → 需要重编译。特化后整套只有 ~4 s
 * （未特化时是 195 s），且可走 `viewer.precompile()` 的异步路径。
 *
 * ── 边界 ───────────────────────────────────────────────────────────────
 * 本模块**只做字符串裁剪**，不新增/修改任何 GLSL 数学。
 * 找不到目标函数或链结构不符合预期时**原样返回**（安全回退），
 * 保证任何异常情况下都退化成"未特化"，而不是产出坏着色器。
 */

/* ────────────────────────── 注释遮蔽 ────────────────────────── */

/**
 * 把注释内容替换成等长空格（保留换行），用于安全地做大括号/括号配对。
 * 直接对原串用索引切片，因此返回的下标可直接用于原串。
 */
function blankComments(src) {
  const out = src.split('');
  const n = src.length;
  let i = 0;
  let state = 0; // 0=代码 1=行注释 2=块注释
  while (i < n) {
    const c = src[i];
    const d = i + 1 < n ? src[i + 1] : '';
    if (state === 0) {
      if (c === '/' && d === '/') { out[i] = ' '; out[i + 1] = ' '; state = 1; i += 2; continue; }
      if (c === '/' && d === '*') { out[i] = ' '; out[i + 1] = ' '; state = 2; i += 2; continue; }
      i += 1;
      continue;
    }
    if (state === 1) {
      if (c === '\n') { state = 0; } else { out[i] = ' '; }
      i += 1;
      continue;
    }
    // state === 2
    if (c === '*' && d === '/') { out[i] = ' '; out[i + 1] = ' '; state = 0; i += 2; continue; }
    if (c !== '\n') out[i] = ' ';
    i += 1;
  }
  return out.join('');
}

/* ────────────────────────── 基础扫描 ────────────────────────── */

/** 找到函数体大括号的范围。mock 必须是 blankComments 的产物。 */
function findFunctionBody(masked, name) {
  const re = new RegExp('(?:^|[^A-Za-z0-9_])' + name + '[ \\t]*\\(', 'g');
  let mt;
  while ((mt = re.exec(masked))) {
    const open = masked.indexOf('(', mt.index);
    if (open < 0) return null;
    let depth = 0;
    let j = open;
    for (; j < masked.length; j++) {
      if (masked[j] === '(') depth++;
      else if (masked[j] === ')') { depth--; if (!depth) { j++; break; } }
    }
    let k = j;
    while (k < masked.length && /\s/.test(masked[k])) k++;
    if (masked[k] !== '{') continue;            // 前置声明，跳过
    let dep = 0;
    let e = k;
    for (; e < masked.length; e++) {
      if (masked[e] === '{') dep++;
      else if (masked[e] === '}') { dep--; if (!dep) break; }
    }
    if (e >= masked.length) return null;
    return { open: k, close: e, declStart: mt.index };
  }
  return null;
}

/** 匹配 `condVar <op> <num>`，把条件折算成一个整数"档位"值。 */
function condToValue(condText, condVar) {
  const re = new RegExp(condVar + '[ \\t]*(==|<=|>=|<|>)[ \\t]*([0-9]+(?:\\.[0-9]+)?)');
  const m = condText.match(re);
  if (!m) return null;
  const num = Number(m[2]);
  switch (m[1]) {
    case '==': return Math.round(num);
    case '<=': return Math.round(num);
    case '>=': return Math.round(num);
    case '<': return Math.floor(num - 1e-6);
    case '>': return Math.ceil(num + 1e-6);
    default: return null;
  }
}

/**
 * 解析函数体内的 `if ( cond ) {..} else if ( cond ) {..} ... [else {..}]` 链。
 * 返回 { ifPos, branches:[{ pos, open, close, value, isElse }], chainEnd }。
 */
function parseChain(masked, body, condVar) {
  const re = new RegExp('(?:^|[^A-Za-z0-9_])if[ \\t]*\\([ \\t]*' + condVar + '[ \\t]*(?:==|<=|>=|<|>)');
  const head = masked.slice(body.open, body.close + 1);
  const hm = head.match(re);
  if (!hm) return null;
  const ifPos = body.open + hm.index + hm[0].lastIndexOf('if');

  const branches = [];
  let pos = ifPos;
  for (let guard = 0; guard < 512; guard++) {
    const open = masked.indexOf('{', pos);
    if (open < 0 || open > body.close) break;
    const condText = masked.slice(pos, open);
    const isElse = !/if[ \t]*\(/.test(condText) && /else/.test(condText);
    const value = isElse ? null : condToValue(condText, condVar);
    if (!isElse && value == null) break;       // 结构不符 → 放弃
    let dep = 0;
    let e = open;
    for (; e < masked.length; e++) {
      if (masked[e] === '{') dep++;
      else if (masked[e] === '}') { dep--; if (!dep) break; }
    }
    if (e >= masked.length) break;
    branches.push({ pos, open, close: e, value, isElse });
    let q = e + 1;
    while (q < masked.length && /\s/.test(masked[q])) q++;
    if (masked.startsWith('else', q)) pos = q;
    else break;
  }
  if (!branches.length) return null;
  const chainEnd = branches[branches.length - 1].close;
  const chainStart = ifPos;
  return { branches, chainStart, chainEnd };
}

/* ────────────────────────── 特化主函数 ────────────────────────── */

/**
 * 把 `src` 里 `fnName` 的 if/else-if 分派链裁剪成只保留 `allowed` 里的档位。
 *
 * @param {string}   src      完整 GLSL 源码
 * @param {string}   fnName   目标函数名
 * @param {string}   condVar  分派用的整型形参名（如 `kind` / `finId` / `family`）
 * @param {number[]} allowed  允许保留的档位值
 * @returns {string} 裁剪后的源码；无法识别时原样返回
 */
export function selectChain(src, fnName, condVar, allowed) {
  const list = Array.from(new Set((allowed || []).filter((v) => Number.isFinite(v)).map((v) => Math.round(v))));
  if (!list.length) return src;
  const masked = blankComments(src);
  const body = findFunctionBody(masked, fnName);
  if (!body) return src;
  const chain = parseChain(masked, body, condVar);
  if (!chain) return src;

  const keep = [];
  let trailingElse = null;
  for (const b of chain.branches) {
    if (b.isElse) { trailingElse = b; continue; }
    if (list.includes(b.value)) keep.push(b);
  }
  if (!keep.length && !trailingElse) return src;   // 没有可保留的 → 原样返回（安全）

  let out = '';
  keep.forEach((b, i) => {
    let head = masked.slice(b.pos, b.open).replace(/^[\s\S]*?else/, '').trim(); // 去掉前导 else / 空白
    // masked 里注释已被空格替换，所以 head 会带一堆空白 → 用原始串重新取条件文本
    const rawCond = src.slice(b.pos, b.open);
    const condOnly = rawCond.replace(/^[\s\S]*?(if[ \t]*\()/, '$1');
    const startIdx = rawCond.indexOf(condOnly);
    head = startIdx >= 0 ? rawCond.slice(startIdx).trim() : head;
    const bodyText = src.slice(b.open, b.close + 1);
    out += (i === 0 ? '' : 'else ') + head + ' ' + bodyText + '\n  ';
  });
  if (trailingElse) out += (keep.length ? 'else ' : '') + src.slice(trailingElse.open, trailingElse.close + 1);
  out = out.replace(/\s+$/, '');

  return src.slice(0, chain.chainStart) + out + src.slice(chain.chainEnd + 1);
}

/**
 * 把 `k3dPattern` 的 24 路 `texId` 调度换成对单个图案函数的直接调用。
 * 其余 23 个图案函数**仍然保留定义但永不被调用** → 由编译器按死代码消除，
 * 实测「保留 158 个函数定义、一行不执行」只要 0.1 s。
 */
export function selectPattern(src, texId) {
  const id = Math.round(Number(texId));
  if (!Number.isFinite(id) || id < 1 || id > 24) return src;
  const masked = blankComments(src);
  const body = findFunctionBody(masked, 'k3dPattern');
  if (!body) return src;

  const fn = 'k3dTexT' + String(id).padStart(2, '0');
  const callHead = 'result = ' + fn + '(';
  const at = masked.indexOf(callHead, body.open);
  if (at < 0 || at > body.close) return src;

  const argOpen = masked.indexOf('(', at);
  let depth = 0;
  let argEnd = argOpen;
  for (; argEnd < masked.length; argEnd++) {
    if (masked[argEnd] === '(') depth++;
    else if (masked[argEnd] === ')') { depth--; if (!depth) break; }
  }
  if (argEnd >= masked.length) return src;
  const args = src.slice(argOpen + 1, argEnd);   // 参数文本（逐字取自原串）

  const newBody = '{\n'
    + '  // [specialize] 按 uTexId=' + id + ' 特化：只保留 ' + fn + '，其余 23 个图案不参与编译。\n'
    + '  //   由 src/render/legacy/skin/shader/specialize.js 生成；数学逐字未改。\n'
    + '  vec3 result = vec3(0.0);\n'
    + '  result = ' + fn + '(' + args + ');\n'
    + '  return result;\n'
    + '}';
  return src.slice(0, body.open) + newBody + src.slice(body.close + 1);
}

/* ────────────────────────── 带缓存的便捷入口 ────────────────────────── */

const memo = new Map();
function cached(key, produce) {
  if (memo.has(key)) return memo.get(key);
  const v = produce();
  memo.set(key, v);
  return v;
}

/** 清空缓存（材质全局重置 / 调试用） */
/** 把 k3dCardMotif 的**函数体**换成常量（其余函数原样保留）。
 *
 * ★ 2026-10-17（烘焙全量化）：所有活跃族的纹样都走 uBakedAtlas 采样时，
 *   25 路 if/else 整段都不需要了。但**绝不能把整个 functions 换成桩** ——
 *   那个字符串里还有 k3dCardHash / k3dApplyStageCardFx / k3dApplyCardRoughness /
 *   光效等共享函数，一起删掉会让 shader 编译失败（症状是**静默白屏**：
 *   本工程 three 关掉了 checkShaderErrors，控制台只有一条 WebGL 警告）。
 *   所以这里只做**外科式**替换：定位 k3dCardMotif 的 {} 体，整体换成 return 0.5。 */
let motifStubCache = null;
export function stubMotifBody() {
  if (motifStubCache != null) return motifStubCache;
  const raw = (K3D.shaderCardEffects && K3D.shaderCardEffects.functions) || '';
  if (!raw) return (motifStubCache = raw);
  const masked = blankComments(raw);
  const body = findFunctionBody(masked, 'k3dCardMotif');
  if (!body) return (motifStubCache = raw);
  motifStubCache = raw.slice(0, body.open + 1)
    + '\n  /* 烘焙族全部走 uBakedAtlas 采样（见 bakedMotif.js）*/\n  return 0.5;\n'
    + raw.slice(body.close);
  return motifStubCache;
}

export function clearSpecializeCache() { memo.clear(); }

const g = () => (typeof globalThis !== 'undefined' ? globalThis : {});
const K3D = (g().K3D = g().K3D || {});

/* ────────────────────── 运行时开关 ──────────────────────
 * 关掉特化时会**原样返回未裁剪的源码**，即"与改造前完全等价的旧路径"。
 * 两个用途：
 *   ① 回滚阀门 —— 万一某个 GPU/驱动上特化出错，一行开关即可退回旧行为；
 *   ② 像素 A/B 对拍 —— 同一场景分别以开/关渲染，diff 像素证明画面没变。
 * 关闭方式（任一）：window.K3D_NO_SPECIALIZE = 1 / URL 带 `?spec=0`。 */
function specializeDisabled() {
  const G = g();
  if (G.K3D_NO_SPECIALIZE) return true;
  try {
    const search = G.location && G.location.search;
    if (typeof search === 'string' && /[?&]spec=0(?:&|$)/.test(search)) return true;
  } catch (_) { /* ignore */ }
  return false;
}

/* ────────────────────── 材质级 family 并集 ──────────────────────
 * k3dCardMotif 有两条调用来源，且**在同一个 program 里**：
 *   ① 刀身：uCardFx[i].x（9 个阶段槽）      —— bladeSkinShader 能看到
 *   ② 刀柄：uHandleCardFx.x（S8 刀柄卡）    —— 只有 bladeMask hook 能看到
 * 两条都在同一个片元着色器里，所以允许集必须是两者的并集。
 * bladeMask 侧先 noteFamilies()，若并集变大就通知 bladeSkinShader.refresh() 重建
 * 自己的 hook spec（three 用两个 hook 的当前 spec 一起编程序，所以重建顺序安全）。 */
const FAMILY_NOTES = new WeakMap();

export const shaderSpecialize = {
  selectChain,
  selectPattern,
  clearSpecializeCache,
  stubMotifBody,

  /** 当前是否启用特化（供 signature 组装方把开关状态计入缓存键） */
  enabled() { return !specializeDisabled(); },

  /** 图案：patterns.js 的完整源码 → 只留 texId 对应的那一个（并裁掉其它 23 个函数体） */
  patterns(texId) {
    const raw = K3D.shaderPatterns && K3D.shaderPatterns.common;
    if (!raw) return '';
    if (specializeDisabled()) return raw;
    const id = Math.max(1, Math.min(24, Math.round(Number(texId) || 1)));
    /* ★ 2026-10-17：**别再尝试"删掉没被用到的图案函数体"**。
       本文件开头作者当年的 bisect 已经证明：「只留 1 条图案 → 38.2s，源码只少 1,631 字节」，
       而「158 个函数定义全留着、一行不执行 → 0.1s」——**函数定义本身是免费的**，
       代价 ∝ **运行时分派路数**，不 ∝ 代码量。
       于是我先后试过的两种"裁剪函数体"（正则删 return / 大括号配平删除）都：
       既没有收益（定义本来就不花钱），又都因为切坏 GLSL 而回滚。
       真正有效的是**减少运行时分派路数**——那正是 selectPattern / finishes / cardMotif
       这三处特化在做的事；继续优化请沿着"分派路数"这条线，别碰函数定义。 */
    return cached('pat:' + id, () => selectPattern(raw, id));
  },

  /** 工艺：finishes.js → 只留 uFinId 对应的那一支 */
  finishes(finId) {
    const raw = K3D.shaderFinishes && K3D.shaderFinishes.common;
    if (!raw) return '';
    if (specializeDisabled()) return raw;
    const id = Math.round(Number(finId));
    const allowed = Number.isFinite(id) && id >= 1 && id <= 12 ? [id] : [];
    return cached('fin:' + id, () => (allowed.length ? selectChain(raw, 'k3dApplyFinish', 'finId', allowed) : raw));
  },

  /** 卡纹样：只留当前构筑里真正出现过的 family（通常 ≤ 8 条，原本是 25 条） */
  cardEffects(families) {
    const raw = K3D.shaderCardEffects && K3D.shaderCardEffects.functions;
    if (!raw) return '';
    if (specializeDisabled()) return raw;
    const list = Array.from(new Set((families || []).filter((v) => Number.isFinite(v))))
      .map((v) => Math.round(v)).sort((a, b) => a - b);
    if (!list.length) return raw;
    return cached('card:' + list.join(','), () => selectChain(raw, 'k3dCardMotif', 'family', list));
  },

  /** 刀柄：handleLook.js → 只留 uHandlePatternKind 对应的那一支 */
  handleLook(src, kind) {
    const raw = src || (K3D.handleLookGLSL || '');
    if (!raw) return '';
    if (specializeDisabled()) return raw;
    const id = Math.round(Number(kind));
    const allowed = Number.isFinite(id) && id >= 0 && id <= 23 ? [id] : [];
    return cached('hl:' + raw.length + ':' + id,
      () => (allowed.length ? selectChain(raw, 'k3dHandleLook', 'kind', allowed) : raw));
  },

  /** 从 uCardFx（Float32Array(9*4)）反推当前构筑用到的 motif family 集合 */
  familiesFromCardFx(cardFx) {
    const set = new Set();
    if (!cardFx || !cardFx.length) return [];
    const n = Math.floor(cardFx.length / 4);
    for (let i = 0; i < n; i++) {
      /* ★ 2026-10-17（烘焙全量化）：只统计**活跃槽**（fx.y > 0）。
         非活跃槽的族永远不会被画到 —— 把它们带进 fams 只会让那一族的 25 路分支
         白白进源码（实测：全部烘焙后 fams 变空反而触发 cardEffects([]) 返回整份 raw）。 */
      if (!(Number(cardFx[i * 4 + 1]) > 0)) continue;
      const a = Number(cardFx[i * 4]);
      if (!Number.isFinite(a)) continue;
      const style = Math.floor(a);
      const rank = Math.max(1, style);
      const family = ((rank - 1) % 25 + 25) % 25;
      set.add(family);
    }
    return Array.from(set).sort((x, y) => x - y);
  },

  /** 记下某材质**当前**刀柄路径需要的 motif family（覆盖式，不是累加）。
   *  覆盖式很关键：否则玩家在一局里换几次刀柄卡，并集会一路涨回 25 条，
   *  特化收益会随游玩时间衰减。返回并集是否发生变化。 */
  noteFamilies(material, families) {
    if (!material) return false;
    const prev = FAMILY_NOTES.get(material) || new Set();
    const next = new Set();
    for (const f of (families || [])) {
      const v = Math.round(Number(f));
      if (Number.isFinite(v) && v >= 0 && v <= 24) next.add(v);
    }
    const same = prev.size === next.size && Array.from(next).every((v) => prev.has(v));
    FAMILY_NOTES.set(material, next);
    return !same;
  },

  /** 读取某材质已登记的额外 family（bladeSkinShader 组装时并入） */
  familiesFor(material) {
    if (!material) return [];
    const s = FAMILY_NOTES.get(material);
    return s ? Array.from(s).sort((x, y) => x - y) : [];
  },

  /** 判断某个 style 值（fx[0]）是否需要真正参与 motif 分派 */
  familyOfStyle(styleValue) {
    const a = Number(styleValue);
    if (!Number.isFinite(a)) return null;
    const rank = Math.max(1, Math.floor(a));
    return ((rank - 1) % 25 + 25) % 25;
  },
};

K3D.shaderSpecialize = shaderSpecialize;

export default shaderSpecialize;
