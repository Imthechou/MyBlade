/**
 * 表现层 · 锻造页（S1–S9 选择 + S4 锻打 + S7 刃线 → S10 鉴定）
 *
 * 本页**不含**任何规则判断：所有判定都在 core/forge.js，
 * 这里只是把 Game 的状态渲染出来，并把点击转发给 Game。
 */

import { el, $, clear, mount, toast, sheet } from '../dom.js';
import { riskBar, statGrid, decisionCard, traitItem, rarityBadge } from '../components.js';
import { icon } from '../icons.js';
import { cardDoodle, doodleSpec } from '../cardDoodles.js';
import { STAGES } from '../../data/stages.js';
import { HAMMER_TIERS } from '../../data/balance.js';
import { tagName, BASE_TAGS, SPECIAL_TAGS } from '../../data/tags.js';
import { CUT_TRAIT_STYLES } from '../../core/forgeTraitCuts.js';
import { getTrait } from '../../data/traits.js';
import * as Hammer from '../../core/hammer.js';
import * as Tags from '../../core/tags.js';
import * as Edge from '../../core/edge.js';
import { nextRerollCost, previewPick } from '../../core/cards.js';
import { breakChance, band as riskBandOf } from '../../core/risk.js';
import Game from '../../app/game.js';
import router from '../router.js';
import { getStage } from '../../render/index.js';
import { env } from '../../platform/env.js';
import { createStageInspect } from '../stageControls.js';
import { renderHammerV4, renderEdgeV4 } from '../minigameV4.js';

let root = null;
let pickedCard = null;
let disposeInteraction = null;
/* 锻造页也带鉴赏图标（用户要求「锻刀阶段也要有」）。
   S4 锻打阶段热区铺满舞台，拖动会与挥锤打架 → 该阶段禁止开启。 */
let inspectCtl = null;
/* 上一阶段索引：用来判断“刚刚真的换阶段了”。
   ★ 为什么需要：S1–S9 里玩家点卡就是**预览**（3D 已经变成选完的样子），
   再点「确认」进入下一阶段时，画面几乎不变 —— 于是换阶段没有感知。
   有了这个值，就能在“阶段号变了”的那一刻给一次明确过渡。 */
let lastStageIndex = -1;
/* 阶段过渡 class 的清除定时器（避免连续推进时多次计时互相覆盖） */
let stageAdvanceTimer = 0;

/* Current GPU policy: home/daily/restart paths wait for the first candidate
 * prewarm before entering the forge. Within a run, later candidate pools are
 * queued asynchronously. Avoid reintroducing an additional forge-page delay:
 * the entry already owns that readiness check. */

export function create() {
  disposeInteraction?.();
  disposeInteraction = null;
  root = $('.page[data-page="forge"]');
  clear(root);
  inspectCtl = createStageInspect({
    canDrag: () => Game.run?.phase !== 'hammer',
    blockReason: '锻打阶段请先结束锻打，再拖动查看',
  });
  const stage = el('div', { class: 'stage', id: 'forgeStage' });
  stage.appendChild(inspectCtl.bar);
  root.appendChild(stage);
  root.appendChild(el('div', { class: 'forge-body', id: 'forgeBody' }));
}

export function render() {
  disposeInteraction?.();
  disposeInteraction = null;
  const run = Game.run;
  const body = $('#forgeBody', root);
  // 每次重绘先移除旧热区，防止阶段推进/重新进入后残留挥锤接线。
  $('#forgeStage .hammer-stage-hit', root)?.remove();
  $('#forgeStage .edge-stage-canvas', root)?.remove();
  root.classList.toggle('is-hammer', run?.phase === 'hammer');
  // 无进行中的锻造不再显示“唐刀 + 开始锻刀”的假空态。
  // 路由 canEnter 守卫会在深链刷新时直接转回首页。
  if (!run) return;
  const snap = Game.run; // 直接用 run，避免快照与可变状态不一致
  renderStageHead(run);
  /* ★ 锻造页的鉴赏图标：S4 锻打阶段直接禁用拖动开关（热区铺满舞台，
     拖动会与挥锤打架）；其余阶段允许开拖动。 */
  const hammering = run.phase === 'hammer' || run.phase === 'edge';
  root.classList.toggle('is-no-drag', hammering);
  inspectCtl?.setBlocked?.(hammering);
  pickedCard = null;
  $('#forgeStage', root)?.classList.remove('is-previewing');
  $('#forgeStage .stage-preview', root)?.remove();
  body.innerHTML = '';

  if (run.phase === 'appraise' || run.phase === 'fractured') {
    router.go('appraise');
    return;
  }
  /* ★ 2026-10-15 修复：进入锻造页时必须把舞台交给**本局**。
     旧实现不调它 —— 于是「首页 → 继续锻刀」这条路（home 的 CTA 在
     canResume 时只 router.go，不重开一局）会把首页那把（半透明幽灵）刀
     一路带到锻造页，玩家看到的是"我的刀变成了别人的刀"。
     syncStage 同时会关掉幽灵态。 */
  Game.syncStage();

  /* 锻打 / 刃线：内容量不定，用自适应内衬 */
  if (run.phase !== 'select') $('#forgeStage .stage-readiness', root)?.remove();
  if (run.phase === 'hammer') return renderHammer(padFor(body), run);
  if (run.phase === 'edge') return renderEdge(padFor(body), run);
  renderSelect(body, run);
}

/** 给"内容量不确定"的面板套一层自适应内衬（不参与三条比例带的预算） */
function padFor(body) {
  const w = el('div', { class: 'forge-pad' });
  body.appendChild(w);
  return w;
}

/**
 * 舞台上缘浮层：左侧阶段徽标 + 右侧构筑进度 chip。
 *
 * ★ 2026-10-15（用户：「我希望锻造页都是一屏」）——
 *   题面原来是 `.forge-body` 里的一个**独立块，实吃 47px**；而一屏的纵向预算
 *   总共只有 819px，这一块就吃掉 5.7%。
 *   原项目把它放在**阶段徽章同一行下方**（`.stage-chipbar` 的 `.sc-desc`），
 *   原文：「四段式布局里纵向空间极紧，阶段信息不该占一整行 ——
 *   压缩成舞台左上角一枚徽章…信息量不减，纵向只占 ~34px」。
 *   照搬：chipbar 绝对定位在舞台上缘，**纵向布局成本 = 0**。
 */
function renderStageHead(run) {
  const stage = $('#forgeStage', root);
  if (!run || !stage) return;
  const total = STAGES.length;          // 10 段（S1..S10）
  const idx = run.stageIndex;
  const def = STAGES[idx] || {};

  /* ★ 阶段切换反馈：只有**阶段号真的变了**才播一次过渡。
     玩家在 S1–S9 点卡时 3D 已经是“选完的样子”（预览），
     再点确认就会觉得“什么都没发生”—— 这里给一次明确的阶段推进回执。 */
  const stageChanged = lastStageIndex !== -1 && idx !== lastStageIndex && idx > lastStageIndex;
  lastStageIndex = idx;

  /* ★ 阶段色：JS **只改这一个变量**（写在 documentElement 上，
     这样 body::before 的舞台底染、PC 两侧纯色块也一起跟着换）。
     进度点 / 徽章 / 底染全部读 --stage-color 的派生量（--stage-wash/-line/-tint）。 */
  document.documentElement.style.setProperty('--stage-color', `var(--stage-${idx + 1})`);

  let bar = $('.stage-chipbar', stage);
  if (!bar) {
    bar = el('div', { class: 'stage-chipbar' });
    stage.appendChild(bar);
  }

  let badge = $('.stage-badge', bar);
  if (!badge) {
    badge = el('div', { class: 'chip chip--stage stage-badge' });
    bar.appendChild(badge);
  }
  badge.innerHTML = '';
  badge.appendChild(el('b', { text: String(idx + 1).padStart(2, '0') }));
  badge.appendChild(el('span', { text: def.name || '' }));
  // 左上角仅留阶段序号与名称；底部图形进度条承担进度说明。
  $('.stage-question', bar)?.remove();

  /* 编号式 10 段进度条：浮在舞台下缘。
     done 用阶段色淡底、active 用阶段色实心 —— 让玩家看见"走到第几段"。 */
  let prog = $('.stage-progress', stage);
  if (!prog) {
    prog = el('div', { class: 'stage-progress' });
    stage.appendChild(prog);
  }
  prog.innerHTML = '';
  for (let i = 0; i < total; i++) {
    const isDone = !!run.finished || i < idx;
    prog.appendChild(el('div', {
      // ★ 类名表达式写在 class: 里（不先存局部变量）——
      //   让 tools/audit-classes.mjs 能抽到 sp-dot / done / active 三个类名。
      class: 'sp-dot' + (isDone ? ' done' : (i === idx ? ' active' : '')),
      title: STAGES[i].name,
    }, [
      el('span', { class: 'sp-num', text: String(i + 1) }),
      el('span', { class: 'sp-title', text: STAGES[i].name }),
    ]));
    if (i < total - 1) prog.appendChild(el('div', { class: 'sp-line' }));
  }

  /* ★★ 阶段切换回执（解决“换阶段没感觉”）
   *
   * 问题：预览时 3D 就已变成“选完的样子”，所以点「确认」进下一阶段时，
   *      画面几乎不变 —— 玩家分不清“我在预览”和“我已经进入下一阶段了”。
   *
   * 做法：阶段号真的前进时，在舞台上给一次**明确的短暂过渡**：
   *      ① 徽标与题面重播入场（flash + 微位移）；
   *      ② 舞台中央浮出一行“第 N 阶段 · 名称”，1.4s 自动淡出；
   *      ③ 尊重减少动效设置：reduced 时不做位移/动画，只保留可读文字。
   * 全部是 CSS class + 一个短定时器，不碰 3D、不改玩法状态。 */
  if (stageChanged) {
    document.documentElement.classList.remove('stage-advance');
    void document.documentElement.offsetWidth;   // 强制回流，保证同阶段连续推进会重播
    document.documentElement.classList.add('stage-advance');
    window.clearTimeout(stageAdvanceTimer);
    stageAdvanceTimer = window.setTimeout(() => {
      document.documentElement.classList.remove('stage-advance');
    }, 1500);

    /* 中央浮层：给“我确实进入了下一阶段”一个可读回执 */
    stage.querySelector('.stage-advance-toast')?.remove();
    const flash = el('div', { class: 'stage-advance-toast', role: 'status', 'aria-live': 'polite' }, [
      el('b', { text: `第 ${idx + 1} 阶段` }),
      el('span', { text: def.name || '' }),
    ]);
    stage.appendChild(flash);
    window.setTimeout(() => flash.remove(), 1400);
  }
}

/**
 * 「构筑进度」也做成舞台上缘的一枚 chip（原来是 body 里一个实吃高度的块）。
 * 点击展开抽屉看明细 —— 信息一点没少，只是从"常驻占位"变成"按需展开"。
 * ★ 为什么必须有这一手：标签层数到门槛时最多会同时出现好几条，每条两行 ≈ 50px；
 *   放进一屏预算里就是"要么挤掉 3D，要么挤掉卡区"，两者都是错的。
 */
function renderStageTraits(run, previewCard = null) {
  const stage = $('#forgeStage', root);
  const bar = stage && $('.stage-chipbar', stage);
  if (!bar) return;
  let chip = $('.stage-traits', bar);
  if (!chip) {
    chip = el('button', { class: 'chip stage-traits', type: 'button' });
    bar.appendChild(chip);
  }
  const counts = Tags.counts(run.ledger);
  const projected = { ...counts };
  if (previewCard) for (const tag of new Set(previewCard.tags || [])) projected[tag] = (projected[tag] || 0) + 1;
  const sorted = BASE_TAGS.map(tag => ({
    id: tag.id, name: tag.name, before: counts[tag.id] || 0,
    after: projected[tag.id] || 0, style: CUT_TRAIT_STYLES[tag.id],
  })).filter(t => t.after || t.before)
    .sort((a, b) => b.after - a.after || (b.after - b.before) - (a.after - a.before));
  const main = sorted[0] || null;
  const upcoming = main ? nextNeed(main.after) : 2;
  chip.textContent = main ? `构筑 · ${main.name} ${main.after}/6` : '构筑 · 选择路线';
  chip.classList.toggle('has-build', !!main);
  chip.onclick = () => {
    const nodes = sorted.map(t => {
      const currentTier = t.after >= 6 ? 'Ⅲ 高阶' : t.after >= 4 ? 'Ⅱ 强化' : t.after >= 2 ? 'Ⅰ 基础' : '尚未激活';
      const isLevelUp = [2, 4, 6].includes(t.after) && t.after > t.before;
      const dots = el('div', { class: 'build-track' }, Array.from({ length: 6 }, (_, i) => el('i', {
        class: i < t.before ? 'is-owned' : i < t.after ? 'is-preview' : '',
      })));
      return el('div', { class: 'build-entry' + (isLevelUp ? ' is-rising' : '') }, [
        el('div', { class: 'build-entry-head' }, [
          el('b', { text: t.name }),
          el('span', { text: `${t.before}${t.after !== t.before ? ' → ' + t.after : ''} / 6 · ${currentTier}` }),
        ]),
        dots,
        el('div', { class: 'build-effect', text: `${t.style?.name || '工艺专精'} · ${t.style?.text || ''}` }),
      ]);
    });
    const special = SPECIAL_TAGS.filter(tag => projected[tag.id] > 0).map(tag =>
      el('div', { class: 'build-earned', text: `${tag.name} · 已获得稀有工艺` }));
    const earned = [...new Set(run.traits || [])].map(id => getTrait(id))
      .filter(Boolean).slice(0, 12).map(t =>
        el('div', { class: 'build-earned', text: `${t.name} · ${t.desc || '已激活'}` }));
    sheet({
      title: '工艺构筑',
      body: el('div', { class: 'build-sheet' }, [
        el('div', { class: 'muted tiny', text: '累积相同工艺标签达到 2 / 4 / 6 层可强化特性。点卡仅预览，确认后才会累积。特性将影响最终属性与赛事切割。' }),
        ...(nodes.length ? nodes : [el('div', { class: 'build-entry', text: '尚未形成路线：尝试连续选择同一种工艺标签。' })]),
        ...(special.length ? [el('div', { class: 'section-title', text: '特殊工艺' }), ...special] : []),
        ...(earned.length ? [el('div', { class: 'section-title', text: '已获得特性' }), ...earned] : []),
      ]),
    });
  };
}

/* ── 选卡阶段 ─────────────────────────────────────────── */

function renderSelect(body, run) {
  /* ★ 2026-10-15：题面已移到**舞台上缘浮层**（见 renderStageHead）。
     它原来是这里的第一块（实吃 47px），而一屏纵向预算只有 819px。 */

  /* 带①：风险 + 六维 合一带（高度 == --stat-h）。
     两个 node 挂在同一个 rail 容器里，refresh() 各挂各的、互不干扰。 */
  const railNode = el('div', { class: 'forge-rail' });
  const riskNode = el('div', {});
  const statsNode = el('div', {});
  railNode.appendChild(riskNode);
  railNode.appendChild(statsNode);
  body.appendChild(railNode);

  const cardsRow = el('div', { class: 'cards' });
  body.appendChild(cardsRow);

  const actions = el('div', { class: 'actions' });
  body.appendChild(actions);

  // Keep cards and actions alive while selecting. Replacing all three cards on
  // every tap discarded keyboard focus and restarted the tactile transition.
  let mountedCards = '';
  let readinessKey = '';
  const rerollButton = el('button', { class: 'btn forge-reroll', onclick: () => {
    const r = Game.reroll();
    if (!r || !r.ok) { toast((r && r.reason) || '无法重铸', 'warn'); return; }
    toast(r.cost === 0 ? '本阶段首次重铸免费' : `已重铸，花费 ${r.cost} CR`);
    pickedCard = null;
    Game.clearPreview();
    refresh();
  } });
  const confirmButton = el('button', { class: 'btn btn--primary', onclick: () => {
    if (!pickedCard || confirmButton.disabled) return;
    confirmButton.disabled = true;
    const r = Game.confirmCard(pickedCard);
    if (!r || !r.ok) { confirmButton.disabled = false; toast((r && r.reason) || '无法提交', 'warn'); return; }
    pickedCard = null;
    render();
  } });
  actions.append(rerollButton, confirmButton);
  const selectionStatus = el('div', { class: 'forge-selection-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  actions.before(selectionStatus);

  function refresh() {
    // 风险：档位与概率都取自 core/risk（唯一真源，禁止 UI 自己重算）
    const projected = pickedCard ? previewPick(Game.run, pickedCard) : null;
    const riskNow = projected ? projected.riskAfter : Game.run.risk.current;
    const band = riskBandOf(riskNow);
    mount(riskNode, riskBar({
      current: riskNow,
      priorCurrent: projected ? Game.run.risk.current : null,
      peak: Math.max(Game.run.risk.peak, riskNow),
      chance: projected ? projected.breakChanceAfter : breakChance(riskNow, Game.run.daily?.breakScale || 1),
      band,
    }));
    // 选中后即时显示准确的六维增量/目标值，非选中保持紧凑趋势。
    mount(statsNode, statGrid(projected?.stats || Game.run.stats, pickedCard?.directions || null,
      !!projected, projected ? { before: Game.run.stats, delta: pickedCard.statDelta } : null));
    // 卡（选中时另两张降权，把注意力收到选中那张）
    cardsRow.classList.toggle('is-picking', !!pickedCard);
    const previewStage = $('#forgeStage', root);
    previewStage?.classList.toggle('is-previewing', !!pickedCard);
    let preview = previewStage?.querySelector('.stage-preview');
    if (previewStage && !preview) {
      preview = el('div', { class: 'stage-preview', role: 'status', 'aria-live': 'polite' });
      previewStage.appendChild(preview);
    }
    if (preview) { preview.hidden = !pickedCard; preview.textContent = pickedCard ? `${pickedCard.name} · 预览` : ''; }
    const cardKey = Game.run.candidates.map(c => c.id).join(',');
    if (mountedCards !== cardKey) {
      mountedCards = cardKey;
      /* ★ rework T14：把本局当前的标签层数交给卡面，
         让每张卡直接写出“会把哪个标签补到哪一档”。
         层数来自账本（唯一真源），不在 UI 自己累计。 */
      const tagCounts = Tags.counts(Game.run.ledger);
      mount(cardsRow, Game.run.candidates.map(c => decisionCard(c, {
        tagCounts,
        onPick: card => {
          if (pickedCard?.id === card.id) { pickedCard = null; Game.clearPreview(); }
          else { pickedCard = card; Game.previewCard(card); }
          refresh();
        },
        onDetail: card => showDetail(card),
      })));
    }
    for (const node of cardsRow.children) {
      const selected = node.dataset.cardId === pickedCard?.id;
      node.classList.toggle('is-picked', selected);
      node.setAttribute('aria-pressed', String(selected));
    }
    rerollButton.setAttribute('aria-label', `重铸 ${rerollCostText()}`);
    rerollButton.replaceChildren(icon('refresh'), el('span',{text:rerollCostText()}));
    confirmButton.textContent = pickedCard ? '确认工艺 →' : '选择工艺卡';
    confirmButton.disabled = !pickedCard;
    selectionStatus.classList.toggle('has-selection', !!pickedCard);
    selectionStatus.textContent = pickedCard
      ? `预览：${pickedCard.name} · 尚未生效，确认后写入`
      : '';
    // 从首张卡开始常驻可见；选卡时构筑进度与六维一起预览。
    renderStageTraits(Game.run, pickedCard);

    // 后续阶段准备不再静默：只展示真实任务状态，不遮模型、不用计时器假装完成。
    const stageHost = $('#forgeStage', root);
    let status = stageHost?.querySelector('.stage-readiness');
    if (stageHost && !status) {
      status = el('div', { class: 'stage-readiness', role: 'status', 'aria-live': 'polite' });
      stageHost.appendChild(status);
    }
    const owner = Game.run;
    const key = owner.stageId + ':' + owner.candidates.map(c => c.id).join(',');
    if (readinessKey === key) return;
    readinessKey = key;
    const task = Game.prewarmCandidates();
    const current = () => status?.isConnected && Game.run === owner
      && owner.phase === 'select'
      && key === owner.stageId + ':' + owner.candidates.map(c => c.id).join(',');
    if (status) {
      status.classList.toggle('is-ready', !task);
      status.textContent = task ? '工艺资源准备中…' : '';
    }
    if (task) Promise.resolve(task).then(result => {
      if (!current()) return;
      status.classList.toggle('is-ready', !!result?.ok);
      status.textContent = result?.ok ? '' : candidatePreparationFailureText();
    }).catch(() => {
      if (current()) { status.classList.remove('is-ready'); status.textContent = candidatePreparationFailureText(); }
    });
  }

  refresh();
}

/**
 * 供 bootstrap 在切页后调用：把鉴赏按钮对齐到画布真实状态。
 *
 * ★ 必需：锻造页自己不调 `attachTo`（由 bootstrap 的 onNavigate 接管），
 *   所以必须在挂载后回读一次，否则会出现“按钮亮着、实际拖不动”。
 */
export function syncInspect() {
  inspectCtl?.syncFromStage?.();
}

function candidatePreparationFailureText() {
  const stage = getStage();
  // 仅明确无 WebGL 且没有创建 3D 舞台时说明 2D 降级；未 ready 不等于无 WebGL。
  const in2DMode = env.hasWebGL === false && stage?.ready === false
    && stage.engine === null && stage.viewer === null;
  return in2DMode ? '当前以 2D 模式运行，选卡与锻造可继续' : '工艺资源未齐 · 选择卡牌可重试';
}

function nextNeed(layers) { return layers < 2 ? 2 : (layers < 4 ? 4 : 6); }

function rerollCostText() {
  const cost = Game.run ? nextRerollCost(Game.run) : 0;
  return cost === 0 ? '免费' : `${cost} CR`;
}

function previewChance() {
  const run = Game.run;
  if (!run) return 0;
  const base = run.risk.current + (pickedCard ? (pickedCard.riskDeltaPoints || 0) : 0);
  return breakChance(base, run.daily?.breakScale || 1);
}

function showDetail(card) {
  const art = doodleSpec(card);
  const stats = ['strength', 'toughness', 'sharpness', 'craft', 'design', 'spirit'];
  const statNodes = stats.map(key => {
    const direction = card.directions?.[key];
    const dirKey = direction?.key || 'flat';
    const type = dirKey.startsWith('up') ? 'is-positive' : dirKey.startsWith('down') ? 'is-negative' : 'is-neutral';
    const symbol = type === 'is-positive' ? '↗' : type === 'is-negative' ? '↘' : '—';
    return el('div', { class: 'forge-detail-stat ' + type }, [
      el('span', { class: 'forge-detail-stat-name', text: statCn(key) }),
      el('span', { class: 'forge-detail-stat-value', text: symbol + ' ' + (direction?.label || '基本保持') }),
    ]);
  });
  const tags = [...new Set(card.tags || [])].map(tag =>
    el('span', { class: 'forge-detail-tag', text: tagName(tag) }));
  const risk = Number(card.riskDeltaPoints) || 0;
  const body = el('div', { class: 'forge-card-detail' }, [
    el('div', { class: 'forge-detail-art', style: `--dcard-art-tint:${art.palette.field};--dcard-color:${art.palette.main};` }, [
      cardDoodle(card),
    ]),
    el('div', { class: 'forge-detail-identity' }, [
      rarityBadge(card.rarity, card.rarityCn),
      el('span', { class: 'forge-detail-role', text: card.role || '工艺抉择' }),
      el('span', { class: 'forge-detail-stage', text: card.stage + ' · ' + art.colorName + ' / ' + art.motionName }),
    ]),
    card.copy ? el('p', { class: 'forge-detail-description', text: card.copy }) : null,
    el('div', { class: 'forge-detail-section' }, [
      el('div', { class: 'forge-detail-section-head' }, [
        el('strong', { text: '六维倾向' }),
        el('span', { text: '实际增量见选中预览' }),
      ]),
      el('div', { class: 'forge-detail-stats' }, statNodes),
    ]),
    el('div', { class: 'forge-detail-section' }, [
      el('div', { class: 'forge-detail-section-head' }, [
        el('strong', { text: '工艺构筑' }),
        el('span', { text: '累积标签强化赛事能力' }),
      ]),
      el('div', { class: 'forge-detail-tags' }, tags.length ? tags :
        [el('span', { class: 'forge-detail-empty', text: '独立工艺 · 无标签' })]),
    ]),
    el('div', { class: 'forge-detail-summary' }, [
      el('div', { class: 'forge-detail-metric' }, [
        el('span', { text: '风险变化' }),
        el('strong', { class: risk > 0 ? 'is-risky' : 'is-safe',
          text: (risk > 0 ? '+' : '') + risk + ' 点' }),
      ]),
      card.visual?.targetDescription ? el('div', { class: 'forge-detail-result' }, [
        el('span', { text: '视觉效果' }),
        el('p', { text: card.visual.targetDescription }),
      ]) : null,
    ]),
  ]);
  const dialog = sheet({ title: card.name, body });
  dialog.panel.classList.add('forge-card-detail-dialog');
}

function statCn(k) {
  return { strength: '强度', toughness: '韧性', sharpness: '锋利', craft: '工艺', design: '设计', spirit: '灵性' }[k] || k;
}

/* S4/S7 minigame surfaces live in the same WebGL stage. */
function renderHammer(body,run) {
  renderHammerV4({body,run,stage:$('#forgeStage',root),Game,getStage,router,render});
}
function renderEdge(body,run) {
  disposeInteraction=renderEdgeV4({body,run,stage:$('#forgeStage',root),Game,getStage,render,toast});
}

export function leave() {
  disposeInteraction?.();
  disposeInteraction = null;
  $('#forgeStage .hammer-stage-hit', root)?.remove();
  $('#forgeStage .edge-stage-canvas', root)?.remove();
}

export default { create, render, leave };
