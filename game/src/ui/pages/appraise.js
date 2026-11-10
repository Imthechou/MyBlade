/**
 * 表现层 · 出炉揭晓（S10 鉴定）
 *
 * 成刀亮相保留品质印章与 3D 刀身；首屏固定刀名和评分/风险/特性/开刃四格。
 * 下方以概览、六维、工艺、评分分段展示完整结算信息，底部固定归档/再锻/参赛入口。
 * revealSteps 的揭晓顺序、品质判定、评分与归档规则均由 Core / Game 提供，本页只呈现。
 * 断刀仍不生成完整评分或参赛资格，但阶段、风险、工艺与发现都留在断刀记录中。
 */

import { el, $, clear, mount, countUp, sheet, toast } from '../dom.js';
import { qualitySeal, statRail, traitItem } from '../components.js';
/* ★ rework T13.1：鉴定页也读**同一份**成刀展示模型与卡片，
   不再自己拼一套（否则同一把刀在鉴定页与藏刀阁长得不一样）。 */
import { resultView as edgeResultView } from '../../core/edge.js';
import { icon } from '../icons.js';
import { motion } from '../../platform/index.js';
import { getTrait } from '../../data/traits.js';
import { tagName } from '../../data/tags.js';
import { getCombo } from '../../data/combos.js';
import { getCard } from '../../data/cards.js';
import { KNIFE_BY_ID, nameOfModel } from '../../data/knifeTypes.js';
import * as Core from '../../core/index.js';
import Game from '../../app/game.js';
import router from '../router.js';
import { getStage } from '../../render/index.js';

let root = null;    // .page[data-page="appraise"]
let host = null;    // 3D 画布容器
let glow = null;    // 品质光晕
let body = null;    // 内容区（内部滚动）
let actions = null; // 固定底部动作条

let scoreEl = null;      // 评分数字节点（逐格播放时要滚动到目标值）
let entryEpoch = 0;
let timers = [];         // 逐格播放的定时器（离开页面要清，避免二次进入重放叠加）

/* ── 骨架 ─────────────────────────────────────────────── */

export function create() {
  root = $('.page[data-page="appraise"]');
  if (!root) return;
  root.innerHTML = '';

  /* 3D 舞台：**透明底**（不铺任何面）——
     不透明底会盖住 body::before/::after 的纸面渐变与 43px 织纹。
     光晕是画布的前一个兄弟节点 → 靠 DOM 顺序落在画布之下（canvas alpha:true）。 */
  glow = el('div', { class: 'ap-glow' });
  host = el('div', { class: 'ap-host', id: 'appraiseStage' });
  root.appendChild(el('div', { class: 'ap-stage' }, [glow, host]));

  body = el('div', { class: 'ap-body' });
  actions = el('div', { class: 'ap-actions' });
  root.appendChild(body);
  root.appendChild(actions);
}

/* ── 渲染 ─────────────────────────────────────────────── */

export function render() {
  if (!root || !body) create();
  if (!body) return;
  clear(body);
  clear(actions);
  actions.classList.remove('ap-actions--try');
  scoreEl = null;

  const rec = Game.record || (Game.run ? Game.appraise() : null);
  if (!rec) {
    // A refreshed result has no live run. Show the saved work without re-awarding it,
    // and keep a real model mounted so startup can complete its normal GPU preparation.
    const saved = Core.progress.collection().slice().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    if (saved) Game.showRecord(saved);
    else Game.showDefault();
    mount(body, [el('div', { class: 'ap-sec is-in' }, [
      el('div', { class: 'card', text: saved ? '作品已保存至藏刀阁' : '开始锻造你的第一把刀' }),
    ])]);
    mount(actions, [
      saved ? el('button', { class: 'btn btn--primary', text: '查看收藏', onclick: () => import('./workshop.js').then(m => m.openTab('collection')) }) : null,
      el('button', { class: saved ? 'btn' : 'btn btn--primary', text: '回首页', onclick: () => router.go('home') }),
    ]);
    return;
  }

  /* 归档（鉴定后立刻写入长期进度）。
     ★ fresh 只在**第一次**归档时才有 —— 存回 record 上，二次进页仍能看到"
     这张图鉴是这局第一次点亮的"。 */
  if (!rec._archived) {
    const ar = Game.archive();
    if (!ar || ar.ok === false) {
      mount(body, el('div', { class: 'card', role: 'alert', text: '鉴定已完成，但保存失败。请重试保存后再离开本局。' }));
      mount(actions, el('button', { class: 'btn btn--primary', text: '重试保存', onclick: () => render() }));
      return;
    }
    rec._fresh = (ar && ar.fresh) || [];
    rec._reward = ar ? ar.reward : 0;
    rec._archived = true;
  }

  /* 色相单一出口：与锻造页的 --stage-color 同一套约定（JS 只改这一个变量）。
     光晕 / 标题染色 / 构成条 三处都读它。断刀没有稀有度，用危险色。 */
  document.documentElement.style.setProperty(
    '--ap-c', rec.fractured ? 'var(--risk-danger)' : `var(--rar-${rec.rarity || 'common'})`,
  );

  if (rec.fractured) renderFracture(rec);
  else renderReveal(rec);
}

/* ── 断刀分支（V2.1 §28）────────────────────────────────── */

function renderFracture(rec) {
  const f = rec.fractureInfo || {};
  const chance = Math.round((f.chance || 0) * 1000) / 10;
  mount(body, [
    sec('top', [
      el('div', { class: 'ap-head' }, [
        el('div', { class: 'ap-eyebrow', text: '锻造记录' }),
        el('h1', { class: 'ap-title' }, [el('span', { class: 'ap-flawed', text: '刀身断裂' }), el('span', { text: rec.bladeName || '未命名' })]),
        el('div', { class: 'ap-sub' }, [el('span', { class: 'chip', text: knifeTypeName(rec) }), el('span', { class: 'muted tiny', text: `${stageLabel(f.stageId)} ${f.stageName || ''}` })]),
      ]),
      el('div', { class: 'ap-stats ap-stats--fracture' }, [
        stat(0, '断裂阶段', value(stageLabel(f.stageId))),
        stat(1, '当时风险', riskValue(f.risk)),
        stat(2, '峰值风险', value(String(Math.round(f.peakRisk || 0)))),
        stat(3, '断裂概率', value(`${chance}%`)),
      ]),
    ]),
    tabs([['overview', '断裂记录'], ['craft', '工艺与发现']]),
    el('div', { class: 'ap-panels' }, [
      panel('overview', [
        freshSection(rec),
        sec('fracture', [
          el('div', { class: 'section-title', text: '本局断裂记录' }),
          el('div', { class: 'card' }, [
            reportLine('断裂阶段', `${stageLabel(f.stageId)} ${f.stageName || ''}`),
            reportLine('当时风险', String(Math.round(f.risk || 0))),
            reportLine('峰值风险', String(Math.round(f.peakRisk || 0))),
            reportLine('断裂概率', `${chance}%`),
            reportLine('归档状态', '已写入断刀册与图鉴'),
            reportLine('获得奖励', `+${rec._reward || 0} CR`),
          ]),
          el('div', { class: 'muted tiny', text: '断刀不会生成成刀评分或参赛资格；本局经历、工艺与发现仍会归档。' }),
        ]),
      ]),
      panel('craft', [craftSection(rec), fractureTraitsSection(rec)]),
    ]),
  ]);
  bindTabs(body);
  mount(actions, [el('button', { class: 'btn', text: '断刀册', onclick: () => router.go('workshop') }), reforgeButton()]);
}

/* ── 正常揭晓 ─────────────────────────────────────────── */

function renderReveal(rec) {
  const steps = Core.appraise.revealSteps(rec);
  const d = rec.scoreDetail || {};
  /* ★ 分数初始显示占位符：它必须**最后**才揭晓（T13.3），不能在六维和特性之前先亮出来。 */
  scoreEl = el('div', { class: 'ap-stat-v is-score', text: '—' });
  const riskBand = Core.risk.band(rec.riskPeak);
  const edgeView = edgeResultView(rec.edge);
  mount(body, [
    sec('top', [
      el('div', { class: 'ap-head' }, [
        el('div', { class: 'ap-eyebrow', text: '作品鉴定' }),
        el('h1', { class: 'ap-title' }, [qualitySeal(rec.rarity, rec.rarityName), el('span', { text: rec.bladeName || '未命名' })]),
        el('div', { class: 'ap-sub' }, [
          el('span', { class: 'chip', text: `品质 ${rec.qualityName}` }),
          el('span', { class: 'chip', text: knifeTypeName(rec) }),
          rec.rarityRaisedByFloor ? el('span', { class: 'chip chip--accent', text: '稀有度底线提升' }) : null,
          rec._reward ? el('span', { class: 'muted tiny', text: `+${rec._reward} CR` }) : null,
        ]),
      ]),
      /* 顶部只放“这是什么”与归位指标；**总分不在这里先揭晓** */
      el('div', { class: 'ap-stats ap-stats--three' }, [
        stat(1, '峰值风险', riskValue(rec.riskPeak, riskBand)),
        stat(2, '永久特性', value(`${rec.traits.length} 条`)),
        stat(3, 'S7 贴合度', value(edgeView?.fitText || '未开刃', edgeView?.label || null)),
      ]),
    ]),
    /* ★★ rework T13.3：揭晓顺序按基线 2.4 ——
       成刀亮相 → 品质/稀有度 → 六维 → 特性/Combo → 倍率/最终分 → 收藏卡/档案。
       改造前六维与特性藏在**默认隐藏**的分页里，play() 的定时器把动画播给了不可见节点，
       正常停在概览页的玩家从未真正看完因果链。
       现在主链内容全部在概览页**可见**，分页只负责“更详细的资料”。 */
    sec('six', [
      el('div', { class: 'section-title', text: '六维表现' }),
      statRail(rec.stats, null, true),
    ]),
    sec('traits', [traitsSection(steps), craftSection(rec)]),
    sec('bd', [
      el('div', { class: 'section-title', text: '作品评分' }),
      el('div', { class: 'ap-bd' }, bdRows(d)),
      /* 总分**在此处**才揭晓，紧跟着它的来源 */
      el('div', { class: 'ap-final-score' }, [
        el('span', { class: 'muted tiny', text: '成刀评分' }),
        scoreEl,
      ]),
      el('details', { class: 'ap-details' }, [
        el('summary', { text: '计算公式与倍率来源' }),
        el('div', { class: 'ap-detail-content' }, [
          el('div', { class: 'ap-bd-note', text: `成刀评分 = 六维均值 × 基础特性倍率 × 特殊特性倍率 × 峰值风险倍率 = ${rec.score}（不设上限；条形表示各因子的评分贡献占比）` }),
          ...bdSrcRows(d),
        ]),
      ]),
    ]),
    sec('explain', [explainSection(steps)]),
    /* ★ rework T13.3 最后一步：收藏卡/档案。
       这里直接渲染**共用收藏卡**（卡面：刀具主视觉 + 名称/稀有度/评分 + 核心特性），
       玩家在鉴定页看到的卡，与入藏后在藏刀阁看到的是同一个组件、同一份数据。 */
    sec('archive', [el('div', { class: 'ap-archive-receipt', text: rec.canEnterArena ? '✓ 已收录藏刀阁' : '✓ 已保存鉴定记录' })]),
    freshSection(rec),

  ]);
  bindTabs(body);
  bindStatDetails(body);
  actions.classList.toggle('ap-actions--try', !!rec.canEnterArena);
  /* ★ T13.3：跳过按钮独立占一行，不挤占底部 4 个主操作的位置。
     跳过与完整播放的结果**完全相同**（只是不播动画）。 */
  mount(actions, [
    el('button', { class: 'btn ap-skip', text: '跳过揭晓', onclick: () => skipReveal(rec) }),
    rec.canEnterArena ? el('button', { class: 'btn btn--primary ap-try', text: '带刀试炼 →', onclick: () => import('./arena.js').then(m => m.openQuickChallenge(rec.id)) }) : null,
    reforgeButton(!rec.canEnterArena),
    el('button', { class: 'btn ap-more', 'aria-label': '作品操作', title: '作品操作', onclick: () => {
      let dialog;
      dialog = sheet({ title: rec.bladeName || '作品', body: el('div', { class: 'stack' }, [
        rec.canEnterArena ? el('button', { class: 'btn btn--primary', text: '正式赛事', onclick: () => { dialog.close(); import('./arena.js').then(m => m.openTournament(rec.id)); } }) : null,
        el('button', { class: 'btn', text: '查看收藏', onclick: () => { dialog.close(); import('./workshop.js').then(m => m.openTab('collection')); } }),
      ]) });
    } }, [icon('more')]),
  ]);
}

/**
 * 跳过揭晓：立即把所有步骤置为已完成并写入真实分数。
 * ★ 不改变任何归档数据 —— 与完整播放结果一致（T13.3）。
 */
function skipReveal(rec) {
  for (const t of timers) clearTimeout(t);
  timers = [];
  for (const n of root.querySelectorAll('.ap-sec')) n.classList.add('is-in');
  const seal = $('.qseal', root);
  if (seal) seal.classList.add('is-stamp');
  if (scoreEl) scoreEl.textContent = String(rec.fractured ? 0 : (rec.score || 0));
  finishReveal();
}

function reforgeButton(primary = true) {
  return el('button', {
    class: primary ? 'btn btn--primary' : 'btn', text: '再锻一把',
    onclick: async event => {
      const button = event.currentTarget;
      if (button.disabled) return;
      button.disabled = true; button.setAttribute('aria-busy', 'true');
      button.textContent = '准备工艺…';
      try {
        Game.startForge({ mode: 'normal' });
        await Game.prewarmCandidates();
        router.go('forge');
      } catch (error) {
        console.warn('[forge] GPU warmup', error);
        toast('工艺准备未完成，请重试', 'warn');
      } finally {
        button.disabled = false; button.removeAttribute('aria-busy'); button.textContent = '再锻一把';
      }
    },
  });
}

function tabs(items) {
  return el('div', { class: 'ap-tabs', role: 'tablist', 'aria-label': '鉴定详情' }, items.map(([id, label], i) => el('button', {
    class: 'ap-tab' + (i === 0 ? ' is-active' : ''), type: 'button', role: 'tab', id: `ap-tab-${id}`,
    'aria-controls': `ap-panel-${id}`, 'aria-selected': i === 0 ? 'true' : 'false', tabindex: i === 0 ? '0' : '-1',
    dataset: { tab: id }, text: label,
  })));
}

function panel(id, children) {
  return el('section', {
    class: 'ap-panel' + (id === 'overview' ? ' is-active' : ''), role: 'tabpanel', id: `ap-panel-${id}`,
    'aria-labelledby': `ap-tab-${id}`, tabindex: '0', hidden: id !== 'overview', dataset: { panel: id },
  }, children);
}

function bindTabs(scope) {
  const buttons = Array.from(scope.querySelectorAll('.ap-tab'));
  for (const button of buttons) {
    button.addEventListener('click', () => activateTab(scope, button.dataset.tab));
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const i = buttons.indexOf(button);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (i + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      buttons[next].focus();
      activateTab(scope, buttons[next].dataset.tab);
    });
  }
}

/**
 * 顶部指标的「看详情」快捷入口。
 * ★ rework T13.3：成刀评分已从顶部移出（改为在倍率之后揭晓），
 *   所以这里的索引必须同步：现在 `.ap-stats` 里只有
 *   [0]=峰值风险 [1]=永久特性 [2]=S7 开刃。
 *   改造后索引不改会把“峰值风险”绑成“评分”、把“S7 开刃”绑成“永久特性”。
 */
function bindStatDetails(scope) {
  const stats = scope.querySelectorAll('.ap-stats .ap-stat');
  const links = [];
  for (const [index, tab, label] of links) {
    const node = stats[index];
    if (!node) continue;
    node.setAttribute('role', 'button'); node.setAttribute('tabindex', '0');
    node.setAttribute('aria-label', label); node.setAttribute('aria-controls', `ap-panel-${tab}`);
    const open = () => activateTab(scope, tab);
    node.addEventListener('click', open);
    node.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(); }
    });
  }
}

function activateTab(scope, id) {
  for (const button of scope.querySelectorAll('.ap-tab')) {
    const active = button.dataset.tab === id;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
    button.tabIndex = active ? 0 : -1;
  }
  for (const pane of scope.querySelectorAll('.ap-panel')) {
    const active = pane.dataset.panel === id;
    pane.hidden = !active;
    pane.classList.toggle('is-active', active);
  }
  // Tab switching only changes visibility; it never restarts or cancels reveal timers.
}

function craftSection(rec) {
  const tags = Object.entries(rec.tags || {}).map(([id, count]) => `${tagName(id)} ×${count}`);
  const combos = (rec.combos || []).map(comboName);
  return el('details', { class: 'ap-details ap-craft' }, [
    el('summary', { text: '工艺与收藏记录' }),
    el('div', { class: 'ap-detail-content card' }, [
      reportLine('工艺标签', tags.join('、') || '无'),
      reportLine('隐藏组合', combos.join('、') || '无'),
      reportLine('走过阶段', `${(rec.completedStages || []).length} / 9`),
      rec.hammerTierName ? reportLine('锻打强化', rec.hammerTierName) : null,
      rec._archived ? reportLine('归档', '已保存至藏刀阁与图鉴') : null,
    ]),
  ]);
}

/** 新发现来自 progress.archive() / unlockCodex；此处完整列出，避免漏看图鉴首见。 */
const FRESH_RANK = { combo: 0, knife: 1, trait: 2, tag: 3, card: 4 };
const freshRank = (c) => (FRESH_RANK[c] === undefined ? 9 : FRESH_RANK[c]);

function freshSection(rec) {
  const all = (rec._fresh || []).filter((f) => f.category !== 'fracture');
  if (!all.length) return null;
  const sorted = all.slice().sort((a, b) => freshRank(a.category) - freshRank(b.category));
  const highlights = sorted.slice(0, 3).map((f, i) => setVar(el('div', { class: 'ap-discovery ap-stagger' }, [
    el('span', { class: 'ap-news-cat', text: CAT_CN[f.category] || '发现' }),
    el('b', { text: entryName(f) }),
  ]), '--i', i));
  return sec('news', [
    el('div', { class: 'ap-news-head' }, [
      el('div', { class: 'section-title', text: `新发现 ${all.length} 项` }),
      el('button', { class: 'ap-discovery-link', text: '查看全部 ›', onclick: () => sheet({
        title: `本局发现 · ${all.length} 项`,
        body: el('div', { class: 'ap-news' }, sorted.map((f) => el('span', { class: 'ap-news-item' }, [
          el('span', { class: 'ap-news-cat', text: CAT_CN[f.category] || '发现' }),
          el('span', { text: entryName(f) }),
        ]))),
      }) }),
    ]),
    el('div', { class: 'ap-discoveries' }, highlights),
    el('div', { class: 'ap-reward', text: `本次鉴定获得 +${rec._reward || 0} CR · 所有发现已归档` }),
  ]);
}

/* ── 评分构成 ─────────────────────────────────────────── */

/**
 * 四行构成条。
 *
 * ★ 尺度必须一致：评分是「六维均值 × 三个倍率」的**连乘**，直接画原始值没有共同
 *   纵轴（均值是 0–300 的量级、倍率是 1.0x）。这里取对数后求占比 ——
 *   log(score) = log(mean) + log(base) + log(special) + log(peak)，
 *   每一行就是该因子对评分的真实贡献份额，四行之和恒为 100%。
 */
function bdRows(d) {
  const mean = Math.max(1, Number(d.mean) || 0);
  const mv = [mean, Number(d.baseMult) || 1, Number(d.specialMult) || 1, Number(d.peakMult) || 1];
  const logs = mv.map((v) => Math.log(Math.max(1e-6, v)));
  const total = logs.reduce((a, b) => a + b, 0);
  const share = (v) => (total > 0 ? Math.max(0, Math.min(100, (v / total) * 100)) : 0);

  const rows = [
    ['六维均值', (Number(d.mean) || 0).toFixed(1), logs[0]],
    ['基础特性', `×${(Number(d.baseMult) || 1).toFixed(2)}`, logs[1]],
    ['特殊特性', `×${(Number(d.specialMult) || 1).toFixed(2)}`, logs[2]],
    ['峰值风险', `×${(Number(d.peakMult) || 1).toFixed(2)}`, logs[3]],
  ];

  return rows.map(([k, v, log], i) => {
    const track = el('div', { class: 'ap-bd-track' }, [el('i', {})]);
    setVar(track.firstChild, '--w', share(log).toFixed(1) + '%');
    setVar(track.firstChild, '--i', i);
    return el('div', { class: 'ap-bd-row' }, [
      el('div', { class: 'ap-bd-k', text: k }),
      track,
      el('div', { class: 'ap-bd-v', text: v }),
    ]);
  });
}

/** 倍率的**逐项来源**：基础标签档位 + 特殊特性 + 隐藏组合（这是"为什么是这个分"） */
function bdSrcRows(d) {
  const rows = [];
  for (const p of ((d.breakdown || {}).base || [])) {
    rows.push([`${tagName(p.tagId)} ${p.layers}层`, `×${p.mult}`]);
  }
  for (const p of ((d.breakdown || {}).special || [])) {
    rows.push([p.name, `×${p.mult}`]);
  }
  if (!rows.length) return [];
  return [el('div', { class: 'ap-bd-src' }, rows.map(([k, v]) => el('div', { class: 'ap-bd-src-row' }, [
    el('span', { class: 'ap-bd-src-k', text: k }),
    el('span', { class: 'grow', text: '' }),
    el('b', { text: v }),
  ])))];
}

/* ── 特性 / 解释 ───────────────────────────────────────── */

// 断刀没有成刀评分明细；只读取已归档的特性分组，不进入成刀揭晓/评分解释。
function fractureTraitsSection(rec) {
  const groups = { base: [], special: [], hammer: [], combo: [], legacy: [] };
  const sourceGroup = { baseTag: 'base', specialTag: 'special', hammer: 'hammer', combo: 'combo' };
  for (const id of rec.traits || []) {
    const kind = sourceGroup[rec.traitSources?.[id]] || 'legacy';
    groups[kind].push(id);
  }
  return traitsSection([{ key: 'traits', groups }]);
}

function traitsSection(steps) {
  const step = steps.find((s) => s.key === 'traits');
  const groups = (step && step.groups) || {};
  const nodes = [];
  for (const [kind, ids] of Object.entries(groups)) {
    if (!ids || !ids.length) continue;
    nodes.push(el('div', { class: 'section-title', text: groupName(kind) }));
    for (const id of ids) {
      const t = getTrait(id);
      nodes.push(traitItem(t || { id, name: id, desc: '' }, kind));
    }
  }
  if (!nodes.length) nodes.push(el('div', { class: 'muted tiny', text: '本局没有形成永久特性。' }));
  return sec('traits', nodes);
}

function explainSection(steps) {
  const step = steps.find((s) => s.key === 'explain');
  const lines = (step && step.lines) || [];
  return sec('explain', [el('details', { class: 'ap-details' }, [
    el('summary', { text: '结果说明' }),
    el('div', { class: 'ap-detail-content card' }, lines.map((l) => el('div', { class: 'report-line', text: l }))),
  ])]);
}

/* ── 逐格播放（V2.1 §14.1 的顺序即播放顺序）─────────────── */

export function enter() {
  const rec = Game.record;
  if (!rec || !root) return;

  const epoch = ++entryEpoch;
  const reduce = motion.reduced();
  const stage = getStage();

  /* ★ 先把成品刀搬上舞台，再推相机。
     原项目当初的 bug 正是把顺序写反（先 router.go('forgeout') 再 switchModel()）——
     模型没上来时 fitDistance 还没算出来，setViewPreset 会直接返回 false，
     于是"揭晓页相机不动 + 画面停在上一把刀"。
     这里还有第二重保险：门面新增 settle() 等模型落地后再推位。 */
  if (host && stage.attachTo) {
    stage.attachTo(host);
    stage.resize();
  }
  stage.autoRotate(false);
  Game.showRecord(rec);

  const boot = async () => {
    const s = getStage();
    if (s.settle) { try { await s.settle(); } catch (_) { /* 门面已静默兜底 */ } }
    if (epoch !== entryEpoch) return;
    if (s.view) s.view('forge', { duration: 0 });
    if (s.autoRotate) s.autoRotate(false);
    if (s.resize) s.resize();
  };
  boot();

  play(reduce, rec);
}

/** 离开页面：停自转（否则锻造页的舞台会一直转，白烧 GPU）并清掉未播完的定时器 */
export function leave() {
  ++entryEpoch;
  for (const t of timers) clearTimeout(t);
  timers = [];
  const s = getStage();
  if (s && s.autoRotate) s.autoRotate(false);
}

function play(reduce, rec) {
  for (const t of timers) clearTimeout(t);
  timers = [];
  const get = (step) => $(`.ap-sec[data-step="${step}"]`, root);
  const all = Array.from(root.querySelectorAll('.ap-sec'));
  const seal = $('.qseal', root);
  const target = rec.fractured ? 0 : (rec.score || 0);
  if (reduce) {
    for (const n of all) n.classList.add('is-in');
    if (scoreEl) scoreEl.textContent = String(target);
    finishReveal();
    return;
  }
  const at = (ms, fn) => { timers.push(setTimeout(fn, ms)); };
  /* ★★ rework T13.3：顺序按基线 2.4，且**总分在六维与特性之后**才揭晓。
     改造前的顺序是：top → 分数累加(600) → 六维(760) → 特性(940)，
     等于先给总分、再补来源，正是任务书明确禁止的形态。 */
  at(120, () => { const n = get('top'); if (n) n.classList.add('is-in'); });
  at(520, () => { if (seal) seal.classList.add('is-stamp'); });
  at(660, () => { const n = get('six'); if (n) n.classList.add('is-in'); });
  at(1000, () => { const n = get('traits'); if (n) n.classList.add('is-in'); });
  at(1340, () => { const n = get('bd'); if (n) n.classList.add('is-in'); });
  /* 总分：紧跟在倍率构成之后，玩家能看到“为什么是这个分” */
  at(1560, () => { if (scoreEl) countUp(scoreEl, 0, target, 900); });
  at(2240, () => { const n = get('explain'); if (n) n.classList.add('is-in'); });
  at(2400, () => { const n = get('news'); if (n) n.classList.add('is-in'); });
  at(2560, () => { const n = get('archive'); if (n) n.classList.add('is-in'); finishReveal(); });
}

/** After the sequence, the real score becomes the work's permanent summary. */
function finishReveal() {
  $('.ap-skip', root)?.remove();
  const score = $('.ap-final-score', root);
  const heading = $('.ap-sec[data-step="top"]', root);
  if (score && heading && score.parentElement !== heading) heading.appendChild(score);
}

/* ── 小工具 ───────────────────────────────────────────── */

function sec(step, children) {
  return el('div', { class: 'ap-sec', dataset: { step } }, children);
}

/**
 * 四格中的一格。
 * ⚠ 错开用的 --i 必须走 setProperty：el() 的 style 走 Object.assign，
 *   自定义属性（--x）在部分实现里不会被当成 CSS 变量写进去。
 */
function stat(i, key, valueNode) {
  return setVar(el('div', { class: 'ap-stat ap-stagger' }, [
    el('div', { class: 'ap-stat-k', text: key }),
    valueNode,
  ]), '--i', i);
}

function setVar(node, name, value) {
  node.style.setProperty(name, String(value));
  return node;
}

function value(text, title = null) {
  return el('div', { class: 'ap-stat-v', text, title: title || undefined });
}

/** 风险值：**颜色 + ▲ 双编码**（与 components.js 的 MARK / core/risk.band 同源） */
const TONE_ALIAS = { safe: 'safe', warn: 'warn', danger: 'danger', risk: 'danger' };
const MARK = { safe: '▲', warn: '▲▲', danger: '▲▲▲' };

function riskValue(risk, band = null) {
  const b = band || Core.risk.band(risk);
  const tone = TONE_ALIAS[b && b.tone] || 'safe';
  return el('div', {
    class: 'ap-stat-v is-risk-' + tone,
    /* ★ rework T14：玩家可见文案不得出现内部规范号（原为「按 §9.3 锚点插值」）。 */
    title: `${b ? b.name : ''} · 峰值 ${Math.round(risk || 0)}（越高越容易断裂，数值越高倍率越大）`,
  }, [
    el('span', { class: 'ap-stat-mark', text: MARK[tone] }),
    el('span', { text: String(Math.round(risk || 0)) }),
  ]);
}

/**
 * 断裂阶段号的唯一格式出口。
 * `fractureInfo.stageId` 来自 STAGES，本来就是 `'S4'` 形式；旧档/外部记录可能只存 `'4'`
 * 或空值 —— 直接拼 `S${stageId}` 会渲成「SS4」。这里统一成 `S4` / `?`。
 */
function stageLabel(id) {
  if (id == null || id === '') return '?';
  const s = String(id).trim();
  return /^s/i.test(s) ? s.toUpperCase() : `S${s}`;
}

function reportLine(k, v) {
  return el('div', { class: 'report-line' }, [
    el('span', { class: 'dim', text: `${k}：` }),
    el('span', { text: v }),
  ]);
}

const CAT_CN = { knife: '刀型', trait: '特性', combo: '隐藏组合', tag: '工艺标签', card: '决策卡', fracture: '断刀' };

function knifeTypeName(rec) {
  const t = KNIFE_BY_ID[rec.knifeTypeId];
  if (t && t.name) return t.name;
  /* ★ fix：旧档可能只存了模型 id（如 `knife_folding`），直接显示会出英文槽位名。 */
  return nameOfModel(rec.knifeType) || '未知刀型';
}

function comboName(id) {
  const c = getCombo(id);
  return (c && c.name) || id;
}

/** 图鉴条目的展示名（按分类查表；查不到就退回 id，绝不显示空白） */
function entryName(f) {
  if (f.category === 'knife') return knifeTypeName({ knifeTypeId: f.id });
  if (f.category === 'trait') { const t = getTrait(f.id); return (t && t.name) || f.id; }
  if (f.category === 'combo') return comboName(f.id);
  if (f.category === 'tag') return tagName(f.id);
  if (f.category === 'card') { const c = getCard(f.id); return (c && c.name) || f.id; }
  return f.id;
}

function groupName(kind) {
  return {
    base: '基础标签特性', special: '特殊标签特性',
    hammer: 'S4 锻打特性', combo: '隐藏 Combo 特性', legacy: '工艺特性',
  }[kind] || '特性';
}

export default { create, render, enter, leave };
