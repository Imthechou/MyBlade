import {
  WINDOW_PRICE, LOT_SIZE, BATCHES, HEAT, fittingPrice, PHASES, GRADES, rareOdds, oreMaterialOf, MODELS, LOOKS, FITS, STAT_NAMES,
  offers, familyOf, stabilityOf, buyOre, beginRefining, advanceHeat, pourRefining, heatBand, refinementRank,
  REFINEMENT_RESULTS, REFINEMENT_FAILURES, fractureRisk, strike, finishForge,
  fitOptions, refreshFittings, signature, signaturePerk, inspectOre, mineralHeritage, oreInspection, oreModelId,
} from './forge.js';
import { attachForgeStage, bindStageInput, createBladeTools, releaseForgeStage } from './sharedStage.js';
import { forgeMarkup } from './forgeMarkup.js';
import { ForgeSound } from './sound.js';
import { get as getProgress } from '../core/progress.js';
import { commitFurnace, finishAppraisal, forgeSession, openFurnace } from '../core/v19Progress.js';
import { haptics } from '../platform/index.js';

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
  let pendingCheckpoint = false;
  let stage;
  let busy = false;
  let queuedHit;
  let queuedStop = false;
  let resultPause = false;
  let revealPending = false;
  let heatInput;
  let heatHud;
  let saveTask;
  let trayKey;
  let webglError = false;
  let inspectionMode = 'natural';
  let toolStone = '';
  let echoTimer;
  const resetView = () => {
    if (!stage || busy) return;
    stage.resetView();
    renderGripFocus();
  };
  const viewTools = createBladeTools({
    zoom: factor => { if (!busy) stage?.zoomBy(factor); },
    reset: resetView,
  });
  viewTools.hidden = true;
  get('stage-hint').after(viewTools);
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
    const failedRefining = run.last?.type === 'refine-fail';
    const navPhase = phase === 'reveal' ? 'ore' : phase === 'broken' ? failedRefining ? 'refine' : 'forge' : phase;
    const idx = PHASES.indexOf(navPhase);
    const ore = phase === 'ore' ? offers(run)[run.selected] : run.ore;
    const fit = FITS.find(item => item.id === run.fit);
    stageBox.dataset.mode = phase;
    if (phase !== 'refine') stageBox.dataset.danger = 'false';
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
        readout.innerHTML = '<div class="ore-suspense-track" aria-label="切面揭晓中"><i></i></div>';
        actions.innerHTML = button('to-refine', '切开中…', { off: true });
      } else {
        const heritage = mineralHeritage(ore);
        title(familyOf(ore.family).name, GRADES[ore.grade] + '矿芯', oreMaterialOf(ore).name);
        readout.innerHTML = `<div class="mineral-meters">
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
      title(MODELS[run.model], '', '刀腹塑纹 · 刃侧上色 · 刀尖生光');
      readout.innerHTML = `<div class="forge-meters"><div><span>落锤</span><b id="hit-count">${run.hits}${run.hits < 6 ? ' / 6' : ' 锤'}</b></div>
        <div><span>下一锤断率</span><b class="risk-value ${risk >= .075 ? 'alert' : ''}" id="risk">${fmt(risk)}</b>
          <div class="risk-bar"><span style="width:${risk / .9 * 100}%"></span></div></div></div>${lookChips(run)}`;
      const fallback = webglError ? '<div class="v19-zones">' + ['belly', 'edge', 'tip'].map((zone, index) =>
        button('strike-fallback', ['刀腹', '刃侧', '刀尖'][index], { id: 'strike-' + zone, kind: 'secondary' })).join('') + '</div>' : '';
      actions.innerHTML = fallback + button('finish', run.hits < 6 ? '第 6 锤后可收锤' : '收锤，去装配', { off: run.hits < 6 });
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
        readout.innerHTML = `<div class="forge-result"><span class="result-grade">${esc(record.grade)} · 品质 ${esc(record.quality)}</span>
          <b>${esc(record.score)} <small>分</small></b><span>+${record.credit} CR</span></div>
          <div class="stat-list">${record.stats.map((n, i) => `<div class="stat"><span>${STAT_NAMES[i]}</span><b>${Number(n)}</b><span class="stat-track"><i style="width:${Number(n)}%"></i></span></div>`).join('')}</div>
          ${perk ? `<p class="fit-detail">${esc(perk.desc)}</p>` : ''}`;
      } else readout.replaceChildren();
      actions.innerHTML = (record ? button('enter-tournament', '带此刀去试斩') : '') +
        button('open-collection', '藏刀阁', { kind: record ? 'secondary' : 'primary' }) +
        button('restart', '再锻一把', { kind: 'secondary' });
    } else {
      title(failedRefining ? '精炼失败' : '刀身断裂', '', failedRefining ? REFINEMENT_FAILURES[run.refinement.reason] : '第 ' + run.hits + ' 锤 · 断率 ' + fmt(run.last.risk));
      readout.replaceChildren();
      actions.innerHTML = button('restart', '再开一炉');
    }
    stage?.sync(run, ore, fit);
    viewTools.hidden = !stage || !['reveal', 'forge', 'fit', 'appraise'].includes(phase);
    viewTools.dataset.zoom = String(Boolean(stage?.canZoom));
    renderGripFocus();
    renderTools(run, ore);
    renderTray(run, fit);
    if (changedPhase) root.closest('.page').scrollTop = 0;
  }


  function renderGripFocus() {
    const button = get('grip-focus');
    button.hidden = save.run.phase !== 'fit' || !stage || webglError;
    button.setAttribute('aria-pressed', String(Boolean(stage?.gripFocus)));
    button.querySelector('span').textContent = stage?.gripFocus ? '查看全刀' : '查看刀柄';
  }

  function renderTools(run,ore) {
    get('ore-tools').hidden=run.phase!=='ore';
    stageBox.dataset.inspection=run.phase==='ore' ? inspectionMode : 'natural';
    if(run.phase!=='ore')return;
    const key=run.seed+'|'+ore.id;
    if(toolStone!==key){inspectionMode='natural';toolStone=key;}
    stageBox.dataset.inspection=inspectionMode;
    const checked=oreInspection(ore);
    get('inspection-note').textContent = inspectionMode === 'lamp' ? checked.lamp : ore.window ? '擦窗见到局部矿相' : '拖动看石';
    root.querySelectorAll('[data-action="inspect-light"]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.id===inspectionMode)));
    const windowButton=get('window-ore');
    windowButton.disabled=ore.window || save.credits<ore.price+WINDOW_PRICE;
    windowButton.querySelector('span').innerHTML=ore.window ? '已擦窗' : '擦窗 <small>'+WINDOW_PRICE+' CR</small>';
    windowButton.setAttribute('aria-label',ore.window ? '这块原石已经擦窗' : '擦开一小块石皮，花费'+WINDOW_PRICE+'信用点');
  }

  function toggleOreBlade(control) {
    const preview = stage?.toggleMineralPreview();
    control.setAttribute('aria-pressed', String(Boolean(preview)));
    control.querySelector('strong').textContent = preview ? '看切面 ›' : '看刀纹 ›';
    get('stage-hint').textContent = preview ? '横拖旋转' : '拖动看切面';
    viewTools.dataset.zoom = String(Boolean(preview));
  }

  function renderTray(run, fit) {
    const { phase } = run;
    const key = [run.seed, phase, run.batch, run.selected, run.refreshed, run.fit, JSON.stringify(run.inspections)].join('|');
    if (key === trayKey) return;
    trayKey = key;
    if (phase === 'ore') {
      const stones = offers(run);
      tray.innerHTML = `<div class="ore-grid">${stones.map((stone, index) => {
        const rock = familyOf(stone.family);
        const selected = index === run.selected;
        return `<button type="button" class="ore-card ${selected ? 'is-selected' : ''}" data-action="select-ore" data-id="${index}" aria-pressed="${selected}">
          <span class="ore-thumbnail" style="--ore-color:${rock.color}"><img data-stone="${stone.id}" alt=""><i></i></span>
          <b class="ore-card-name">${rock.name}</b>
          <span class="ore-card-footer"><strong>${stone.price} CR</strong><span>${stone.window ? '已擦窗' : '稀质 ' + rareOdds(run, stone.tier) + '%'}</span></span>
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
    msg.className = 'stage-message ' + type;
    msg.textContent = text;
    void msg.offsetWidth;
    msg.classList.add('show');
    get('announcer').textContent = text;
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
    text('heat-note', paused && heat.elapsed ? '按住续炼' : heat.step === 'ore' ? '鼓风升到 65°' : heat.step === 'cast' ? '熔钢入模' :
      heat.temperature >= 82 ? '过热，松手降温' : heat.temperature <= 58 ? '温度偏低，继续鼓风' :
        green ? (canPour ? '可以浇注' : '稳住绿区') : '把炉温保持在绿区');
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
        const result = label + (run.phase === 'broken' ? ' · 炉次报废' : ' · 纯净 ' + signed(difference));
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

  function hitBlade(hit) {
    sound.configure(getProgress().settings);
    if (!hit || save.run.phase !== 'forge' || queuedStop || pendingCheckpoint) return;
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
      case 'inspect-light':
        inspectionMode = inspectionMode === id ? 'natural' : id;
        stage?.setInspection(inspectionMode);
        return renderTools(run, offers(run)[run.selected]);
      case 'tap-ore': {
        const stone = offers(run)[run.selected];
        stage?.tapOre();
        sound.inspect(stone);
        const echo = get('ore-echo');
        echo.classList.remove('is-echoing');
        void echo.offsetWidth;
        echo.classList.add('is-echoing');
        echo.style.setProperty('--ring', (.35 + stone.density / 100) + 's');
        get('inspection-note').textContent = stone.density >= 70 ? '叩声清亮 · 余音较长' : stone.density < 49 ? '叩声低闷 · 余音短' : '叩声偏实 · 回音适中';
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
      case 'buy':
        if (!apply(buyOre)) return;
        revealPending = Boolean(stage);
        sound.play('ore');
        stage?.reveal();
        if (revealPending) revealTimer = setTimeout(() => {
          if (!active || save.run.phase !== 'reveal') return;
          revealPending = false;
          render();
          const ore = save.run.ore;
          sound.play(ore.grade === 2 ? 'surge' : 'shift');
          say(GRADES[ore.grade] + '矿芯 · 纯净 ' + ore.purity, ore.grade === 2 ? 'surge' : '');
        }, 1050);
        break;
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
      clearTimeout(echoTimer);
      revealPending = busy = resultPause = queuedStop = false;
      queuedHit = undefined;
      stageInput?.abort();
      releaseForgeStage(stageBox);
      active = false;
    },
  };
}
