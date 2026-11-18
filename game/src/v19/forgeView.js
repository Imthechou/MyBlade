import {
  BATCHES, HEAT, fittingPrice, PHASES, GRADES, oreMaterialOf, MODELS, LOOKS, STAT_CAP, STAT_NAMES,
  offers, familyOf, stabilityOf, buyOre, beginRefining, advanceHeat, pourRefining, canPour, heatBand, refinementRank,
  REFINEMENT_RESULTS, REFINEMENT_FAILURES, fractureRisk, strike, finishForge, canStrike, nextFatigue, hammerLimit, bufferFatigue,
  fitOptions, refreshFittings, signature, signaturePerk, inspectOre, mineralHeritage, oreInspection, oreModelId,
  markLamp, tapOreProbe, oreStatFocus,
} from './forge.js';
import { BLUEPRINTS, COMPARISON_BUILDS, MATERIAL_TIERS, RELEASE_RULES, ZONES,
  commissionChecks, commissionFor, meetsCommission, seriesLabel } from './launchRules.js';
import { ensureThreeRuntime } from './threeRuntime.js';
import { createViewReset } from '../ui/viewReset.js';
import { forgeMarkup } from './forgeMarkup.js';
import { ForgeSound } from './sound.js';
import { get as getProgress } from '../core/progress.js';
import { commitFurnace, finishAppraisal, forgeSession, openFurnace, walletView } from '../core/v19Progress.js';
import { haptics, motion } from '../platform/index.js';
import { hint as showHint } from '../ui/tutorial.js';
import { countUp } from '../ui/dom.js';

const PHASE_HINTS = {
  refine: ['v19-refine', '按住鼓风升温，松手降温；指针进入绿区才开始积累精炼。'],
  forge: ['v19-forge', '刀腹偏强韧，刃侧偏锋利，刀尖偏设计与灵性。6 锤后可收。'],
  fit: ['v19-fit', '配件只改变六维倾向，不会抹掉已经打出的刀纹。'],
};

/** 稀有及以上才走“落章 + 延迟滚分”的慢镜头，普通/精良保持干脆。 */
const RARE_TIERS = new Set(['rare', 'epic', 'legend', 'mythic']);

export function mountForge(root, { onArena, onCollection }) {
  root.innerHTML = forgeMarkup;
  const get = id => root.querySelector('#' + id);
  const stageBox = get('stage');
  const actions = get('actions');
  const tray = get('tray');
  const oreOptions = get('ore-options');
  oreOptions.addEventListener('load', event => {
    if (event.target.tagName === 'IMG') event.target.parentElement.classList.add('is-loaded');
  }, true);
  const readout = get('readout');
  const msg = get('stage-message');
  const sound = new ForgeSound();
  const stepNames = ['选料', '精炼', '锻打', '装配', '鉴定'];
  const roman = ['', ' I', ' II', ' III'];
  const fmt = p => (p * 100).toFixed(p === 0 ? 0 : 1) + '%';
  const signed = n => (n < 0 ? '−' : n > 0 ? '+' : '') + Math.abs(n);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  let save;
  let active = false;
  let stageInput;
  let stageModule;
  let stageEntry = 0;
  let frameId;
  let revealTimer;
  let revealStampTimer;
  let sealTimer;
  let pendingCheckpoint = false;
  let stage;
  let busy = false;
  let queuedHit;
  let queuedStop = false;
  let resultPause = false;
  let revealPending = false;
  let revealPace = 1000;
  let heatInput;
  let heatGesture = false;
  let confirmAbandon = false;
  let heatHud;
  let saveTask;
  let trayKey;
  let oreBatchKey;
  let webglError = false;
  let inspectionMode = 'natural';
  let toolStone = '';
  let messageTimer;
  let missTimer;
  let floatTimer;
  let zoneTimer;
  let phaseTimer;
  let stageLoadSeq = 0;
  let scoreRevealKey = '';
  const resetView = () => {
    if (!stage || busy) return;
    stage.resetView();
    renderGripFocus();
  };
  const viewReset = createViewReset(resetView);
  viewReset.hidden = true;
  get('stage-hint').after(viewReset);
  function showStorageNotice(message) {
    const notice = get('save-notice');
    notice.textContent = message;
    notice.hidden = !message;
  }

  function cancelIdleSave() {
    if (!saveTask) return;
    if (saveTask.idle) cancelIdleCallback(saveTask.id);
    else clearTimeout(saveTask.id);
    saveTask = null;
  }

  function apply(change, checkpoint = false) {
    cancelIdleSave();
    const result = commitFurnace(save.run, change);
    if (!result.ok) {
      if (result.error) showStorageNotice(result.error + (checkpoint ? ' · 点此重试' : ''));
      if (checkpoint) pendingCheckpoint = true;
      return null;
    }
    pendingCheckpoint = false;
    save = { run: result.run, credits: result.credits, launch: result.launch };
    showStorageNotice('');
    return result.result;
  }

  function persist() {
    const saved = apply(undefined, true);
    if (!saved && heatInput) {
      heatInput = null;
      cancelAnimationFrame(frameId);
      drawHeat();
    }
    return saved;
  }

  function persistWhenIdle() {
    if (saveTask) return;
    const idle = typeof requestIdleCallback === 'function';
    const write = () => { saveTask = null; persist(); };
    saveTask = { idle, id: idle ? requestIdleCallback(write, { timeout: 500 }) : setTimeout(write, 80) };
  }

  function button(action, label, { kind = 'primary', off = false, id = '' } = {}) {
    return `<button type="button" class="${kind}" data-action="${action}" ${id ? `id="${id}"` : ''} ${off ? 'disabled' : ''}>${label}</button>`;
  }

  function title(heading, meta = '', copy = '') {
    get('title').textContent = heading;
    get('bench-meta').textContent = meta;
    get('description').textContent = copy;
  }

  function lookChips(run) {
    const fields = Object.entries(LOOKS).filter(([slot]) => LOOKS[slot][run.skin[slot]]);
    const combination = signature(run.skin);
    return `<div class="look-list">${fields.map(([slot, names]) => `<span class="look-chip ${run.skin.levels[slot] >= 3 ? 'rarity' : ''}">${names[run.skin[slot]]}${roman[run.skin.levels[slot]] || ''}</span>`).join('')}${combination ? `<span class="look-chip rarity">${combination}</span>` : ''}</div>`;
  }

  function render() {
    if (!save?.run) return;
    const run = save.run;
    heatHud = null;
    const { phase } = run;
    const changedPhase = root.dataset.phase !== phase;
    root.dataset.phase = phase;
    if (changedPhase) {
      stageBox.classList.remove('is-phase-in');
      void stageBox.offsetWidth;
      stageBox.classList.add('is-phase-in');
      clearTimeout(phaseTimer);
      phaseTimer = setTimeout(() => stageBox.classList.remove('is-phase-in'), 520);
    }
    if (changedPhase && getProgress().settings.tutorialSeen) {
      const tip = PHASE_HINTS[phase];
      if (tip) showHint(tip[0], tip[1]);
    }
    const failedRefining = run.last?.type === 'refine-fail';
    const navPhase = phase === 'reveal' ? 'ore' : phase === 'broken' ? failedRefining ? 'refine' : 'forge' : phase;
    const idx = PHASES.indexOf(navPhase);
    const ore = phase === 'ore' ? offers(run)[run.selected] : run.ore;
    const fit = fitOptions(run).find(item => item.id === run.fit);
    const comparison = COMPARISON_BUILDS[run.comparisonBuild];
    const usingComparison = comparison && comparison.family === ore?.family && run.blueprint === 'straight';
    stageBox.dataset.mode = phase;
    if (phase !== 'refine') stageBox.dataset.danger = 'false';
    /* 锻打首次进入：等机位切换完成后把三个落锤区贴到刀身上。 */
    if (changedPhase && phase === 'forge') {
      clearTimeout(zoneTimer);
      zoneTimer = setTimeout(paintZones, motion.reduced() ? 60 : 640);
    } else if (phase !== 'forge') {
      clearTimeout(zoneTimer);
      get('stage-zones')?.classList.remove('show');
    }
    if (changedPhase) {
      get('steps').innerHTML = `<span><b>${stepNames[idx]}</b><small>0${idx + 1} / 0${stepNames.length}</small></span>
        <i aria-hidden="true" style="--step-progress:${(idx + 1) / stepNames.length * 100}%"></i>`;
    }
    get('stage-state').hidden = !webglError;
    get('stage-state').textContent = webglError ? '3D 暂不可用' : '';
    const hints = { reveal: '拖动看切面', forge: '点刀落锤', fit: '横拖旋转', appraise: '横拖旋转' };
    get('stage-hint').textContent = hints[phase] || '';
    get('panel').hidden = phase === 'ore';
    if (phase === 'ore') {
      if (changedPhase || !actions.querySelector('[data-action="buy"]')) {
        actions.innerHTML = button('buy', '') + button('next-batch', '换一批', { kind: 'secondary' });
      }
      const buy = actions.querySelector('[data-action="buy"]');
      const canAfford = ore.price <= save.credits;
      buy.textContent = canAfford && ore.price === 0 ? '免费开石' : (canAfford ? '开石' : '余额不足') + ' · ' + ore.price + ' CR';
      buy.disabled = !canAfford;
      const refresh = actions.querySelector('[data-action="next-batch"]');
      refresh.hidden = ['first', 'recovery'].includes(run.furnaceKind);
      refresh.disabled = run.batch === BATCHES - 1;
      refresh.setAttribute('aria-label', '换一批，第 ' + (run.batch + 1) + ' / ' + BATCHES + ' 批');
    } else if (phase === 'reveal') {
      if (revealPending) {
        title('开石见芯');
        readout.innerHTML = `<div class="ore-suspense-track" style="--reveal:${revealPace}ms" aria-label="切面揭晓中"><i></i></div>`;
        actions.innerHTML = button('to-refine', '切开中…', { off: true });
      } else {
        const heritage = mineralHeritage(ore);
        title(familyOf(ore.family).name, GRADES[ore.grade] + '矿芯 · 偏' + oreStatFocus(ore), oreMaterialOf(ore).name);
        readout.innerHTML = `<div class="mineral-meters" data-grade="${ore.grade}">
          <div><span>纯净度</span><b id="ore-purity">${ore.purity}</b><i style="--value:${ore.purity}%"></i></div>
          <div><span>稳定性</span><b id="ore-stability">${stabilityOf(ore.stability)}</b><i style="--value:${ore.stability}%"></i></div>
        </div>
        <button type="button" class="heritage-preview" data-action="preview-mineral" aria-pressed="false">
          <span class="heritage-swatch" style="--core:${heritage.core};--steel:${heritage.tone}"></span>
          <span>${heritage.name}</span><strong>看刀纹 ›</strong>
        </button>`;
        actions.innerHTML = button('to-refine', '去精炼');
      }
    } else if (phase === 'refine') {
      title('控制炉温', run.furnaceKind === 'challenge' ? '挑战炉' : '', '绿区累计精炼。松手可降温');
      readout.innerHTML = `<div class="heat-display">
        <div class="heat-display-top"><strong id="heat-step">原石升温</strong><span class="heat-clock" id="heat-clock"></span><b class="readout-number" id="heat-number">35°</b></div>
        <div class="thermo" role="progressbar" aria-label="炉温" aria-valuemin="0" aria-valuemax="100" aria-valuenow="35" id="thermo"><i class="thermo-fill" id="heat-fill"></i><i class="thermo-range" id="heat-range"></i><i class="thermo-danger"></i><i class="thermo-needle" id="heat-needle"></i></div>
        <div class="heat-caption"><b id="heat-note"></b><span id="heat-target"></span></div>
        <div class="heat-metrics">
          <div><div><span>精炼 <small id="heat-rank"></small></span><b id="heat-quality">0</b></div>
            <div class="heat-progress" role="progressbar" aria-label="精炼质量" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="heat-quality-meter"><span id="heat-progress"></span><i style="left:22%"></i><i style="left:65%"></i><i style="left:86%"></i></div></div>
          <div><div><span>炉料损伤</span><b id="heat-damage-value">0%</b></div>
            <div class="risk-bar heat-damage"><span id="heat-damage"></span></div></div>
        </div>
      </div>`;
      actions.innerHTML = button('heat', '按住鼓风', { id: 'heat-button' }) +
        button('pour-refine', '浇注', { kind: 'secondary', id: 'pour-button', off: true });
      heatHud = { nodes: Object.fromEntries(['thermo', 'heat-step', 'heat-number', 'heat-clock', 'heat-fill',
        'heat-needle', 'heat-range', 'heat-target', 'heat-rank', 'heat-quality', 'heat-quality-meter',
        'heat-progress', 'heat-damage', 'heat-damage-value', 'heat-note', 'heat-button', 'pour-button'].map(id => [id, get(id)])),
        values: Object.create(null), updated: -Infinity, state: '' };
      drawHeat();
    } else if (phase === 'forge') {
      const risk = fractureRisk(run);
      const bounded = Number.isFinite(hammerLimit(run));
      title(MODELS[run.model], '', usingComparison ? '同靶建议 · ' + comparisonHammer(comparison) : '');
      readout.innerHTML = `<div class="forge-meters"><div><span>落锤</span><b id="hit-count">${run.hits}${run.hits < 6 ? ' / 6' : ' 锤'}</b></div>
        <div><span>下一锤断率</span><b class="risk-value ${risk >= .075 ? 'alert' : ''}" id="risk">${fmt(risk)}</b>
          <div class="risk-bar"><span style="width:${risk / .9 * 100}%"></span></div></div></div>
          ${bounded && run.hits >= 6 && run.furnaceKind !== 'first' ? `<p class="fit-detail">预计疲劳 ${nextFatigue(run)} / 100 · 最多 10 锤</p>` : ''}${lookChips(run)}`;
      const fallback = '<div class="v19-zones">' + Object.keys(ZONES).map(zone =>
        button('strike-fallback', ZONES[zone], { id: 'strike-' + zone, kind: 'secondary', off: !canStrike(run) })).join('') + '</div>';
      /* 收锤进度画在按钮里，不再用“第 6 锤后可收锤”整条文字解释规则。 */
      actions.innerHTML = fallback + (bounded && !run.buffered && nextFatigue(run) >= 100 && run.hits < hammerLimit(run)
        ? button('buffer-fatigue', '缓冲一次 · −22 疲劳', { kind: 'secondary' }) : '') +
        `<button type="button" class="primary finish-btn" data-action="finish"${run.hits < 6 ? ' disabled' : ''}
          aria-label="${run.hits < 6 ? `收锤，还差 ${6 - run.hits} 锤` : '收锤，去装配'}">
          <span>收锤</span><i class="finish-gauge" style="--v:${Math.min(1, run.hits / 6) * 100}%" aria-hidden="true"></i>
        </button>`;
    } else if (phase === 'fit') {
      title('给刀装柄', '选 1 套', usingComparison ? '同靶建议 · ' + comparison.grip + '柄' : '');
      readout.innerHTML = fit ? `<p class="fit-detail">${fit.parts} · ${fit.delta.map((n, i) => n ? STAT_NAMES[i] + signed(n) : '').filter(Boolean).join(' · ')}</p>` : '';
      const price = fittingPrice(run);
      actions.innerHTML = button('appraise', '确认并鉴定', { off: !fit }) +
        (run.furnaceKind !== 'first' ? button('refresh', run.refreshed ? '已换配件' : run.freeFitting ? '免费换一批'
          : (run.rules === RELEASE_RULES ? '换柄外观 · ' : '换一批 · ') + price + ' CR',
          { kind: 'secondary', off: run.refreshed || save.credits < price }) : '');
    } else if (phase === 'appraise') {
      const record = run.record;
      title(record?.name || '成刀已鉴定');
      if (record) {
        const perk = signaturePerk(record.signature);
        const rarity = record.rarity || 'common';
        const rare = RARE_TIERS.has(rarity);
        readout.innerHTML = `<div class="forge-result arcade-result${rare ? ' is-rare' : ''}" data-rarity="${esc(rarity)}">
          <span class="result-grade">${esc(record.grade)} · 品质 ${esc(record.quality)}</span>
          <b class="result-score"><span id="result-score">${motion.reduced() ? record.score : 0}</span><small> 分</small></b>
          ${record.credit > 0 ? `<span class="result-credit"><small>本次入账</small><b>+${record.credit} CR</b></span>` : ''}</div>
          ${record.craft ? `<p class="fit-detail">工艺 ${esc(record.craft.grade)} · ${record.craft.score}${record.seriesSlot ? ' · ' + seriesLabel(record.seriesSlot) : ''}</p>` : ''}
          <div class="stat-list">${record.stats.map((n, i) => `<div class="stat" style="--i:${i}"><span>${STAT_NAMES[i]}</span><b>${Number(n)}</b><span class="stat-track"><i style="width:${Math.min(100, Number(n) / STAT_CAP * 100)}%"></i></span></div>`).join('')}</div>
          ${perk ? `<p class="fit-detail result-perk">${esc(perk.desc)}</p>` : ''}`;
        const scoreNode = get('result-score');
        if (scoreRevealKey !== run.resultId) {
          scoreRevealKey = run.resultId;
          /* ★ 稀有以上先让刀身亮一下、落章，再滚分；普通品质立刻滚分，不拖节奏。 */
          const lead = motion.reduced() ? 0 : rare ? 560 : 0;
          const span = motion.reduced() ? 0 : rare ? 1080 : 900;
          if (rare) {
            showAppraiseSeal(record.grade || '成刀', rarity);
            stageBox.dataset.rarity = rarity;
            setTimeout(() => {
              if (stageBox.dataset.rarity === rarity) delete stageBox.dataset.rarity;
            }, 1900);
          }
          setTimeout(() => countUp(scoreNode, 0, Number(record.score) || 0, span), lead);
        } else if (scoreNode) scoreNode.textContent = String(record.score);
      } else readout.replaceChildren();
      const canCompare = comparison && record && save.launch?.firstPassed &&
        getProgress().collection.some(blade => blade.id === save.launch.firstBladeId && blade.id !== record.id &&
          !blade.fractured && blade.canEnterArena !== false);
      actions.innerHTML = (canCompare ? button('enter-comparison', '带两把刀去同靶对照') :
        record ? button('enter-tournament', '带此刀去试斩') : '') +
        button('open-collection', '藏刀阁', { kind: record ? 'secondary' : 'primary' }) +
        (run.furnaceKind === 'first' && !save.launch?.firstPassed ? '' : button('restart', '再锻一把', { kind: 'secondary' }));
    } else {
      /* 失败页不再用三行文字复述同一件事：标题说结果、播报说原因、这里只画复盘刻度。 */
      title(run.last?.type === 'abandoned' ? '炉次已放弃' : failedRefining ? '炉次报废' : '刀身断裂');
      const review = failedRefining
        ? [['炉料损伤', Math.min(100, Math.round(run.refinement?.damage ?? 100)), 'danger'],
          ['精炼质量', Math.round(run.refinement?.quality ?? 0), '']]
        : [['落锤', run.hits, ''], ['断率', Math.round((run.last?.risk ?? 0) * 100), 'danger']];
      readout.innerHTML = `<div class="fail-review">${review.map(([label, value, tone]) =>
        `<div${tone ? ` data-tone="${tone}"` : ''}><span>${label}</span><b>${value}</b><i style="--v:${Math.min(100, value)}%"></i></div>`).join('')}</div>`;
      if (run.reward > 0) readout.insertAdjacentHTML('beforeend', `<p class="fit-detail">退回 ${run.reward} CR · 已入作品账单</p>`);
      actions.innerHTML = button('restart', '再开一炉');
    }
    const abandon = get('furnace-abandon');
    const abandonable = run.rules === RELEASE_RULES && run.furnaceKind !== 'first' &&
      ['reveal', 'refine', 'forge', 'fit'].includes(phase);
    abandon.hidden = !abandonable;
    if (abandonable) {
      const spent = walletView({ id: run.resultId, seed: run.seed, v19Visual: true }).receipts
        .reduce((total, row) => total + (row.amount < 0 ? -row.amount : 0), 0);
      abandon.innerHTML = confirmAbandon
        ? `<p>已付 ${spent} CR。放弃后本炉归入断刀册。</p>${button('confirm-abandon', '确认放弃', { kind: 'secondary' })}
          ${button('cancel-abandon', '继续本炉', { kind: 'secondary' })}`
        : button('ask-abandon', '放弃本炉', { kind: 'secondary' });
    }
    renderTools(run, ore);
    renderOrderStatus(run);
    if (phase === 'ore' && webglError) describeProbe(ore, inspectionMode);
    const loadSeq = ++stageLoadSeq;
    const started = performance.now();
    const pendingStage = stage?.sync(run, ore, fit);
    if (phase === 'ore') stage?.setInspection(inspectionMode);
    if (stage && (pendingStage || stageBox.dataset.loading === 'true' || changedPhase && phase === 'appraise')) {
      setStageLoading(true);
      const isCurrent = () => loadSeq === stageLoadSeq;
      Promise.resolve(pendingStage ?? true)
        .then(ok => ok && stageModule.waitForStageFrame(stage, started, isCurrent))
        .then(() => { if (isCurrent()) setStageLoading(false); });
    } else if (stage || webglError) {
      setStageLoading(false);
    }
    viewReset.hidden = !stage || !['ore', 'reveal', 'forge', 'fit', 'appraise'].includes(phase);
    renderGripFocus();
    renderTray(run, fit);
    if (changedPhase) root.closest('.page').scrollTop = 0;
  }


  function setStageLoading(loading) {
    const marker = get('stage-loading');
    stageBox.dataset.loading = String(Boolean(loading));
    marker.textContent = stageBox.dataset.mode === 'appraise' ? '正在呈现刀具…' : '正在准备工位…';
    marker.hidden = !loading;
  }

  function renderGripFocus() {
    const button = get('grip-focus');
    button.hidden = save.run.phase !== 'fit' || !stage || webglError;
    button.setAttribute('aria-pressed', String(Boolean(stage?.gripFocus)));
    button.textContent = stage?.gripFocus ? '查看全刀' : '查看刀柄';
  }

  function describeProbe(ore, probe) {
    let result = '';
    if (probe === 'lamp') result = ['矿脉零散', '矿脉成束', '矿脉连贯'][ore.grade];
    if (probe === 'window') result = ['石杂较多', '矿芯较净', '矿芯连续纯净'][ore.grade];
    if (probe === 'tap') {
      const { fractures } = oreInspection(ore);
      result = fractures > .65 ? '裂隙较多' : fractures > .34 ? '可见细裂' : '质地紧实';
    }
    get('announcer').textContent = result;
    if (webglError) get('stage-hint').textContent = result;
  }

  function setInspection(mode, ore, replay = false) {
    inspectionMode = mode;
    stage?.setInspection(mode, { replay });
    renderTools(save.run, ore);
    describeProbe(ore, mode);
  }

  function comparisonHammer(build) {
    return Object.entries(build.hits).map(([zone, hits]) => ZONES[zone] + ' ' + hits + ' 锤').join(' · ');
  }

  function renderOrderStatus(run) {
    const status = get('furnace-order-status');
    const checks = commissionChecks(run);
    status.hidden = !checks.length || run.phase === 'broken';
    if (status.hidden) { status.replaceChildren(); return; }
    const result = run.phase === 'appraise';
    const met = result ? run.record?.commission?.met : meetsCommission(run);
    const amount = Number(run.commission.amount);
    const label = result ? met ? '达标 · 已入账 +' + amount + ' CR' : '未达标 · +0 CR' :
      met ? '目标已达成 · 鉴定后 +' + amount + ' CR' : '达标后 +' + amount + ' CR';
    const sequence = checks.find(check => check.hint);
    status.dataset.met = String(Boolean(met));
    status.innerHTML = `<div class="order-heading"><b>工坊委托</b><span>${label}</span></div>
      <div class="order-checks">${checks.map(({ key, label, value, target, settled }) =>
        `<span data-met="${settled && value >= target}">${label} <b data-order-value="${key}" data-target="${target}">${Math.min(value, target)}</b> / ${target}</span>`).join('')}</div>
      ${sequence && run.phase === 'forge' && sequence.value < sequence.target ? `<small>${sequence.hint}</small>` : ''}`;
  }

  function renderTools(run, ore) {
    const selecting = run.phase === 'ore';
    get('ore-tools').hidden = !selecting;
    if (!selecting) {
      stageBox.dataset.inspection = 'natural';
      toolStone = '';
      return;
    }
    const config = get('furnace-config');
    const fixed = ['first', 'recovery'].includes(run.furnaceKind);
    config.hidden = run.rules !== RELEASE_RULES;
    if (!config.hidden) {
      const configKey = [run.seed, run.batch, run.selected, run.furnaceKind, run.blueprint, run.commissionSelected, save.credits].join('|');
      if (config.dataset.key !== configKey) {
        config.dataset.key = configKey;
        config.innerHTML = fixed ? `<p class="forge-ore-note">${run.furnaceKind === 'first' ? '两种材料任选 · 免费锻一把直刀'
          : '复开炉免费 · 成刀后补到 14 CR'}</p>` : renderFurnaceOptions(run, ore, config.querySelector('details')?.open);
      }
    }
    const key = run.seed + '|' + ore.id;
    if (toolStone !== key) {
      inspectionMode = ore.window ? 'window' : ore.probe.lamp ? 'lamp' : 'natural';
      toolStone = key;
    }
    stageBox.dataset.inspection = inspectionMode;
    root.querySelector('[data-action="inspect-light"]').setAttribute('aria-pressed', String(inspectionMode === 'lamp'));
    get('window-ore').dataset.inspected = String(inspectionMode === 'window');
  }

  function renderFurnaceOptions(run, ore, advancedOpen) {
    const comparison = COMPARISON_BUILDS[run.comparisonBuild];
    const material = MATERIAL_TIERS[ore.tier];
    const task = commissionFor(ore);
    const blueprints = { auto: '随炉成形', ...BLUEPRINTS };
    const challenge = run.furnaceKind === 'challenge';
    const selected = Boolean(run.commissionSelected);
    return `${comparison && comparison.family === ore.family && run.blueprint === 'straight' ?
        `<p class="forge-plan-hint"><b>同靶建议 · ${comparison.name}</b><span>${comparisonHammer(comparison)} · ${comparison.grip}柄</span></p>` : ''}
      <button type="button" class="furnace-order" data-action="toggle-commission" aria-pressed="${selected}"
        ${ore.price > save.credits ? 'disabled' : ''}>
        <b>工坊委托 <small>达标 +${task.amount} CR</small></b>
        <span class="order-choice">${selected ? '✓ 已接' : '接单'}</span>
        <span class="order-requirements">${esc(task.description)}${selected ? ' · 鉴定结算，成刀归你' : ''}</span>
      </button>
      <p class="furnace-cost">购料 −${ore.price} · 成刀 +${material.appraisal}${selected ? ' · 委托 +' + task.amount : ''} CR
        <b>${selected ? '达标净额' : '成刀净额'} ${signed(material.appraisal - ore.price + (selected ? task.amount : 0))} CR</b></p>
      <details class="furnace-settings"${advancedOpen ? ' open' : ''}>
        <summary>图样与炉型 <span>${esc(blueprints[run.blueprint] || blueprints.auto)} · ${challenge ? '挑战' : '常规'}</span></summary>
        <div class="furnace-plan"><label for="furnace-blueprint">图样</label><select id="furnace-blueprint">
          ${Object.entries(blueprints).map(([value, label]) =>
            `<option value="${value}" ${run.blueprint === value ? 'selected' : ''}>${label}</option>`).join('')}</select>
          <button type="button" data-action="toggle-challenge" aria-pressed="${challenge}">
            ${challenge ? '挑战炉 ✓' : '常规炉'}</button></div>
        ${challenge ? '<p>挑战炉可报废，失败返材料费 40%。</p>' : ''}
      </details>`;
  }

  function toggleOreBlade(control) {
    const preview = stage?.toggleMineralPreview();
    control.setAttribute('aria-pressed', String(Boolean(preview)));
    control.querySelector('strong').textContent = preview ? '看切面 ›' : '看刀纹 ›';
    get('stage-hint').textContent = preview ? '横拖旋转' : '拖动看切面';
  }

  function renderOreOptions(run) {
    const stones = offers(run);
    const batchKey = run.seed + '|' + run.batch;
    if (oreBatchKey !== batchKey) {
      oreBatchKey = batchKey;
      oreOptions.innerHTML = stones.map((stone, index) => {
        const rock = familyOf(stone.family);
        const image = new URL('../../assets/v19/ore-previews/' + oreModelId(stone) + '.webp', import.meta.url);
        return '<button type="button" class="ore-card" data-action="select-ore" data-id="' + index +
          '" aria-label="' + rock.name + '，' + stone.price + ' CR"><span class="ore-thumbnail" style="--ore-color:' + rock.color +
          '"><img src="' + image.href + '" alt="" decoding="async"><i></i></span>' +
          (run.rules === RELEASE_RULES ? '<span class="ore-card-label"><b>' + rock.name + '</b><small>' +
            (stone.price ? MATERIAL_TIERS[stone.tier].label + ' · ' + stone.price + ' CR' : '免费') + '</small></span>' : '') + '</button>';
      }).join('');
    }
    [...oreOptions.children].forEach((button, index) => {
      button.setAttribute('aria-pressed', String(run.selected === index));
    });
  }

  function renderTray(run, fit) {
    const { phase } = run;
    if (phase === 'ore') renderOreOptions(run);
    const key = [run.seed, phase, run.refreshed, run.fit].join('|');
    if (key === trayKey) return;
    trayKey = key;
    if (phase === 'fit') {
      tray.innerHTML = `<div class="fit-grid">${fitOptions(run).map(item => {
        const best = Math.max(...item.delta);
        return `<button type="button" class="fit-card" data-action="select-fit" data-id="${item.id}" aria-pressed="${fit?.id === item.id}">
          <span class="fit-colors"><i style="--sample:${item.color}"></i><i style="--sample:${item.accent}"></i></span>
          <b>${item.name}</b><small>${STAT_NAMES[item.delta.indexOf(best)]} +${best}</small></button>`;
      }).join('')}</div>`;
    } else tray.replaceChildren();
  }


  function say(text, type = '') {
    clearTimeout(messageTimer);
    msg.className = 'stage-message ' + type;
    msg.textContent = text;
    void msg.offsetWidth;
    msg.classList.add('show');
    // Global reduced-motion rules collapse keyframes to 0ms, which lands on
    // the final opacity:0 frame. Use a static hold so the result remains readable.
    if (motion.reduced()) {
      msg.classList.add('is-static');
      messageTimer = setTimeout(() => msg.classList.remove('show', 'is-static'), 1500);
    }
    get('announcer').textContent = text;
  }

  /** 稀有以上鉴定的“鉴定所落章”：盖在 3D 舞台右上角，不遮挡分数与按钮。 */
  function showAppraiseSeal(label, tier) {
    const node = get('appraise-seal');
    if (!node) return;
    node.dataset.tier = tier;
    node.hidden = false;
    get('appraise-seal-grade').textContent = label;
    clearTimeout(sealTimer);
    sealTimer = setTimeout(() => { node.hidden = true; }, 2800);
  }

  /**
   * 开石分级揭晓：普通矿快速带过，良质矿停顿，稀质矿额外补一次粒子与金色落章。
   * 减弱动效模式下只保留静态文字，不做缩放/闪光。
   */
  function playRevealStamp(ore) {
    const grade = ore?.grade ?? 0;
    const node = get('ore-reveal');
    if (!node) return;
    node.dataset.grade = String(grade);
    node.hidden = false;
    get('ore-reveal-grade').textContent = GRADES[grade] + '矿芯';
    get('ore-reveal-sub').textContent = grade === 2 ? '稀有矿质 · 刀纹已定'
      : grade === 1 ? '质地良好 · 可入炉' : '常见矿质';
    clearTimeout(revealStampTimer);
    revealStampTimer = setTimeout(() => { node.hidden = true; }, motion.reduced() ? 1300 : grade === 2 ? 1800 : 1200);
  }

  function drawHeat(now = performance.now(), force = false) {
    const heat = save.run.refining;
    if (!heat || !heatHud) return;
    const { nodes, values } = heatHud;
    const put = (key, value, apply) => { if (values[key] !== value) { values[key] = value; apply(value); } };
    const text = (id, value) => put(id, value, value => { nodes[id].textContent = value; });
    const transform = (id, value) => put(id, value, value => { nodes[id].style.transform = value; });
    const temperature = Math.round(heat.temperature);
    const band = heatBand(heat);
    const green = heat.step === 'molten' && heat.temperature >= band.lower && heat.temperature <= band.upper;
    const danger = heat.step === 'molten' && (heat.temperature >= 82 || heat.temperature <= 58 || heat.damage >= 65);
    const rank = refinementRank(heat.quality);
    const outcome = REFINEMENT_RESULTS[rank];
    const paused = !heatInput && heat.step !== 'cast';
    const guidance = paused ? (heat.elapsed ? 'resume' : '') :
      heat.step !== 'molten' || green ? '' : heat.temperature < band.lower ? 'warm' : 'cool';
    // Keep motion and the simulation at display cadence, without relaying out the
    // panel. Numeric text is sampled separately and unchanged content is untouched.
    transform('heat-fill', `scaleX(${(heat.temperature / 100).toFixed(4)})`);
    transform('heat-needle', `translateX(${heat.temperature.toFixed(2)}%)`);
    transform('heat-range', `translateX(${band.lower.toFixed(2)}%)`);
    transform('heat-progress', `scaleX(${(heat.quality / 100).toFixed(4)})`);
    transform('heat-damage', `scaleX(${(heat.damage / 100).toFixed(4)})`);
    stage?.setHeat(heat, Boolean(heatInput));
    if (heatInput) {
      if (green && !heatInput.green && performance.now() - (heatInput.lastCue ?? 0) > 450) {
        sound.play('heat');
        heatInput.lastCue = performance.now();
      }
      heatInput.green = green;
    }
    const readyToPour = canPour(save.run);
    const state = [heat.step, danger, rank, paused, Boolean(heatInput?.blowing), readyToPour, guidance].join('|');
    if (!force && state === heatHud.state && now - heatHud.updated < 80) return;
    heatHud.state = state;
    heatHud.updated = now;
    text('heat-step', { ore: '原石升温', molten: '熔球稳温', cast: '浇注成坯' }[heat.step]);
    text('heat-number', temperature + '°');
    text('heat-clock', heat.step === 'cast' ? '浇注中' : paused ? heat.elapsed ? '待续炼' : '待点火' : Math.max(0, (heat.step === 'ore' ? HEAT.preheat : HEAT.window) - heat.elapsed).toFixed(1) + ' s');
    text('heat-target', heat.step === 'molten' ? '目标 ' + band.lower.toFixed(0) + '–' + band.upper.toFixed(0) + '°' : '');
    nodes['heat-range'].style.setProperty('--heat-band-width', (band.upper - band.lower) + '%');
    put('lower', band.lower.toFixed(2), value => { nodes.thermo.dataset.lower = value; });
    put('upper', band.upper.toFixed(2), value => { nodes.thermo.dataset.upper = value; });
    text('heat-rank', rank === 'failed' ? '' : outcome.label);
    text('heat-quality', String(Math.floor(heat.quality)));
    const orderQuality = root.querySelector('[data-order-value="quality"]');
    if (orderQuality) orderQuality.textContent = String(Math.min(Math.floor(heat.quality), Number(orderQuality.dataset.target)));
    put('quality-aria', Math.floor(heat.quality), value => nodes['heat-quality-meter'].setAttribute('aria-valuenow', value));
    text('heat-damage-value', Math.round(heat.damage) + '%');
    text('heat-note', { resume: '按住续炼', warm: '偏冷 · 按住鼓风', cool: '偏热 · 松手降温' }[guidance] ?? '');
    put('guide', guidance, value => { nodes['heat-note'].dataset.guide = value; });
    put('temperature-aria', temperature, value => nodes.thermo.setAttribute('aria-valuenow', value));
    put('step', heat.step, value => { stageBox.dataset.heat = value; });
    put('danger', danger, value => { stageBox.dataset.danger = String(value); });
    put('heat-disabled', heat.step === 'cast', value => { nodes['heat-button'].disabled = value; });
    text('heat-button', paused && heat.elapsed ? '按住续炼' : '按住鼓风');
    put('blowing', heat.step !== 'cast' && Boolean(heatInput?.blowing), value => nodes['heat-button'].classList.toggle('heating', value));
    put('pour-disabled', !readyToPour, value => { nodes['pour-button'].disabled = value; });
    text('pour-button', heat.step === 'cast' ? '浇注中…' : '浇注');
  }

  function heatFrame(now) {
    if (!active || !heatInput || save.run.phase !== 'refine') return;
    const previous = heatInput.now;
    heatInput.now = now;
    if (!document.hidden) {
      const run = save.run;
      const before = run.refining.step;
      let remaining = Math.min(.18, Math.max(0, (now - previous) / 1000));
      while (remaining > 0 && run.phase === 'refine') {
        const frame = Math.min(remaining, 1 / 60);
        advanceHeat(run, frame, heatInput.blowing);
        remaining -= frame;
      }
      if (run.phase !== 'refine') {
        heatInput = null;
        if (!persist()) { render(); return; }
        render();
        const label = run.refinement.assisted ? '保底成坯 · 精炼 22' : REFINEMENT_RESULTS[run.refinement.result].label;
        const difference = run.purity - run.ore.purity;
        /* 播报只说“为什么废”，标题已经说了“废了”，不再拼一遍“· 炉次报废”。 */
        const result = run.phase === 'broken'
          ? REFINEMENT_FAILURES[run.refinement.reason]
          : label + ' · 纯净 ' + signed(difference);
        sound.play(run.phase === 'broken' ? 'break' : 'cast');
        say(result, run.refinement.result === 'failed' ? 'scar' : 'surge');
        return;
      }
      if (before !== run.refining.step) {
        stage?.sync(run, run.ore, null);
        sound.play(run.refining.step === 'molten' ? 'melt' : 'cast');
      }
      if (now - heatInput.saved > 1200 || before !== run.refining.step) {
        if (before !== run.refining.step) persist();
        else persistWhenIdle();
        if (heatInput) heatInput.saved = now;
      }
      drawHeat(now);
    }
    if (heatInput) frameId = requestAnimationFrame(heatFrame);
  }

  function startHeat(blowing) {
    if (save.run.phase !== 'refine' || !save.run.refining || save.run.refining.step === 'cast' && blowing) return;
    if (!heatInput) {
      heatInput = { now: performance.now(), saved: 0, blowing };
      frameId = requestAnimationFrame(heatFrame);
    }
    heatInput.blowing = blowing;
    drawHeat();
  }

  function charge() {
    if (pendingCheckpoint) return;
    sound.configure(getProgress().settings);
    sound.unlock();
    sound.prepare();
    startHeat(true);
  }

  function releaseHeat() {
    if (!heatInput) return;
    heatInput.blowing = false;
    drawHeat();
  }

  const FINISH_WORDS = { metal: '钢色', pattern: '显纹', film: '成膜', fx: '生辉', model: '成型' };
  const ZONE_FOCUS = { belly: '强度', edge: '锋利', tip: '灵性' };

  /** 命中浮字：贴在锤点上方，只显示“这一锤真的留下了什么”。 */
  function showHitFloat(hit, result) {
    const layer = get('stage-float');
    if (!layer || !stage || motion.reduced()) return;
    const word = result.type === 'break' ? '断裂'
      : result.type === 'scar' ? '崩口' : FINISH_WORDS[result.change?.slot];
    if (!word) return;
    const canvasRect = stage.canvas.getBoundingClientRect();
    const boxRect = stageBox.getBoundingClientRect();
    const point = stage.project(hit.world, canvasRect);
    const node = document.createElement('span');
    node.className = 'stage-float-word';
    node.dataset.tone = result.type === 'break' ? 'break' : result.type === 'scar' ? 'scar' : 'gain';
    node.textContent = word;
    node.style.left = (point.x - boxRect.left) + 'px';
    node.style.top = (point.y - boxRect.top) + 'px';
    layer.appendChild(node);
    node.addEventListener('animationend', () => node.remove(), { once: true });
    clearTimeout(floatTimer);
    floatTimer = setTimeout(() => { layer.replaceChildren(); }, 900);
  }

  /**
   * 锻打开局热区：把「刀腹塑纹 / 刃侧上色 / 刀尖生光」从一行说明变成贴在刀上的三个点。
   * 只在首次进入锻打时脉冲 1.6 秒，之后交给命中浮字，避免长期挡住刀身。
   */
  function paintZones(attempt = 0) {
    const layer = get('stage-zones');
    if (!layer || save?.run?.phase !== 'forge') return;
    const anchors = stage?.zoneAnchors?.();
    if (!anchors) {
      /* 舞台还在换机位或模型未就绪，稍后重试几次，避免引导直接丢失。 */
      if (attempt < 5) {
        clearTimeout(zoneTimer);
        zoneTimer = setTimeout(() => paintZones(attempt + 1), 280);
      }
      return;
    }
    const canvasRect = stage.canvas.getBoundingClientRect();
    const boxRect = stageBox.getBoundingClientRect();
    layer.replaceChildren(...Object.entries(ZONE_FOCUS)
      .filter(([zone]) => anchors[zone])
      .map(([zone, word]) => {
        const dot = document.createElement('span');
        dot.className = 'zone-hot';
        dot.dataset.zone = zone;
        dot.textContent = word;
        dot.style.left = (canvasRect.left - boxRect.left + anchors[zone].x) + 'px';
        dot.style.top = (canvasRect.top - boxRect.top + anchors[zone].y) + 'px';
        return dot;
      }));
    layer.classList.remove('show');
    void layer.offsetWidth;
    layer.classList.add('show');
    clearTimeout(zoneTimer);
    zoneTimer = setTimeout(() => layer.classList.remove('show'), 1700);
  }

  function showStageMiss() {
    clearTimeout(missTimer);
    stageBox.classList.remove('is-miss');
    void stageBox.offsetWidth;
    stageBox.classList.add('is-miss');
    const hint = get('stage-hint');
    hint.textContent = '对准刀身再落锤';
    hint.classList.add('is-alert');
    missTimer = setTimeout(() => {
      stageBox.classList.remove('is-miss');
      hint.classList.remove('is-alert');
      if (save?.run.phase === 'forge') hint.textContent = '点刀落锤';
    }, 900);
  }

  function hitBlade(hit) {
    sound.configure(getProgress().settings);
    if (hit?.screen && stage && hit.mesh !== stage.mesh) hit = stage.hit(hit.screen.x, hit.screen.y);
    if (!hit) {
      if (save?.run.phase === 'forge' && !busy) showStageMiss();
      return;
    }
    if (save.run.phase !== 'forge' || queuedStop || pendingCheckpoint) return;
    if (busy) {
      if (stage?.blow?.landed && !resultPause) { queuedHit = hit; say('已排队', ''); }
      else say('锤头回弹中', '');
      return;
    }
    const result = apply(({ run }) => strike(run, hit.zone, hit.position));
    if (!result) return;
    sound.unlock();
    const animated = stage && hit.world && hit.normal;
    busy = Boolean(animated);
    if (busy) root.dataset.swinging = 'true';
    resultPause = result.notable;
    const impact = () => {
      if (result.notable || result.type === 'break') queuedHit = null;
      sound.impact(result, save.run.purity);
      haptics.feedback(result.type === 'break' ? 'fracture' : result.notable ? 'trait' : 'hammer');
      if (animated) { stage.impact(hit, result); showHitFloat(hit, result); }
      render();
      if (save.run.phase === 'forge' && [.10, .25, .50].some(level => result.risk < level && fractureRisk(save.run) >= level)) {
        sound.play('tension', 1, .12);
      }
      if (result.type === 'break' || result.type === 'scar' || result.fusion || result.change) {
        say(result.fusion || result.label, result.fusion ? 'surge' : result.type);
      }
    };
    if (!animated) { impact(); return; }
    sound.play('swish');
    stage.swing(hit, result, impact, () => {
      busy = false;
      delete root.dataset.swinging;
      resultPause = false;
      const next = queuedHit;
      queuedHit = null;
      if (queuedStop) {
        queuedStop = false;
        closeAnvil();
      } else if (next) hitBlade(next);
    });
  }

  function closeAnvil() {
    if (!apply(({ run }) => finishForge(run))) return;
    sound.play('polish');
    render();
  }

  function selectOre(run, action, id) {
    const previous = run.batch + ':' + run.selected;
    if (run.phase !== 'ore') return false;
    if (action === 'next-batch' && run.batch < BATCHES - 1) {
      run.batch++;
      run.selected = 0;
    } else if (action === 'select-ore' && Number.isInteger(Number(id)) && Number(id) >= 0 && Number(id) < offers(run).length) {
      run.selected = Number(id);
    } else return false;
    if (previous !== run.batch + ':' + run.selected) run.commissionSelected = false;
    return true;
  }

  root.addEventListener('change', event => {
    if (event.target.id !== 'furnace-blueprint' || !active || save?.run.phase !== 'ore') return;
    const value = event.target.value;
    if (value !== 'auto' && !Object.hasOwn(BLUEPRINTS, value)) return;
    if (apply(({ run }) => { run.blueprint = value; return true; })) {
      render();
      get('furnace-blueprint').focus({ preventScroll: true });
    }
  });

  root.addEventListener('click', event => {
    if (event.target === get('save-notice') && pendingCheckpoint) {
      if (persist()) render();
      return;
    }
    const control = event.target.closest('[data-action]');
    if (!control || !active || !save?.run || pendingCheckpoint) return;
    const { action, id } = control.dataset;
    const run = save.run;
    if (busy && action !== 'strike-fallback') {
      if (action === 'finish' && run.phase === 'forge' && run.hits >= 6) {
        queuedStop = true;
        queuedHit = null;
        control.textContent = '正在收锤…';
      }
      return;
    }
    sound.configure(getProgress().settings);
    sound.unlock();
    switch (action) {
      case 'enter-tournament': return onArena({ bladeId: run.resultId, mode: run.furnaceKind === 'first' ? 'first' : 'practice' });
      case 'enter-comparison': return onArena({ mode: 'compare', bladeIds: [save.launch.firstBladeId, run.resultId] });
      case 'toggle-commission':
      case 'toggle-challenge':
        if (!apply(({ run }) => {
          if (run.phase !== 'ore' || !['normal', 'challenge'].includes(run.furnaceKind)) return false;
          if (action === 'toggle-commission') run.commissionSelected = !run.commissionSelected;
          else run.furnaceKind = run.furnaceKind === 'challenge' ? 'normal' : 'challenge';
          return true;
        })) return;
        break;
      case 'buffer-fatigue':
        if (!apply(({ run }) => bufferFatigue(run))) return;
        break;
      case 'ask-abandon': confirmAbandon = true; break;
      case 'cancel-abandon': confirmAbandon = false; break;
      case 'confirm-abandon':
        if (!confirmAbandon || !apply(({ run }) => {
          if (!['reveal', 'refine', 'forge', 'fit'].includes(run.phase) || run.furnaceKind === 'first') return false;
          run.phase = 'broken';
          run.last = { type: 'abandoned', label: '主动放弃炉次' };
          return true;
        })) return;
        releaseHeat();
        confirmAbandon = false;
        break;
      case 'open-collection': return onCollection();
      case 'inspect-light': {
        if (run.phase !== 'ore') return;
        const ore = offers(run)[run.selected];
        if (!ore.probe.lamp && !apply(draft => markLamp(draft, ore.id))) return;
        const mode = inspectionMode !== 'lamp' ? 'lamp' : ore.window ? 'window' : 'natural';
        return setInspection(mode, ore);
      }
      case 'tap-ore': {
        if (run.phase !== 'ore') return;
        const ore = offers(run)[run.selected];
        if (!ore.probe.taps && !apply(draft => tapOreProbe(draft, ore.id))) return;
        stage?.tapOre();
        sound.inspect(ore);
        describeProbe(ore, 'tap');
        return;
      }
      case 'window-ore': {
        if (run.phase !== 'ore') return;
        const ore = offers(run)[run.selected];
        if (!ore.window && !apply(inspectOre)) return;
        setInspection('window', ore, true);
        sound.play('polish', .75);
        return;
      }
      case 'preview-mineral': return toggleOreBlade(control);
      case 'select-ore':
      case 'next-batch':
        if (!apply(({ run }) => selectOre(run, action, id))) return;
        if (action === 'next-batch' && stage) stage.prefetchOres(offers(save.run));
        break;
      case 'buy': {
        if (!apply(buyOre)) return;
        const grade = save.run.ore?.grade ?? 0;
        // 矿质越好，切面停顿越久：普通矿不拖节奏，稀质矿给足揭晓时间。
        revealPace = motion.reduced() ? 420 : grade === 2 ? 1520 : grade === 1 ? 1180 : 900;
        revealPending = Boolean(stage);
        sound.play('ore');
        stage?.reveal();
        stageBox.dataset.reveal = String(grade);
        setTimeout(() => { if (stageBox.dataset.reveal === String(grade)) delete stageBox.dataset.reveal; }, 560);
        if (revealPending) revealTimer = setTimeout(() => {
          if (!active || save.run.phase !== 'reveal') return;
          revealPending = false;
          render();
          const ore = save.run.ore;
          // 稀质矿：揭晓瞬间再补一束碎屑，形成“切面开 + 矿芯亮”的两段式。
          if (grade === 2) stage?.reveal();
          sound.play(grade === 2 ? 'surge' : 'shift', grade === 2 ? 1 : grade === 1 ? .96 : .9);
          haptics.feedback(grade === 2 ? 'win' : grade === 1 ? 'confirm' : 'tap');
          playRevealStamp(ore);
          say(GRADES[grade] + '矿芯 · 纯净 ' + ore.purity, grade === 2 ? 'rare' : grade === 1 ? 'surge' : '');
        }, revealPace);
        break;
      }
      case 'to-refine':
        if (revealPending || !apply(({ run }) => beginRefining(run))) return;
        sound.prepare();
        break;
      case 'pour-refine':
        if (!apply(({ run }) => pourRefining(run))) return;
        releaseHeat();
        render();
        startHeat(false);
        sound.play('cast');
        return;
      case 'finish': return closeAnvil();
      case 'strike-fallback': {
        const zone = control.id.slice(7);
        return hitBlade(stage?.keyboardHit(zone) || { zone });
      }
      case 'focus-grip':
        stage.setGripFocus(!stage.gripFocus);
        return renderGripFocus();
      case 'select-fit':
        if (!apply(({ run }) => {
          if (run.phase !== 'fit' || !fitOptions(run).some(item => item.id === id)) return false;
          run.fit = run.fit === id ? null : id;
          return true;
        })) return;
        sound.play('shift', .74);
        break;
      case 'refresh':
        if (!apply(refreshFittings)) return;
        sound.play('polish');
        break;
      case 'appraise':
        if (!apply(finishAppraisal)) return;
        sound.play('appraise');
        break;
      case 'restart': {
        if (heatGesture) return;
        const result = openFurnace({ restart: true });
        if (!result.ok) return showStorageNotice(result.error);
        save = forgeSession();
        root.closest('.page').scrollTop = 0;
        say('新一炉', 'surge');
        break;
      }
      default: return;
    }
    render();
    if (['toggle-commission', 'toggle-challenge'].includes(action)) root.querySelector('[data-action="' + action + '"]')?.focus({ preventScroll: true });
    if (action === 'select-fit') tray.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  });

  root.addEventListener('pointerdown', event => {
    if (!event.isPrimary) return;
    heatGesture = event.target.id === 'heat-button';
    if (!heatGesture) return;
    event.preventDefault();
    event.target.setPointerCapture(event.pointerId);
    charge();
  });
  root.addEventListener('pointerup', event => {
    if (event.isPrimary && heatInput && event.target.id === 'heat-button') releaseHeat();
  });
  root.addEventListener('pointercancel', event => {
    if (event.target.id === 'heat-button') releaseHeat();
  });
  root.addEventListener('lostpointercapture', event => {
    if (event.target.id === 'heat-button') releaseHeat();
  });
  function pauseHeat() {
    if (!active || !heatInput) return;
    heatInput = null;
    cancelAnimationFrame(frameId);
    drawHeat();
    persist();
  }

  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseHeat(); });
  window.addEventListener('blur', pauseHeat);
  window.addEventListener('pagehide', pauseHeat);
  root.addEventListener('keydown', event => {
    if (!active || ![' ', 'Enter'].includes(event.key) || event.repeat) return;
    heatGesture = event.target.id === 'heat-button';
    if (heatGesture) {
      event.preventDefault();
      charge();
    } else if (event.key === ' ' && save.run.phase === 'forge' && event.target.tagName !== 'BUTTON') {
      event.preventDefault();
      hitBlade(stage?.keyboardHit() || (!stage ? { zone: 'belly' } : null));
    }
  });
  root.addEventListener('keyup', event => {
    if ([' ', 'Enter'].includes(event.key) && heatInput && event.target.id === 'heat-button') releaseHeat();
  });

  async function mountStage(entry) {
    try {
      await ensureThreeRuntime();
      if (!active || entry !== stageEntry) return;
      stageModule ??= await import('./sharedStage.js');
      if (!active || entry !== stageEntry) return;
      const run = save.run;
      const ore = run.phase === 'ore' ? offers(run)[run.selected] : null;
      stage = stageModule.attachForgeStage(stageBox);
      if (ore) stage.prefetchOres([ore, ...offers(run)]);
      stageInput = new AbortController();
      stageModule.bindStageInput(stage, {
        signal: stageInput.signal,
        enabled: () => active && stage.content.visible && ['ore', 'reveal', 'forge', 'fit', 'appraise'].includes(save.run.phase),
        canAdjust: () => !busy,
        reset: resetView,
        onTap: event => {
          if (save.run.phase === 'forge') hitBlade(stage.hit(event.clientX, event.clientY));
        },
      });
    } catch (error) {
      if (!active || entry !== stageEntry) return;
      stageModule?.releaseForgeStage(stageBox);
      console.warn('[forge] 3D stage unavailable', error);
      stage = null;
      webglError = true;
    }
    render();
  }

  return {
    pause() {
      if (save?.run.refining?.step !== 'cast') pauseHeat();
    },
    enter() {
      active = true;
      heatGesture = confirmAbandon = false;
      const result = openFurnace();
      if (!result.ok) { showStorageNotice(result.error); return; }
      if (pendingCheckpoint) persist();
      else {
        save = forgeSession();
        showStorageNotice('');
      }
      sound.configure(getProgress().settings);
      stageInput?.abort();
      const entry = ++stageEntry;
      stage = null;
      webglError = false;
      setStageLoading(true);
      render();
      void mountStage(entry);
      if (save.run.phase === 'refine' && save.run.refining.step === 'cast') startHeat(false);
    },
    leave() {
      if (!active) return;
      pauseHeat();
      cancelIdleSave();
      clearTimeout(revealTimer);
      clearTimeout(revealStampTimer);
      clearTimeout(sealTimer);
      clearTimeout(messageTimer);
      clearTimeout(missTimer);
      clearTimeout(floatTimer);
      clearTimeout(phaseTimer);
      stageLoadSeq++;
      revealPending = busy = resultPause = queuedStop = false;
      delete root.dataset.swinging;
      queuedHit = undefined;
      stageInput?.abort();
      stageEntry++;
      stageModule?.releaseForgeStage(stageBox);
      stage = null;
      active = false;
    },
  };
}
