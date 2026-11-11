/**
 * 表现层 · 组件
 *
 * 只负责把 core 的快照渲染成节点，不含任何规则判断。
 * 风险相关组件强制 **颜色 + 文字/符号双编码**（设计系统要求，不允许单靠颜色）。
 */

import { el } from './dom.js';
import { STAT_KEYS, STAT_META, STAT_SOFT_CAP, RARITY_THRESHOLDS, tagTierOf } from '../data/balance.js';
import { RARITY_CN } from '../data/cards.js';
import { cardDoodle, doodleSpec } from './cardDoodles.js';
import { tagName, isBaseTag, isSpecialTag } from '../data/tags.js';

/* ── 六边形图标：外环统一，内圈按旋转/半径/色差异化 ── */

const HEX_RING = 'M13 1.5 L23 7.3 L23 18.7 L13 24.5 L3 18.7 L3 7.3 Z';

function hexSvg(corePath, on = false) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 26 26');
  svg.setAttribute('class', 'hex' + (on ? ' is-on' : ''));
  svg.setAttribute('aria-hidden', 'true');
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  ring.setAttribute('class', 'ring');
  ring.setAttribute('d', HEX_RING);
  const core = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  core.setAttribute('class', 'core');
  core.setAttribute('d', corePath);
  core.setAttribute('fill-rule', 'evenodd');
  svg.appendChild(ring); svg.appendChild(core);
  return svg;
}

/** 8 个页面图标：内圈形状各异（锤/杯/坊/日/阁/鉴/置/卷） */
export const ICONS = {
  forge: (on) => hexSvg('M6 10 L10 6 L16 9 L12 13 Z M11 12 L13 10 L20 17 L18 19 Z', on),
  arena: (on) => hexSvg('M8 6 H18 V11 A5 5 0 0 1 14 16 V18 H17 V20 H9 V18 H12 V16 A5 5 0 0 1 8 11 Z M5 7 H8 V9 H7 V11 L9 13 L8 14 L5 11 Z M18 7 H21 V11 L18 14 L17 13 L19 11 V9 H18 Z', on),
  workshop: (on) => hexSvg('M5 9 H21 L19 12 H15 V15 H18 V18 H8 V15 H11 V12 H7 Z M6 7 H11 V9 H6 Z', on),
  daily: (on) => hexSvg('M13 6.6 a6.4 6.4 0 1 0 0 12.8 a6.4 6.4 0 0 0 0-12.8 z M13 9 v5.4 l3.6 2.2', on),
  collection: (on) => hexSvg('M6 9 H20 V19 H6 Z M8 11 V17 H18 V11 Z M10 6 H16 V10 H14 V8 H12 V10 H10 Z M11 12 H15 V15 H11 Z', on),
  codex: (on) => hexSvg('M7 8 h5.4 v10 H7 z M13.6 8 H19 v10 h-5.4 z', on),
  appraise: (on) => hexSvg('M13 6.4 l4.4 3.2 v5.6 L13 19.6 l-4.4-4.4 V9.6 z', on),
  settings: (on) => hexSvg('M11 5 H15 L15.5 8 L18 9 L20 11 V15 L18 17 L15.5 18 L15 21 H11 L10.5 18 L8 17 L6 15 V11 L8 9 L10.5 8 Z M13 10 A3 3 0 1 0 13 16 A3 3 0 1 0 13 10 Z', on),
};

/* ── 风险组件（双编码） ── */

/* ★ 风险符号：**三档 ▲ 阶梯**（▲ / ▲▲ / ▲▲▲），与 tokens.css 的
   --risk-sym-safe/warn/danger 逐字对应（颜色 + 符号双编码，设计系统硬规则）。
   ⚠ 旧实现写的是 { safe:'', warn:'▲', danger:'▲▲' } —— 两档且 safe 留空，
     与 token 里的三档阶梯不一致，同一个概念在 CSS/JS 两处各说各话。
     现已对齐：颜色承载语义（绿/琥珀/红），▲ 的数量承载"第几档"。 */
const MARK = { safe: '▲', warn: '▲▲', danger: '▲▲▲' };

/**
 * 风险档位 tone → 展示语气归一。
 *
 * ⚠ 根因：data/balance.js 把最高两档（危险 / 崩溃边缘）的 tone 标成了 'risk'
 *   （语义是"已进入冒险区"），而本组件的展示语气词汇表是 safe / warn / danger。
 *   不归一的话这两档会渲染成 `risk--risk` —— 没有任何 CSS 命中，
 *   同时 `MARK['risk']` 是 undefined，▲▲ 记号也一起消失。
 *   结果就是：风险 ≥80 时颜色与符号**双双失效**，只剩数字，
 *   恰好违反设计系统"颜色 + ▲/▲▲ 双编码，不允许单靠颜色"的硬规则。
 *
 * 这里做一次映射兜底，保证渲染层永远拿到合法语气；数据层语义保持不变。
 */
const TONE_ALIAS = { risk: 'danger' };
const normTone = (t) => (TONE_ALIAS[t]) || (MARK[t] !== undefined ? t : 'safe');

export function riskBar({ current, peak, chance, band, nextChance = null, priorCurrent = null }) {
  const tone = normTone(band?.tone);
  const pct = Math.max(0, Math.min(100, current || 0));
  const node = el('div', { class: `risk risk--${tone}` }, [
    el('div', { class: 'risk-head' }, [
      el('span', { class: 'risk-mark', text: MARK[tone] || '' }),
      el('b', { class: 'risk-value', text: priorCurrent == null ? String(Math.round(pct)) : `${Math.round(priorCurrent)} → ${Math.round(pct)}` }),
      el('span', { class: 'risk-band', text: band?.name || '' }),
      el('span', { class: 'muted tiny', text: `峰值 ${Math.round(peak || 0)}` }),
    ]),
    el('div', { class: 'risk-bar' }, [el('i', { style: { width: pct + '%' } })]),
    el('div', { class: 'risk-foot' }, [
      el('span', { text: `本次断裂概率 ${((chance || 0) * 100).toFixed(1)}%` }),
      el('span', { text: nextChance != null ? `下一锤 ${(nextChance * 100).toFixed(1)}%` : '' }),
    ]),
  ]);
  return node;
}

/**
 * 风险 chip（**只用于决策卡**）。
 * ★ 文案压到最短：卡宽只有 ~110px，卡头还要放稀有度徽标。
 *   实测「▲▲▲ 风险 +6」+「★ 稀有」会把 .dcard-head 顶出卡外
 *   （probe-card-layout：scrollW 148 > clientW 123）→ 第三张卡被裁。
 *   符号与颜色已表达"风险"，文本只留量级；完整语义放 title。
 */
export function riskChip(deltaPoints) {
  const v = Number(deltaPoints) || 0;
  const tone = v > 0 ? (v >= 8 ? 'danger' : 'warn') : 'safe';
  return el('span', {
    class: `chip chip--risk chip--risk-${tone}`,
    // ★ 符号由 CSS 的 ::before 出（--rsym → --risk-sym-*），文本里不再手写 ▲。
    title: v === 0 ? '无风险' : `风险 ${v > 0 ? '+' : ''}${v}`,
    text: v === 0 ? '无风险' : `${v > 0 ? '+' : ''}${v}`,
  });
}

/* ── 六维 ── */

// 仅用于呈现的粗粒度趋势，不暴露尚未鉴定的数值或精确条长。
function statTrend(value) {
  const v = Math.max(0, Number(value) || 0);
  // Continuous visible movement without revealing precise pre-appraisal numbers.
  const width = v ? Math.max(5, Math.min(100, v / 160 * 100)) : 0;
  if (!v) return { label: '未成', width };
  if (v < 40) return { label: '蓄势', width };
  if (v < 75) return { label: '渐强', width };
  if (v < 115) return { label: '出色', width };
  return { label: '强劲', width };
}

export function statRail(stats, directions = null, showValues = false, cap = STAT_SOFT_CAP) {
  return el('div', { class: 'stat-rail' }, STAT_KEYS.map((k) => {
    const v = Math.max(0, Math.min(cap, Number(stats?.[k]) || 0));
    const d = directions && directions[k];
    const trend = statTrend(v);
    return el('div', { class: 'stat-row', dataset: { k } }, [
      el('span', { class: 'stat-name', text: STAT_META[k].name }),
      el('div', { class: 'stat-bar' }, [el('i', { style: { width: (showValues ? v / cap * 100 : trend.width) + '%' } })]),
      showValues
        ? el('span', { class: 'stat-dir mono', text: String(Math.round(v)) })
        : el('span', { class: `stat-dir ${d ? 'dir-' + d.key : 'dir-flat'}`, text: d ? d.label : trend.label }),
    ]);
  }));
}

/* 六维横排（锻造页紧凑头）：6 列，只显示强弱分档，选中卡时叠加方向箭头。
 * 为什么锻造页不用竖向 rail：竖向 6 行约 200px，会把 3D 舞台挤到 40% 硬下限以下。 */
export function statGrid(stats, directions = null, showValues = false, preview = null) {
  const comparing = !!preview;
  return el('div', { class: 'stat-grid' + (comparing ? ' is-comparing' : ''),
    'aria-label': comparing ? '选中卡后的六维真实预览与增量' : showValues ? '六维属性' : '六维趋势' },
    STAT_KEYS.map((k) => {
      const v = Math.max(0, Math.min(STAT_SOFT_CAP, Number(stats?.[k]) || 0));
      const d = directions && directions[k];
      const down = d && String(d.key).startsWith('down');
      const strong = d && String(d.key).endsWith('2');
      const flat = !d || d.key === 'flat';
      const arrow = flat ? '—' : (down ? (strong ? '↓↓' : '↓') : (strong ? '↑↑' : '↑'));
      const trend = statTrend(v);
      const old = Math.max(0, Math.min(STAT_SOFT_CAP, Number(preview?.before?.[k]) || 0));
      const delta = Number(preview?.delta?.[k]) || 0;
      const deltaLabel = delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${Math.round(delta)}`;
      return el('div', { class: `stat-cell u-st-${k}`,
        'aria-label': `${STAT_META[k].name}：${comparing ? `${Math.round(old)} 到 ${Math.round(v)}（${deltaLabel}）` : showValues ? Math.round(v) : trend.label}` }, [
        el('div', { class: 'stat-cell-name', text: STAT_META[k].name }),
        el('div', { class: 'stat-cell-meter', 'aria-hidden': 'true' }, [
          comparing ? el('span', { class: 'stat-meter-before', style: { width: (old / STAT_SOFT_CAP * 100) + '%' } }) : null,
          el('i', { style: { width: (showValues ? v / STAT_SOFT_CAP * 100 : trend.width) + '%' } }),
        ]),
        // 比较时只保留条形轨道和方向，不再额外渲染当前数值行。
        comparing ? null : el('div', { class: 'stat-cell-val', text: showValues ? String(Math.round(v)) : trend.label }),
        comparing ? el('div', { class: 'stat-cell-dir' + (delta < 0 ? ' is-down' : ''), text: deltaLabel })
          : d ? el('div', { class: 'stat-cell-dir' + (down ? ' is-down' : ''), title: d.label || '', text: arrow }) : null,
      ]);
    }));
}

/* ── 稀有度 ── */

/**
 * 稀有度徽标。
 *
 * 三通道：底色 foil（CSS）、档位色（CSS）、记号（除神话外由 CSS ::before 出文字字形）。
 *
 * ⚠ 神话档的记号是**内联 SVG**，不是文字字形 —— 详见 rarityMark()。
 *   正因如此这里用 children 而不是 props.text：el() 先处理 props 再 append 子节点，
 *   写成 `text` 的话文字会排到 SVG **前面**，记号跑到档位名右边去。
 */
export function rarityBadge(id, CnName = null) {
  const key = id || 'common';
  return el('span', { class: `rarity rarity--${key}` }, [
    key === 'mythic' ? rarityMark() : null,
    CnName || RARITY_CN[id] || '普通',
  ]);
}

/* ── 品质印章：**现代标记**（出炉揭晓页专用）──────────────────────────
 *
 * 参考原项目 css/forgeout.css 的 .fo-seal：金属名牌 + 逐档底色。但**升级两处**：
 *   ① 原项目的稀有度符号走 emoji（--r-myth-sym = U+1F451 👑）与星号（★★★）。
 *      在浅色 TCG 语境里，emoji 既不属于设计语言、也不是矢量、还随系统字体变形；
 *      星号阶梯在 5 档体系下又只能表达 3 档。这里全部换掉。
 *   ② 原项目只有"名牌"一个元素，六档之间只差底色 —— 单靠颜色承载语义，
 *      违反本工程"颜色不单独承载信息"的硬规则（见 riskBar 的 ▲ 双编码注释）。
 *
 * 现在改成**程序化六边形徽记**，与 components.js 的 8 个页面图标同一族
 * （统一外环 + 内圈差异化）：
 *   · 外环     统一六边形 —— 家族身份
 *   · 内圈     边数随档位递增 3 → 4 → 5 → 6（形状即档位，第二通道）
 *   · 实心     只有最高两档收实心（"面"的完整度即档位，第三通道）
 *   · 双环     最高两档额外加一圈 30° 反相六边形
 *   · 辐条     神话独有：6 条从内核射向外环的短线，替代原项目的 👑
 *   · 名牌     逐档金属渐变（浅→深→浅三档）+ 白色内发光 hairline
 *
 * ⚠ 为什么内圈用**纯多边形**而不是圆/星：本工程的形状语言全部由直线构成
 *   （六边形图标、.sp-num 的编号点除外），曲线会立刻显得"另一个体系"。
 * ⚠ SVG 子元素用 createElementNS + setAttribute('class', <纯字面量>)：不留
 *   拼接表达式，tools/audit-classes.mjs 才能把每个类名都抽到（见其文件头）。
 *   "实心"也就不用动态类名 —— 交给 .qseal--legend / .qseal--mythic 的选择器。
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 正多边形路径（rotDeg = -90 时首顶点在正上方） */
function polyPath(cx, cy, r, sides, rotDeg = -90) {
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = (Math.PI * 2 * i) / sides + (rotDeg * Math.PI) / 180;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}

/** n 条从 r0 射到 r1 的径向短线（神话专用） */
function spokePath(cx, cy, r0, r1, n) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    d += `M${(cx + r0 * Math.cos(a)).toFixed(2)} ${(cy + r0 * Math.sin(a)).toFixed(2)}`
      + `L${(cx + r1 * Math.cos(a)).toFixed(2)} ${(cy + r1 * Math.sin(a)).toFixed(2)}`;
  }
  return d;
}

const CX = 22;
const CY = 22;
const RING_R = 18.5;     // 外环半径（±1px 描边后仍留在 44 视口内）
const RING2_R = 20.6;    // 反相外环半径

/**
 * 六档几何：与 `data/balance.RARITY_THRESHOLDS` **一一对应**（2026-10-14 扩到 6 档）。
 *
 * 内核形状阶梯 = **圆 → 3 → 4 → 5 → 6 边**，半径逐档递增（6.6 → 9.4）：
 * 圆 = 未加工，三角 → 方 → 五边 → 六边 = 逐步成型。
 *
 * ⚠ 2026-10-14（用户要求「前四档中间的图形实心」）：**六档内核现在全部实心**
 *   （fill = 档位色、无描边）。此前是"低四档空描边、最高两档实心"，改后：
 *   - 低四档靠**边数**区分（圆 / 三角 / 菱形 / 五边）；
 *   - 史诗的"中点"（原来是同色小实心 pip）**翻转为反相小孔**，否则填实后它会消失；
 *   - 传说/神话保持不变（传说=实心六边挖大孔+反相环；神话=填满孔+辐条）。
 *   → 见 `css/components.css` 的 `.qseal-core`（统一 fill）与本文件的内核构建分支。
 *
 * ⚠ 圆走 `<circle>` 元素，不走 `polyPath()`：`d` 属性在圆上不存在，
 *   所以 `tools/shoot-seal.mjs` 数边数时要把圆单独记为 0（见该文件）。
 */
const SEAL_TIERS = {
  common: { circle: true, r: 6.6 },
  fine:   { sides: 3, r: 7.0 },
  rare:   { sides: 4, r: 7.6 },
  // pipHole：实心五边上的反相小孔（原「中点」pip 的翻转）—— 半径取 2.4
  //   而非原 pip 的 1.9：实心块里的孔比独立小点更难读，放大一点才看得见。
  epic:   { sides: 5, r: 8.2, pipHole: 2.4 },
  legend: { sides: 6, r: 8.8, hole: 3.6, ring2: true },
  mythic: { sides: 6, r: 9.4, ring2: true, spokes: true },
};

/**
 * 成刀轴 6 档的中文名 —— **派生自 `RARITY_THRESHOLDS`，不手写副本**。
 *
 * ⚠ 这里原来 fallback 到 `RARITY_CN[id]`（卡片轴的表）。两表对共有的档位取值相同，
 *   所以结果"看起来是对的"，但那是**巧合**：印章是成刀轴的组件，名分该取自成刀轴。
 *   （这个巧合正是 `legend` 一中一英两名问题的温床 —— 见 core/scoring.js 上的注释。）
 */
const SEAL_NAME = Object.freeze(
  Object.fromEntries(RARITY_THRESHOLDS.map((r) => [r.id, r.name])),
);

function svgPath(d, extra = null) {
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', d);
  if (extra) for (const [k, v] of Object.entries(extra)) p.setAttribute(k, v);
  return p;
}

/**
 * 神话档徽标记号：**六边形外环 + 实心内核**，与 qualitySeal() 的神话内核同族。
 *
 * ⚠ 这是全站最后一处 emoji 的替代。原项目（以及本工程沿用至今）的
 *   `.rarity--mythic` 走 `--r-myth-sym: '\1F451'`（👑）—— emoji 不属于本工程的
 *   形状语言、不是矢量、还随系统字体变形，在列表徽标里尤其突兀。
 *
 * ⚠ 只换神话这一档是**有意的**，不是漏做：其余 5 档的记号是 ★ 的个数
 *   （0/1/2/3 颗），在 10px 徽标（决策卡卡头、.blade-pick 压到 --fs-2xs）下
 *   是唯一还读得出的档位信号；换成 3/4/5/6 边形只会糊成一团。
 *   神话档单枚记号宽 1.2em，**比 ★★★（≈2.76em）更窄**，不会挤爆卡头。
 *
 * ⚠ 类名同样在调用点 classList.add('字面量')，理由见 qualitySeal() 上的注释。
 */
function rarityMark() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'rarity-mark');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  const ring = svgPath(polyPath(12, 12, 9.4, 6));
  ring.classList.add('rarity-mark-ring');
  svg.appendChild(ring);

  const core = svgPath(polyPath(12, 12, 4.6, 6));
  core.classList.add('rarity-mark-core');
  svg.appendChild(core);

  return svg;
}

/**
 * 品质印章节点。
 * @param {string} rarityId 'common' | 'fine' | 'rare' | 'epic' | 'legend' | 'mythic'
 * @param {string} [name]   中文档位名（一般传 record.rarityName）
 *
 * ⚠ 每个 path 的类名都在**调用点**用 classList.add('字面量') 挂上，不经过参数传递 ——
 *   tools/audit-classes.mjs 只认"字面量紧跟在 class:/.classList.* 后面"，
 *   把类名当形参传进辅助函数会让 ② 把它们全报成死样式（抽出侧无法静态求值）。
 */
export function qualitySeal(rarityId, name = null) {
  const known = !!SEAL_TIERS[rarityId];
  if (!known) {
    /* ⚠ 未知档位**必须留痕**。
       静默回落 common 是本组件最差的失败模式：不报错、却盖出一枚"普通"印章 ——
       玩家看到的是**错误的信息**，而开发者毫无察觉。
       （保留回落而不是抛错：印章是揭晓页的一部分，抛错会让整页白屏，代价更大。）
       注：2026-10-14 两轴都已扩到 6 档（`fine` 在成刀轴也合法了），
       所以"把 card.rarity 传进来"不再是高危误用 —— 但**仍然只能传成刀轴的档位**，
       因为印章的几何是绑定成刀档位表的。 */
    console.warn(
      `[qualitySeal] 未知稀有度档位 "${rarityId}"，已回落 'common'（印章会显示成"普通"）。`
      + ` 印章只服务**成刀轴**，合法值：${Object.keys(SEAL_TIERS).join(' / ')}。`,
    );
  }
  const id = known ? rarityId : 'common';
  const t = SEAL_TIERS[id];

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 44 44');
  svg.setAttribute('class', 'qseal-svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');

  if (t.ring2) {
    const r2 = svgPath(polyPath(CX, CY, RING2_R, 6, -60));
    r2.classList.add('qseal-r2');
    svg.appendChild(r2);
  }
  const ring = svgPath(polyPath(CX, CY, RING_R, 6));
  ring.classList.add('qseal-ring');
  svg.appendChild(ring);

  /* 内核：形状 = 档位（圆 → 3 → 4 → 5 → 6 边），**六档一律实心**（fill 由 CSS 的
     `.qseal-core` 统一给，见 css/components.css）。
     - 史诗：实心五边 + 反相小孔（pipHole，原「中点」的翻转）；
     - 传说：实心六边 + 反相大孔（hole）→ 厚壁六角环；
     - 神话：六边不挖孔（填满）+ 辐条。
     孔 = 同一 path 的第二段子路径 + `fill-rule="evenodd"`（真正透明，不依赖底色）。
     ⚠ 圆用 <circle>（没有 d 属性）—— 类名照旧挂 qseal-core，CSS 的选择器不区元素类型。
       `tools/shoot-seal.mjs` 数边数时把圆记为 0。 */
  let core;
  if (t.circle) {
    core = document.createElementNS(SVG_NS, 'circle');
    core.setAttribute('cx', String(CX));
    core.setAttribute('cy', String(CY));
    core.setAttribute('r', String(t.r));
  } else {
    let coreD = polyPath(CX, CY, t.r, t.sides);
    if (t.hole) coreD += polyPath(CX, CY, t.hole, t.sides, -60);
    if (t.pipHole) coreD += polyPath(CX, CY, t.pipHole, 6, -60);
    core = svgPath(coreD, (t.hole || t.pipHole) ? { 'fill-rule': 'evenodd' } : null);
  }
  core.classList.add('qseal-core');
  svg.appendChild(core);

  if (t.spokes) {
    const spokes = svgPath(spokePath(CX, CY, 10.8, 14.4, 6));
    spokes.classList.add('qseal-spoke');
    svg.appendChild(spokes);
  }

  return el('span', {
    class: 'qseal qseal--' + id,
    dataset: { rarity: id },
  }, [
    svg,
    el('span', { class: 'qseal-name', text: name || SEAL_NAME[id] || '' }),
  ]);
}

/**
 * 标签补档提示（rework T14）。
 *
 * ★ 要修什么：改造前卡片只给六维方向 + 风险，玩家看不出
 *   「选这张卡会把哪个标签补到 2/4/6 层」，而 2/4/6 层恰恰是特性和
 *   评分倍率的关键门槛（1.10 / 1.22 / 1.40）。
 *
 * ★ 现在传入当前标签层数，卡面直接写「精密 3→4 层 · 补到强化」。
 *   只给层数与档名，不泄露隐藏六维精确值。
 *
 * @param {string[]} tags 这张卡带的标签
 * @param {object} counts { [tagId]: layers } 本局当前累计层数
 * @returns {{tagId,name,from,to,tierName,isTierUp}|null} 最能代表“成长”的那一条
 */
function tagTierHint(tags, counts) {
  if (!Array.isArray(tags) || !tags.length) return null;
  const out = [];
  for (const tagId of tags) {
    const from = Number(counts?.[tagId]) || 0;
    const to = from + 1;
    const fromTier = tagTierOf(from);
    const toTier = tagTierOf(to);
    out.push({
      tagId,
      name: tagName(tagId),
      from,
      to,
      tierName: toTier ? toTier.name : null,
      /** 本卡是否让该标签跨到新档（含首次达 2 层） */
      isTierUp: !!toTier && (!fromTier || fromTier.id !== toTier.id),
      /** 还差几层到下一个会授予特性的档（2/4/6） */
      toNext: [2, 4, 6].find((need) => to < need) ?? null,
    });
  }
  /* 优先展示“会升档”的那条；都没有则展示层数最高的 */
  out.sort((a, b) => Number(b.isTierUp) - Number(a.isTierUp) || b.to - a.to);
  return out[0] || null;
}

function ellipsisIcon(){
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 24 24');
  svg.setAttribute('aria-hidden','true');
  svg.setAttribute('focusable','false');
  svg.classList.add('dcard-more-svg');
  for(const x of [5,12,19]){
    const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
    circle.setAttribute('cx',String(x));circle.setAttribute('cy','12');circle.setAttribute('r','1.75');
    circle.setAttribute('fill','currentColor');svg.appendChild(circle);
  }
  return svg;
}

/* ── 决策卡 ── */

export function decisionCard(card, { picked = false, onPick, onDetail, tagCounts = null } = {}) {
  // 候选小卡只承载决策身份：卡面不再复制风险数字与六维箭头。
  // 精确数值统一交给选中后的六维/风险预览条（预览为纯函数，不写存档）。
  const base = (card.tags || []).filter(isBaseTag);
  const special = (card.tags || []).filter(isSpecialTag);
  const tierHint = tagTierHint(base, tagCounts);
  const tagTitle = tierHint ? tierHint.name : special.length ? tagName(special[0]) : '工艺';
  const tierText = tierHint
    ? tierHint.isTierUp ? `晋升 · ${tierHint.tierName}`
      : tierHint.toNext ? `距离升阶 ${tierHint.toNext - tierHint.to} 层`
        : '已达最高档'
    : special.length ? '稀有工艺 · 即刻激活' : (card.role || '独立工艺');
  const isInstant = !tierHint && special.length > 0;
  const art = doodleSpec(card);

  const node = el('div', {
    class: `dcard dcard--r-${card.rarity || 'common'}${picked ? ' is-picked' : ''}${isInstant ? ' dcard--instant' : ''}`,
    role: 'button', tabindex: '0', 'aria-pressed': String(picked),
    'aria-label': `预览${card.name}，${card.rarityCn || RARITY_CN[card.rarity] || '普通'}，${tagTitle}路线，${tierText}`,
    dataset: { cardId: card.id, stage: card.stage },
    style: `--dcard-art-tint:${art.palette.field};--dcard-ink:${art.palette.ink};--dcard-color:${art.palette.main};`,
    onclick: () => onPick && onPick(card),
    onkeydown: event => {
      if (event.target !== event.currentTarget) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPick && onPick(card); }
    },
  }, [
    el('div', { class: 'dcard-head' }, [
      rarityBadge(card.rarity, card.rarityCn),
      onDetail ? el('button', {
        class:'dcard-more',type:'button',title:card.name+'详情',
        'aria-label':card.name+'详情',
        onclick:event=>{event.stopPropagation();onDetail(card);},
      },[ellipsisIcon()]) : null,
    ]),
    el('div', { class: 'dcard-visual', 'aria-hidden': 'true',
      dataset: { doodleFamily: art.primary, doodleSignature: art.signature } }, [
      cardDoodle(card),
    ]),
    el('div', { class: 'dcard-title', text: card.name }),
    el('div', { class: 'dcard-plan' }, [
      el('div', { class: 'dcard-build-title', text: tagTitle }),
      isInstant ? null : el('div', { class: 'dcard-build-result' + (tierHint?.isTierUp ? ' is-up' : ''), text: tierText }),
    ]),
    // Rare, immediately activated techniques have no 2/4/6 progress rail.
    // Give their activation copy the otherwise-empty lower area instead.
    isInstant ? el('div', { class: 'dcard-instant', 'aria-label': '稀有工艺，即刻激活' }, [
      el('span', { class: 'dcard-instant-eyebrow', text: '稀有工艺' }),
      el('strong', { class: 'dcard-instant-action', text: '即刻激活' }),
    ]) : null,
    tierHint ? el('div', { class: 'dcard-tier', title: `${tierHint.name} ${tierHint.from} → ${tierHint.to} 层，${tierText}` }, [
      el('span', { text: `${tierHint.from} → ${tierHint.to} / 6` }),
      el('span', { class: 'dcard-layer-dots', 'aria-hidden': 'true' }, Array.from({ length: 6 }, (_, i) => el('i', {
        class: i < tierHint.from ? 'is-owned' : i < tierHint.to ? 'is-added' : '',
      }))),
    ]) : null,
  ]);
  return node;
}

/* ── 特性条目 ── */

export function traitItem(trait, kind = '') {
  return el('div', { class: `trait trait--${kind || 'legacy'}` }, [
    el('div', {}, [
      el('div', { class: 'trait-name', text: trait.name || trait.id }),
      el('div', { class: 'trait-desc', text: trait.desc || '' }),
    ]),
  ]);
}

export default { ICONS, riskBar, riskChip, statRail, statGrid, rarityBadge, qualitySeal, decisionCard, traitItem };
