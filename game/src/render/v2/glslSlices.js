/**
 * GLSL 片段切片工具（纯字符串，不新增/修改任何数学）
 *
 * 固定程序族只保留**真正会被调用**的旧函数：其余定义既不进源码，也就不会被
 * 驱动翻译。这里提供两个外科式操作，均以「注释先遮蔽 → 大括号配平」定位，
 * 找不到目标时原样返回（安全回退，绝不产出坏着色器）。
 */

/** 把注释内容替换成等长空格（保留换行），返回串的下标与原串一一对应。 */
export function blankComments(src) {
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
      i += 1; continue;
    }
    if (state === 1) { if (c === '\n') state = 0; else out[i] = ' '; i += 1; continue; }
    if (c === '*' && d === '/') { out[i] = ' '; out[i + 1] = ' '; state = 0; i += 2; continue; }
    if (c !== '\n') out[i] = ' ';
    i += 1;
  }
  return out.join('');
}

/** 定位函数体（返回原始串上的 [declStart, close] 区间）。 */
export function findFunctionSpan(src, name) {
  const masked = blankComments(src);
  const re = new RegExp('(?:^|[^A-Za-z0-9_])' + name + '[ \\t]*\\(', 'g');
  let m;
  while ((m = re.exec(masked))) {
    const open = masked.indexOf('(', m.index);
    if (open < 0) return null;
    let depth = 0;
    let j = open;
    for (; j < masked.length; j++) {
      if (masked[j] === '(') depth++;
      else if (masked[j] === ')') { depth--; if (!depth) { j++; break; } }
    }
    let k = j;
    while (k < masked.length && /\s/.test(masked[k])) k++;
    if (masked[k] !== '{') continue;                    // 前置声明
    let dep = 0;
    let e = k;
    for (; e < masked.length; e++) {
      if (masked[e] === '{') dep++;
      else if (masked[e] === '}') { dep--; if (!dep) break; }
    }
    if (e >= masked.length) return null;
    let start = m.index + (m[0].startsWith(name) ? 0 : 1);
    // 往回吃掉同行的返回类型（float / vec3 / void …）
    let lineStart = masked.lastIndexOf('\n', start) + 1;
    const head = masked.slice(lineStart, start);
    if (/^\s*(?:float|vec2|vec3|vec4|void|mat3)\s+$/.test(head)) start = lineStart;
    return { start, bodyOpen: k, end: e + 1 };
  }
  return null;
}

/** 取出命名函数的完整定义文本；缺失返回 ''。 */
export function extractFunction(src, name) {
  const span = findFunctionSpan(src, name);
  if (!span) return '';
  return src.slice(span.start, span.end);
}

/** 按名字列表抽取函数（保持给定顺序）。 */
export function extractFunctions(src, names) {
  return names.map((n) => extractFunction(src, n)).filter(Boolean).join('\n\n');
}

/** 替换命名函数的**函数体**（保留签名）；缺失时原样返回。 */
export function replaceFunctionBody(src, name, bodyText) {
  const span = findFunctionSpan(src, name);
  if (!span) return src;
  return src.slice(0, span.bodyOpen + 1) + '\n' + bodyText + '\n' + src.slice(span.end - 1);
}

/**
 * 把 `condVar <op> num` 的 if/else-if 链按**编译期常量**拆成独立函数。
 *
 * 为什么必须拆（实测口径，与 specialize.js 顶部同一结论）：
 *   `k3dApplyStageCardFx` 被 8 个调用点内联，每次都要把 8 条阶段分支翻译一遍 ——
 *   代价 ∝ 运行时分派路数 × 内联次数。把它拆成「一阶段一函数」后，源码里只剩
 *   每个阶段真正会被执行的那一段，且每个调用点之间不再重复。
 *
 * @param {string} src      完整 GLSL
 * @param {string} fnName   原函数名
 * @param {string} condVar  分派形参（如 stage）
 * @param {Array<{value:number,name:string,header:string}>} targets
 *        （tail 是否并入每个函数由 includeTail 控制；返回 tail 供调用方只应用一次）
 *        每个目标：value = 该分支对应的 condVar 取值；name = 新函数名；
 *        header = 新函数签名（不含函数体，含 `) ` 后的位置不含 `{`）
 * @returns {{source:string, replaced:number}}
 */
export function specializeStageChain(src, fnName, condVar, targets, { includeTail = true } = {}) {
  const span = findFunctionSpan(src, fnName);
  if (!span) return { source: src, replaced: 0 };
  const masked = blankComments(src);
  const bodyStart = span.bodyOpen + 1;
  const bodyEnd = span.end - 1;
  const head = masked.slice(bodyStart, bodyEnd);

  // 找到分派链的起点：第一个 `if ( condVar <op> ... )`
  const re = new RegExp('(?:^|[^A-Za-z0-9_])if[ \\t]*\\([ \\t]*' + condVar + '[ \\t]*(?:==|<=|>=|<|>)');
  const hm = head.match(re);
  if (!hm) return { source: src, replaced: 0 };
  const chainStart = bodyStart + hm.index + hm[0].lastIndexOf('if');

  // 逐分支：条件 → 值；块 → [open, close]
  const branches = [];
  let pos = chainStart;
  for (let guard = 0; guard < 64; guard++) {
    const open = masked.indexOf('{', pos);
    if (open < 0 || open > bodyEnd) break;
    const condText = masked.slice(pos, open);
    const isElse = !/if[ \t]*\(/.test(condText) && /else/.test(condText);
    let value = null;
    if (!isElse) {
      const m = condText.match(new RegExp(condVar + '[ \\t]*(==|<=|>=|<|>)[ \\t]*([0-9]+(?:\\.[0-9]+)?)'));
      if (!m) break;
      const num = Number(m[2]);
      value = m[1] === '<' ? Math.floor(num - 1e-6)
        : m[1] === '>' ? Math.ceil(num + 1e-6) : Math.round(num);
    }
    let dep = 0;
    let e = open;
    for (; e < masked.length; e++) {
      if (masked[e] === '{') dep++;
      else if (masked[e] === '}') { dep--; if (!dep) break; }
    }
    if (e >= masked.length) break;
    branches.push({ open, close: e, value, isElse });
    let q = e + 1;
    while (q < masked.length && /\s/.test(masked[q])) q++;
    if (masked.startsWith('else', q)) pos = q; else break;
  }
  if (!branches.length) return { source: src, replaced: 0 };
  const chainEnd = branches[branches.length - 1].close + 1;
  const tail = src.slice(chainEnd, bodyEnd);
  const prelude = src.slice(bodyStart, chainStart);

  let out = src;
  let replaced = 0;
  const emittedTail = includeTail ? tail : '';
  for (const t of targets) {
    let branch = branches.find((b) => !b.isElse && b.value === t.value) || null;
    if (!branch) branch = branches.find((b) => b.isElse) || null;
    const branchText = branch ? src.slice(branch.open, branch.close + 1) : '{}';
    /* 分派形参在新函数里已经不存在 —— 把函数体里对它的引用换成**编译期常量**。
       （`k3dSlotMotif( stage, … )` 这类调用因此可以被折叠成常量槽位，
       这也是 8 路分派消失后源码能真正变小的原因。） */
    const constValue = `${Number(t.value)}.0`;
    const sub = (text) => text.replace(new RegExp('\\b' + condVar + '\\b', 'g'), constValue);
    const fn = `${t.header}\n{\n${sub(prelude)}\n${sub(branchText)}\n${sub(emittedTail)}\n}\n`;
    out += '\n' + fn;
    replaced++;
  }
  return { source: out, replaced, tail: includeTail ? '' : tail };
}

