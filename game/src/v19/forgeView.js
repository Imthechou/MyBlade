import {
  LOT_SIZE, BATCHES, HEAT, fittingPrice, PHASES, GRADES, rareOdds, oreMaterialOf, MODELS, LOOKS, FITS, STAT_CAP, STAT_NAMES,
  offers, familyOf, stabilityOf, buyOre, beginRefining, advanceHeat, pourRefining, heatBand, refinementRank,
  REFINEMENT_RESULTS, REFINEMENT_FAILURES, fractureRisk, strike, finishForge,
  fitOptions, refreshFittings, signature, signaturePerk, inspectOre, mineralHeritage, oreInspection, oreModelId,
  markLamp, tapOreProbe, oreClues, clueCount, probeBudget, oreStatFocus,
} from './forge.js';
import { attachForgeStage, bindStageInput, releaseForgeStage } from './sharedStage.js';
import { createViewReset } from '../ui/viewReset.js';
import { forgeMarkup } from './forgeMarkup.js';
import { ForgeSound } from './sound.js';
import { get as getProgress } from '../core/progress.js';
import { commitFurnace, finishAppraisal, forgeSession, openFurnace } from '../core/v19Progress.js';
import { haptics, motion } from '../platform/index.js';
import { hint as showHint } from '../ui/tutorial.js';
import { countUp } from '../ui/dom.js';

const PHASE_HINTS = {
  ore: ['v19-ore', '打灯、敲石、擦窗整局各只有一次——用在最像样的那块上。'],
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
  let heatHud;
  let saveTask;
  let trayKey;
  let webglError = false;
  let inspectionMode = 'natural';
  let toolStone = '';
  let echoTimer;
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
    save = { run: result.run, credits: result.credits };
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
    const fit = FITS.find(item => item.id === run.fit);
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
    if (phase === 'ore') {
      title('挑一块原石', '第 ' + (run.batch + 1) + ' / ' + BATCHES + ' 批', ore.price > save.credits ? '余额不足，换一块原石' : '');
      readout.replaceChildren();
      actions.innerHTML = button('buy', '开石 · ' + ore.price + ' CR', { off: ore.price > save.credits }) +
        button('next-batch', '换一批', { kind: 'secondary', off: run.batch === BATCHES - 1 });
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
      title('控制炉温');
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
      title(MODELS[run.model]);
      /* 三区作用改由刀身热区 + 命中浮字表达，这里不再堆一行说明文字。 */
      get('description').replaceChildren();
      readout.innerHTML = `<div class="forge-meters"><div><span>落锤</span><b id="hit-count">${run.hits}${run.hits < 6 ? ' / 6' : ' 锤'}</b></div>
        <div><span>下一锤断率</span><b class="risk-value ${risk >= .075 ? 'alert' : ''}" id="risk">${fmt(risk)}</b>
          <div class="risk-bar"><span style="width:${risk / .9 * 100}%"></span></div></div></div>${lookChips(run)}`;
      const fallback = webglError ? '<div class="v19-zones">' + ['belly', 'edge', 'tip'].map((zone, index) =>
        button('strike-fallback', ['刀腹', '刃侧', '刀尖'][index], { id: 'strike-' + zone, kind: 'secondary' })).join('') + '</div>' : '';
      /* 收锤进度画在按钮里，不再用“第 6 锤后可收锤”整条文字解释规则。 */
      actions.innerHTML = fallback +
        `<button type="button" class="primary finish-btn" data-action="finish"${run.hits < 6 ? ' disabled' : ''}
          aria-label="${run.hits < 6 ? `收锤，还差 ${6 - run.hits} 锤` : '收锤，去装配'}">
          <span>收锤</span><i class="finish-gauge" style="--v:${Math.min(1, run.hits / 6) * 100}%" aria-hidden="true"></i>
        </button>`;
    } else if (phase === 'fit') {
      title('给刀装柄', '选 1 套');
      readout.innerHTML = fit ? `<p class="fit-detail">${fit.parts} · ${fit.delta.map((n, i) => n ? STAT_NAMES[i] + signed(n) : '').filter(Boolean).join(' · ')}</p>` : '';
      const price = fittingPrice(run);
      actions.innerHTML = button('appraise', '确认并鉴定', { off: !fit }) +
        button('refresh', run.refreshed ? '已换配件' : run.freeFitting ? '免费换一批' : '换一批 · ' + price + ' CR', { kind: 'secondary', off: run.refreshed || save.credits < price });
    } else if (phase === 'appraise') {
      const record = run.record;
      title(record?.name || '成刀已鉴定');
      if (record) {
        const perk = signaturePerk(record.signature);
        const rarity = record.rarity || 'common';
        const rare = RARE_TIERS.has(rarity);
        readout.innerHTML = `<div class="forge-result arcade-result${rare ? ' is-rare' : ''}" data-rarity="${esc(rarity)}">
          <span class="result-grade">${esc(record.grade)} · 品质 ${esc(record.quality)}</span>
          <b class="result-score"><span id="result-score">0</span><small> 分</small></b><span>+${record.credit} CR</span></div>
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
      actions.innerHTML = (record ? button('enter-tournament', '带此刀去试斩') : '') +
        button('open-collection', '藏刀阁', { kind: record ? 'secondary' : 'primary' }) +
        button('restart', '再锻一把', { kind: 'secondary' });
    } else {
      /* 失败页不再用三行文字复述同一件事：标题说结果、播报说原因、这里只画复盘刻度。 */
      title(failedRefining ? '炉次报废' : '刀身断裂');
      const review = failedRefining
        ? [['炉料损伤', Math.min(100, Math.round(run.refinement?.damage ?? 100)), 'danger'],
          ['精炼质量', Math.round(run.refinement?.quality ?? 0), '']]
        : [['落锤', run.hits, ''], ['断率', Math.round((run.last?.risk ?? 0) * 100), 'danger']];
      readout.innerHTML = `<div class="fail-review">${review.map(([label, value, tone]) =>
        `<div${tone ? ` data-tone="${tone}"` : ''}><span>${label}</span><b>${value}</b><i style="--v:${Math.min(100, value)}%"></i></div>`).join('')}</div>`;
      actions.innerHTML = button('restart', '再开一炉');
    }
    const loadSeq = ++stageLoadSeq;
    const pendingStage = stage?.sync(run, ore, fit);
    if (pendingStage?.then) {
      setStageLoading(true);
      pendingStage.finally(() => { if (loadSeq === stageLoadSeq) setStageLoading(false); });
    } else {
      setStageLoading(false);
    }
    viewReset.hidden = !stage || !['ore', 'reveal', 'forge', 'fit', 'appraise'].includes(phase);
    renderGripFocus();
    renderTools(run, ore);
    renderTray(run, fit);
    if (changedPhase) root.closest('.page').scrollTop = 0;
  }


  function setStageLoading(loading) {
    const marker = get('stage-loading');
    stageBox.dataset.loading = String(Boolean(loading));
    if (marker) marker.hidden = !loading;
  }

  function renderGripFocus() {
    const button = get('grip-focus');
    button.hidden = save.run.phase !== 'fit' || !stage || webglError;
    button.setAttribute('aria-pressed', String(Boolean(stage?.gripFocus)));
    button.querySelector('span').textContent = stage?.gripFocus ? '查看全刀' : '查看刀柄';
  }

  const CLUE_LABEL = { vein: '脉', crack: '整', grain: '密', purity: '纯' };
  const TOOL_NAME = { lamp: '打灯', tap: '敲石', window: '擦窗' };

  /** 线索芯片：未探明是「—」，探明后按信号强度点亮 1~3 格，三块石头同一位置可直接比。 */
  function paintClues(ore) {
    const host = get('ore-clues');
    if (!host) return;
    const clues = oreClues(ore);
    host.innerHTML = ['vein', 'crack', 'grain', 'purity'].map(key => {
      const clue = clues[key];
      const dots = clue ? '●'.repeat(clue.level) + '○'.repeat(3 - clue.level) : '—';
      const title = clue ? ` title="${clue.text} · 看${clue.hint}"` : ' title="还没探明"';
      return `<span class="ore-clue${clue ? ' is-on' : ''}" data-level="${clue ? clue.level : 0}"${title}><b>${CLUE_LABEL[key]}</b><i>${dots}</i></span>`;
    }).join('');
  }

  function setNote(text) {
    const note = get('inspection-note');
    const main = note?.querySelector('.ore-note-main');
    if (main) main.textContent = text;
    else if (note) note.textContent = text;
  }

  /** 工具状态：用掉了就锁死，并把「已用」写在按钮上，免得玩家以为换块石头能再用。 */
  function setTool(button, label, spent, disabled, aria) {
    const span = button.querySelector('span');
    if (span) span.textContent = spent ? label + ' · 已用' : label;
    button.dataset.spent = String(spent);
    button.disabled = disabled;
    if (aria) button.setAttribute('aria-label', aria);
  }

  function renderTools(run,ore) {
    get('ore-tools').hidden=run.phase!=='ore';
    stageBox.dataset.inspection=run.phase==='ore' ? inspectionMode : 'natural';
    if(run.phase!=='ore')return;
    const key=run.seed+'|'+ore.id;
    if(toolStone!==key){inspectionMode='natural';toolStone=key;}
    stageBox.dataset.inspection=inspectionMode;
    const checked=oreInspection(ore);
    const clues=oreClues(ore);
    const probed=clueCount(clues);
    const budget=probeBudget(run);
    const left=['lamp','tap','window'].filter(k=>budget[k]);
    /* 没打灯就不该看到透光判读——预算用在别块时，光只照亮石头，不给线索。 */
    setNote(inspectionMode === 'lamp' && clues.vein ? checked.lamp
      : clues.purity ? clues.purity.text + ' · ' + GRADES[ore.grade]
      : probed ? '已探明 ' + probed + ' / 4 条线索' + (left.length ? '' : ' · 本局用尽')
      : left.length === 3 ? '打灯 / 敲石 / 擦窗 · 整局各一次'
      : left.length ? '还剩 ' + left.map(k => TOOL_NAME[k]).join(' · ')
      : '本局探测已用尽 · 换批也不重置');
    paintClues(ore);
    root.querySelectorAll('[data-action="inspect-light"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===inspectionMode)));

    root.querySelectorAll('[data-action="inspect-light"]').forEach(button=>{
      const self=Boolean(ore.probe?.lamp);
      const locked=!budget.lamp;
      setTool(button, '打灯', locked, locked,
        self ? '这块原石已经打过灯' : locked ? '打灯本局已用在别处' : '打灯，整局只有一次');
    });
    const tapButton=root.querySelector('[data-action="tap-ore"]');
    if(tapButton){
      const locked=!budget.tap;
      setTool(tapButton, '敲石', locked, locked,
        locked ? '敲石本局已用在别处' : '敲击原石，整局只有一次，一下听出裂隙与颗粒');
    }
    const windowButton=get('window-ore');
    windowButton.disabled=ore.window || !budget.window;
    windowButton.dataset.spent=String(!budget.window && !ore.window);
    windowButton.querySelector('span').textContent=ore.window ? '已擦窗' : budget.window ? '擦窗' : '擦窗 · 已用';
    windowButton.setAttribute('aria-label', ore.window ? '这块原石已经擦窗'
      : budget.window ? '擦开一小块石皮，看清真实纯度，整局只有一次' : '擦窗本局已用在别处');
  }

  function toggleOreBlade(control) {
    const preview = stage?.toggleMineralPreview();
    control.setAttribute('aria-pressed', String(Boolean(preview)));
    control.querySelector('strong').textContent = preview ? '看切面 ›' : '看刀纹 ›';
    get('stage-hint').textContent = preview ? '横拖旋转' : '拖动看切面';
  }

  function renderTray(run, fit) {
    const { phase } = run;
    const key = [run.seed, phase, run.batch, run.selected, run.refreshed, run.fit, JSON.stringify(run.inspections), JSON.stringify(run.probes)].join('|');
    if (key === trayKey) return;
    trayKey = key;
    if (phase === 'ore') {
      const stones = offers(run);
      tray.innerHTML = `<div class="ore-grid">${stones.map((stone, index) => {
        const rock = familyOf(stone.family);
        const selected = index === run.selected;
        const odds = rareOdds(run, stone.tier);
        const windowed = Boolean(stone.window);
        const clues = oreClues(stone);
        const probed = ['vein', 'crack', 'grain', 'purity'].filter(key => clues[key]).length;
        return `<button type="button" class="ore-card ${selected ? 'is-selected' : ''}${windowed ? ' is-windowed' : ''}" data-action="select-ore" data-id="${index}" aria-pressed="${selected}"
            aria-label="${rock.name}，${stone.price} CR，矿芯概率 ${odds}%，已探明 ${probed} / 4 条线索${windowed ? '，已擦窗' : ''}">
          <span class="ore-thumbnail" style="--ore-color:${rock.color}"><img data-stone="${stone.id}" alt=""><i></i></span>
          <b class="ore-card-name">${rock.name}</b>
          <span class="ore-probes" aria-hidden="true">${['vein', 'crack', 'grain', 'purity'].map(key => `<i class="${clues[key] ? 'is-on' : ''}"></i>`).join('')}</span>
          <span class="ore-card-footer"><strong>${stone.price} CR</strong>
            <span class="ore-tier" data-tier="${stone.tier}" title="矿芯概率 ${odds}%"><i></i><i></i><i></i></span></span>
        </button>`;
      }).join('')}</div>`;
      const { batch, seed } = run;
      for (const stone of stones) stage?.oreThumbnail(stone).then(src => {
        if (!active || save.run.phase !== 'ore' || save.run.seed !== seed || save.run.batch !== batch) return;
        const img = tray.querySelector(`img[data-stone="${stone.id}"]`);
        if (img) {
          img.src = src;
          img.closest('.ore-thumbnail').classList.add('is-loaded');
        }
      }).catch(error => console.warn('Specimen preview', error));
    } else if (phase === 'fit') {
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
    const canPour = heat.step === 'molten' && heat.elapsed >= HEAT.minimum && heat.quality >= HEAT.minQuality;
    const state = [heat.step, danger, rank, paused, Boolean(heatInput?.blowing), canPour].join('|');
    if (!force && state === heatHud.state && now - heatHud.updated < 80) return;
    heatHud.state = state;
    heatHud.updated = now;
    text('heat-step', { ore: '原石升温', molten: '熔球稳温', cast: '浇注成坯' }[heat.step]);
    text('heat-number', temperature + '°');
    text('heat-clock', heat.step === 'cast' ? '浇注中' : paused ? heat.elapsed ? '待续炼' : '待点火' : Math.max(0, (heat.step === 'ore' ? HEAT.preheat : HEAT.window) - heat.elapsed).toFixed(1) + ' s');
    text('heat-target', heat.step === 'molten' ? '目标 ' + band.lower.toFixed(0) + '–' + band.upper.toFixed(0) + '°' : '');
    put('lower', band.lower.toFixed(2), value => { nodes.thermo.dataset.lower = value; });
    put('upper', band.upper.toFixed(2), value => { nodes.thermo.dataset.upper = value; });
    text('heat-rank', rank === 'failed' ? '' : outcome.label);
    text('heat-quality', String(Math.floor(heat.quality)));
    put('quality-aria', Math.floor(heat.quality), value => nodes['heat-quality-meter'].setAttribute('aria-valuenow', value));
    text('heat-damage-value', Math.round(heat.damage) + '%');
    /* 绿区本身就是目标，不再用“把炉温保持在绿区”这类句子复述；只保留真正需要立刻反应的警告。 */
    text('heat-note', paused && heat.elapsed ? '按住续炼' : danger || heat.temperature >= 95 ? '过热，松手降温' : '');
    put('temperature-aria', temperature, value => nodes.thermo.setAttribute('aria-valuenow', value));
    put('step', heat.step, value => { stageBox.dataset.heat = value; });
    put('danger', danger, value => { stageBox.dataset.danger = String(value); });
    put('heat-disabled', heat.step === 'cast', value => { nodes['heat-button'].disabled = value; });
    text('heat-button', paused && heat.elapsed ? '按住续炼' : '按住鼓风');
    put('blowing', heat.step !== 'cast' && Boolean(heatInput?.blowing), value => nodes['heat-button'].classList.toggle('heating', value));
    put('pour-disabled', !canPour, value => { nodes['pour-button'].disabled = value; });
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
        const label = REFINEMENT_RESULTS[run.refinement.result].label;
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

  const FINISH_WORDS = { metal: '质', pattern: '纹', film: '膜', fx: '光' };
  /* 没有升级到新档位时，用区域对应的产出字，保证每一锤都有可见回报。 */
  const ZONE_WORDS = { belly: '纹', edge: '膜', tip: '光' };
  const ZONE_FOCUS = { belly: '强度', edge: '锋利', tip: '灵性' };

  /** 命中浮字：贴在锤点上方，只显示“这一锤真的留下了什么”。 */
  function showHitFloat(hit, result) {
    const layer = get('stage-float');
    if (!layer || !stage || motion.reduced()) return;
    const word = result.type === 'break' ? '断裂'
      : result.type === 'scar' ? '刮痕'
        : '+' + (FINISH_WORDS[result.change?.slot] || ZONE_WORDS[hit.zone] || '');
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
    if (!hit) {
      if (save?.run.phase === 'forge' && !busy) showStageMiss();
      return;
    }
    if (save.run.phase !== 'forge' || queuedStop || pendingCheckpoint) return;
    if (busy) {
      if (stage?.blow?.landed && !resultPause) queuedHit = hit;
      return;
    }
    const result = apply(({ run }) => strike(run, hit.zone, hit.position));
    if (!result) return;
    sound.unlock();
    busy = Boolean(stage);
    resultPause = result.notable;
    const impact = () => {
      if (result.notable || result.type === 'break') queuedHit = null;
      sound.impact(result, save.run.purity);
      haptics.feedback(result.type === 'break' ? 'fracture' : result.notable ? 'trait' : 'hammer');
      stage?.impact(hit, result);
      showHitFloat(hit, result);
      render();
      if (save.run.phase === 'forge' && [.10, .25, .50].some(level => result.risk < level && fractureRisk(save.run) >= level)) {
        sound.play('tension', 1, .12);
      }
      if (result.type === 'break' || result.type === 'scar' || result.fusion || result.change) {
        say(result.fusion || result.label, result.fusion ? 'surge' : result.type);
      }
    };
    if (!stage) { impact(); return; }
    sound.play('swish');
    stage.swing(hit, result, impact, () => {
      busy = false;
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
    if (run.phase !== 'ore') return false;
    if (action === 'next-batch' && run.batch < BATCHES - 1) {
      run.batch++;
      run.selected = 0;
    } else if (action === 'select-ore' && Number.isInteger(Number(id)) && Number(id) >= 0 && Number(id) < LOT_SIZE) {
      run.selected = Number(id);
    } else return false;
    return true;
  }

  root.addEventListener('click', event => {
    if (event.target === get('save-notice') && pendingCheckpoint) {
      if (persist()) render();
      return;
    }
    const control = event.target.closest('[data-action]');
    if (!control || !active || !save?.run || pendingCheckpoint) return;
    const { action, id } = control.dataset;
    const run = save.run;
    if (busy) {
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
      case 'enter-tournament': return onArena(run.resultId);
      case 'open-collection': return onCollection();
      case 'inspect-light': {
        inspectionMode = inspectionMode === id ? 'natural' : id;
        stage?.setInspection(inspectionMode);
        if (inspectionMode !== 'natural') {
          const stone = offers(run)[run.selected];
          markLamp(save, stone.id);
          renderTray(run);
        }
        return renderTools(run, offers(run)[run.selected]);
      }
      case 'tap-ore': {
        const stone = offers(run)[run.selected];
        const tapped = tapOreProbe(save, stone.id);
        if (!tapped.added) return;
        stage?.tapOre();
        sound.inspect(stone);
        const echo = get('ore-echo');
        echo.classList.remove('is-echoing');
        void echo.offsetWidth;
        echo.classList.add('is-echoing');
        echo.style.setProperty('--ring', (.35 + stone.density / 100) + 's');
        const fresh = offers(run)[run.selected];
        renderTools(run, fresh);
        /* 一整局只敲得了一次，所以这一下同时交代裂隙与颗粒。 */
        const freshClues = oreClues(fresh);
        setNote(freshClues.crack.text + ' · ' + freshClues.grain.text);
        paintClues(fresh);
        renderTray(run);
        clearTimeout(echoTimer);
        echoTimer = setTimeout(() => {
          echo.classList.remove('is-echoing');
          if (save.run.phase === 'ore') renderTools(save.run, offers(save.run)[save.run.selected]);
        }, 1500);
        return;
      }
      case 'window-ore':
        if (!apply(inspectOre)) return;
        inspectionMode = 'window';
        stage?.setInspection('window');
        sound.play('polish', .75);
        break;
      case 'preview-mineral': return toggleOreBlade(control);
      case 'select-ore':
      case 'next-batch':
        if (!apply(({ run }) => selectOre(run, action, id))) return;
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
        startHeat(false);
        sound.play('cast');
        return;
      case 'finish': return closeAnvil();
      case 'strike-fallback': return hitBlade({ zone: control.id.slice(7) });
      case 'focus-grip':
        stage.setGripFocus(!stage.gripFocus);
        return renderGripFocus();
      case 'select-fit':
        if (!apply(({ run }) => {
          if (run.phase !== 'fit' || !fitOptions(run).some(item => item.id === id)) return false;
          run.fit = run.fit === id ? null : id;
          return true;
        })) return;
        break;
      case 'refresh':
        if (!apply(refreshFittings)) return;
        sound.play('polish');
        break;
      case 'appraise':
        if (!apply(finishAppraisal)) return;
        sound.play('appraise');
        say(save.run.record.grade + ' · ' + save.run.record.score, 'surge');
        break;
      case 'restart': {
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
    if (action === 'select-fit') tray.querySelector('[aria-pressed="true"]')?.focus({ preventScroll: true });
  });

  root.addEventListener('pointerdown', event => {
    if (event.target.id !== 'heat-button' || !event.isPrimary) return;
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
    if (event.target.id === 'heat-button') {
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

  return {
    pause() {
      if (save?.run.refining?.step !== 'cast') pauseHeat();
    },
    enter() {
      active = true;
      const result = openFurnace();
      if (!result.ok) { showStorageNotice(result.error); return; }
      if (pendingCheckpoint) persist();
      else {
        save = forgeSession();
        showStorageNotice('');
      }
      sound.configure(getProgress().settings);
      stageInput?.abort();
      try {
        const stones = save.run.phase === 'ore' ? offers(save.run) : [];
        const models = stones.length ? [stones[save.run.selected], ...stones].map(oreModelId) : [];
        stage = attachForgeStage(stageBox, models);
        stageInput = new AbortController();
        bindStageInput(stage, {
          signal: stageInput.signal,
          enabled: () => active && ['ore', 'reveal', 'forge', 'fit', 'appraise'].includes(save.run.phase),
          canAdjust: () => !busy,
          reset: resetView,
          onTap: event => {
            if (save.run.phase === 'forge') hitBlade(stage.hit(event.clientX, event.clientY));
          },
        });
        webglError = false;
      } catch {
        stage = null;
        webglError = true;
      }
      render();
      if (save.run.phase === 'refine' && save.run.refining.step === 'cast') startHeat(false);
    },
    leave() {
      if (!active) return;
      pauseHeat();
      cancelIdleSave();
      clearTimeout(revealTimer);
      clearTimeout(revealStampTimer);
      clearTimeout(sealTimer);
      clearTimeout(echoTimer);
      clearTimeout(messageTimer);
      clearTimeout(missTimer);
      clearTimeout(floatTimer);
      clearTimeout(phaseTimer);
      stageLoadSeq++;
      revealPending = busy = resultPause = queuedStop = false;
      queuedHit = undefined;
      stageInput?.abort();
      releaseForgeStage(stageBox);
      active = false;
    },
  };
}
