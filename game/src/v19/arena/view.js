import {
  TARGET_NAMES, SCHOOLS, GRADIENTS, EVENTS, PROJECTS, APEX_GOAL, bladeCount, bladeId, eligibleBlades, gate, roundNames,
  tournamentState, createEntry, courseFor, summarizeRound, settleRound, abandonEntry, dayKey, rankOf, RANKS,
  masteryOf, NATIONAL_UNLOCK,
} from '../tournament.js';
import { goalText } from './courses.js';
import { arenaBladeStats } from './stats.js';
import { createTrial, warmTrialAudio } from './trial.js';
import { targetThumbnail, warmTargets } from './targets.js';
import { mountBladeThumbnail, disconnectBladeThumbnails } from '../collectionThumb.js';
import { countUp, sheet } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const practiceStyles = { mix: '混合', row: '连斩', heavy: '重劈' };
const button = (action, label, kind = 'secondary', attrs = '') =>
  `<button class="${kind}" type="button" data-arena-action="${action}" ${attrs}>${label}</button>`;
const selectButton = (action, value, label, active, disabled = false, cleared = false) =>
  button(action, label + (cleared ? '<span aria-label="已通过">✓</span>' : ''), 'arena-choice',
    `data-value="${value}" aria-pressed="${active}" ${disabled ? 'disabled' : ''}`);
const symbol = name => icon(name).outerHTML;
const art = (key, attrs = '') => `<img src="${targetThumbnail(key)}" alt="" ${attrs}>`;
const eventId = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);

export function mountTournament(root, { getSave, commit, settings, onLegacy, onForge, onSettings, hasLegacyCareer }) {
  const entry = { mode: 'quick', school: 'edge', grade: 0, style: 'mix', material: '' };
  const page = root.closest('.page');
  let solo, practice, lineup = [];
  let notice = '', confirming = false;
  let bout, engine, replay, picker;

  const state = () => tournamentState(getSave());
  const currentBlades = () => eligibleBlades(getSave());
  const selectedIds = () => entry.mode === 'apex' ? lineup :
    [entry.mode === 'practice' ? practice : solo].filter(Boolean);

  function syncSelection(blades, preferred) {
    const ids = blades.map(bladeId);
    if (entry.mode === 'apex') {
      lineup = [...new Set([...lineup, ...ids])].filter(id => ids.includes(id)).slice(0, bladeCount(entry));
    } else if (entry.mode === 'practice') {
      const wanted = preferred ?? practice ?? solo;
      practice = wanted === 'training' || ids.includes(wanted) ? wanted : ids[0] ?? 'training';
    } else {
      const wanted = preferred ?? solo;
      solo = ids.includes(wanted) ? wanted : ids[0];
    }
  }

  const previewCourse = (round = 0) => courseFor({ ...entry, id: 'preview', reports: Array(round) });
  const bladeArt = id => `<span class="arena-blade-art" data-thumb-blade="${esc(id)}" aria-hidden="true">${symbol('spark')}</span>`;
  const profileText = blade => {
    const { power, control, art } = arenaBladeStats(blade.stats);
    return `<span title="强度与锋利">破坏 <b>${power}</b></span><span title="韧性与工艺">控制 <b>${control}</b></span>
      <span title="设计与灵性">表现 <b>${art}</b></span>`;
  };

  function bladeFields(blades, data, course) {
    const ids = selectedIds();
    const rounds = entry.mode === 'apex' ? roundNames('apex') : [];
    return `<div class="arena-blades">
      ${ids.map((id, slot) => {
        const blade = blades.find(item => bladeId(item) === id);
        const mastery = blade && masteryOf({ tournament: data }, blade);
        const specialty = rounds.length ? previewCourse(slot).specialty : course?.specialty;
        const suited = mastery && specialty === mastery.specialty;
        return `<div class="arena-loadout-item">
          ${rounds.length ? `<div class="arena-loadout-round"><b>${esc(rounds[slot])}</b>
            <span>${PROJECTS[specialty].name}专长${suited ? ' · 已匹配' : ''}</span></div>` : ''}
          ${button('choose-blade', `${bladeArt(id)}<span class="arena-blade-copy"><b>${esc(blade?.name ?? '工坊试刀')}</b>
            <small>${mastery ? mastery.level + ' · ' + mastery.project + '专长' : '借用'}${!rounds.length && suited ? ' · 适合本轮' : ''}</small></span>
            <span class="arena-change">${blade ? '换刀' : '选刀'} ${symbol('next')}</span>`, 'arena-blade-select', `data-slot="${slot}"`)}
          ${blade && !rounds.length ? `<div class="arena-blade-profile" aria-label="参赛刀能力">${profileText(blade)}</div>` : ''}
        </div>`;
      }).join('')}
    </div>`;
  }

  function goalCard(data) {
    const [school, cleared] = Object.entries(data.schools).filter(([key, value]) => SCHOOLS[key] && value > 0)
      .sort((a, b) => b[1] - a[1])[0] || ['edge', 0];
    if (cleared < NATIONAL_UNLOCK) {
      return button('mode', `<span>下一目标</span><b>${SCHOOLS[school].name} · 通关${GRADIENTS[NATIONAL_UNLOCK - 1]}</b>${symbol('next')}`,
        'arena-goal', `data-value="school" data-school="${school}"`);
    }
    const mode = data.titles.national ? 'apex' : 'national';
    const goal = mode === 'national' ? '全国大赛 · 夺冠' : data.titles.apex ? '巅峰赛 · 再战' : '巅峰赛 · 夺冠';
    return button('mode', `<span>下一目标</span><b>${goal}</b>${symbol('next')}`, 'arena-goal', `data-value="${mode}"`);
  }

  function activeCard(active) {
    if (!active) return '';
    const rounds = roundNames(active.mode).length;
    return `<section class="arena-active">
      <div class="arena-active-copy"><span>进行中${rounds ? ' · 第 ' + (active.reports.length + 1) + ' / ' + rounds + ' 轮' : ''}</span>
        <b>${esc(courseFor(active).title)}</b></div>
      ${button('continue', '继续赛程', 'primary')}
      ${button('abandon', confirming ? '取消' : '结束', 'arena-text')}
      ${confirming ? `<div class="arena-confirm"><span>已结算的奖励会保留</span>${button('confirm-abandon', '确认结束', 'arena-text')}</div>` : ''}
    </section>`;
  }

  function progressPanel(data) {
    const rank = rankOf(data.rating);
    const nextAt = RANKS[rank.index + 1]?.at;
    return `<details class="arena-details arena-progress">
      <summary>赛事进度 <span>${esc(rank.name)} · ${rank.rating}</span></summary>
      <div class="arena-progress-content">
        <div class="arena-rank">
          <div class="arena-rank-head"><b>${esc(rank.name)}</b><span>${nextAt ? '距 ' + esc(rank.next) + ' ' + rank.toNext : '最高段位'}</span></div>
          <div class="arena-rank-track" role="progressbar" aria-label="段位进度" aria-valuenow="${Math.round(rank.progress * 100)}"><i style="--v:${Math.round(rank.progress * 100)}%"></i></div>
        </div>
        ${goalCard(data)}
        ${data.history.length ? `<h2>近期战报</h2>${data.history.slice(0, 6).map((record, index) => button('history',
          `<span>${esc(record.title)}</span><b>${esc(record.report.score)} 分</b>${symbol('next')}`, 'arena-history-row', `data-value="${index}"`)).join('')}` : ''}
      </div>
    </details>`;
  }

  function eventLink(mode, target, description = '', status = '') {
    return button('mode', `<span class="arena-event-art" aria-hidden="true">${art(target)}</span>
      <span class="arena-event-copy"><b>${EVENTS[mode].name}</b><small>${description || EVENTS[mode].sub}</small></span>
      ${status ? `<span class="arena-event-status">${status}</span>` : symbol('next')}`,
    'arena-event-link', `data-value="${mode}"`);
  }

  function renderHome(data, blades) {
    const loan = !blades.length;
    const dailyDone = Boolean(data.daily[dayKey()]?.rewarded);
    const legacy = hasLegacyCareer();
    const keys = ['card', 'rope', 'bamboo'];
    const nationalReady = Object.values(data.schools).some(value => value >= NATIONAL_UNLOCK);
    const apexReady = data.titles.national && blades.length >= 3;
    warmTargets(keys);
    return `<section class="arena-home">
      ${activeCard(data.active)}
      <section class="arena-quick">
        <header class="arena-hero">
          <div class="arena-hero-heading">
            <span>${loan ? '12 秒试刀' : '30 秒飞靶'}</span>
            <h1 tabindex="-1">${loan ? '斩试场' : '自由快赛'}</h1>
            ${data.best.flightQuick ? `<small>个人最高 <b>${data.best.flightQuick}</b></small>` : ''}
          </div>
          <div class="arena-hero-art" aria-hidden="true">${keys.map(key => art(key)).join('')}</div>
        </header>
        <div class="arena-launch">
          ${!loan && !data.active && !legacy ? bladeFields(blades, data) : ''}
          ${data.active ? button('loan', '借刀练习', 'secondary') :
            legacy ? button('legacy-career', '继续旧赛程', 'primary') :
            loan ? `<div class="arena-actions">${button('forge', '去锻刀')}${button('loan', '借刀开斩', 'primary')}</div>` :
            button('register', '开始快赛', 'primary')}
        </div>
      </section>
      <nav class="arena-casual" aria-label="日常赛事">
        ${eventLink('daily', 'ice', dailyDone ? '今日已领奖' : '30 秒 · 固定靶序')}
        ${eventLink('practice', 'pineapple')}
      </nav>
      <section class="arena-advanced" aria-labelledby="arena-advanced-title">
        <h2 id="arena-advanced-title">进阶赛</h2>
        ${eventLink('school', 'bamboo')}
        ${eventLink('national', 'steel', nationalReady ? '' : '任一流派通关能手解锁', nationalReady ? '' : '未解锁')}
        ${eventLink('apex', 'shield', data.titles.national ? '' : '全国大赛夺冠解锁', apexReady ? '' : '未解锁')}
      </section>
      ${!loan || data.history.length ? progressPanel(data) : ''}
    </section>`;
  }

  function schoolOptions(data) {
    const cleared = data.schools[entry.school] ?? 0;
    return `<div class="arena-school-fields">
      <div class="arena-options-label">流派</div>
      <div class="arena-choices arena-schools" role="group" aria-label="流派">${Object.entries(SCHOOLS).map(([key, school]) =>
        selectButton('school', key, school.name, entry.school === key)).join('')}</div>
      <div class="arena-options-label">阶位</div>
      <div class="arena-choices arena-grades" role="group" aria-label="试炼阶位">${GRADIENTS.map((name, grade) =>
        selectButton('grade', grade, name, entry.grade === grade, grade > cleared, grade < cleared)).join('')}</div>
    </div>`;
  }

  function practiceOptions() {
    return `<div class="arena-choices arena-practice-styles" role="group" aria-label="练习方式">${Object.entries(practiceStyles).map(([id, label]) =>
      selectButton('style', id, label, entry.style === id && !entry.material)).join('')}</div>
      ${button('choose-material', `<span>练习靶具</span><b>${entry.material ? TARGET_NAMES[entry.material] : '按练习方式出靶'}</b>${symbol('next')}`, 'arena-goal')}`;
  }

  function courseNotes(course) {
    const rounds = roundNames(entry.mode);
    const task = course.goals.length ? `<div class="arena-course-rule"><b>${esc(course.focus)}</b>
      <span>${course.goals.map(goalText).join(' · ')}</span></div>` : '';
    if (rounds.length) {
      return `${task}<details class="arena-details"><summary>${rounds.length} 轮赛程</summary>
        <ol>${rounds.map((label, i) => `<li>${esc(label)} · ${PROJECTS[previewCourse(i).specialty].name}专长</li>`).join('')}</ol>
        ${entry.mode === 'apex' ? '<small>全轮达标且总评 ≥ ' + APEX_GOAL + '</small>' : ''}</details>`;
    }
    if (entry.mode === 'daily') return '<p class="arena-course-meta">当日固定靶序 · 首场有效奖励</p>';
    return task;
  }

  function renderDetail(data, blades) {
    const course = previewCourse();
    const reason = gate(getSave(), entry);
    const active = entry.mode !== 'practice' && data.active;
    const daily = data.daily[dayKey()];
    const targets = [...new Set(course.waves.flatMap(wave => wave.targets))].slice(0, 3);
    const title = entry.mode === 'school' ? course.title : EVENTS[entry.mode].name;
    const action = active ? button('continue', '继续赛程', 'primary') :
      !reason ? button('register', entry.mode === 'practice' ? '开始练习' : '开斩', 'primary') :
      !blades.length ? button('forge', '去锻第一把刀', 'primary') :
      button('lobby', '返回大厅', 'secondary');
    warmTargets(course.waves[0].targets);
    return `<section class="arena-detail">
      <div class="arena-detail-scroll">
        <header class="arena-detail-head">
          <div><h1 tabindex="-1">${esc(title)}</h1>
            <span>${course.limit} 秒${entry.mode === 'daily' && daily?.rewarded ? ' · 今日已领奖' :
              entry.mode === 'daily' && daily?.flightBest ? ' · 最高 ' + daily.flightBest : ''}</span></div>
          <div class="arena-course-art" aria-hidden="true">${targets.map(key => art(key)).join('')}</div>
        </header>
        ${entry.mode === 'school' ? schoolOptions(data) : entry.mode === 'practice' ? practiceOptions() : ''}
        ${courseNotes(course)}
        ${active ? `<p class="arena-lock">进行中 · ${esc(courseFor(active).title)}</p>` : reason ? `<p class="arena-lock">${esc(reason)}</p>` : bladeFields(blades, data, course)}
      </div>
      <footer class="arena-dock">${action}</footer>
    </section>`;
  }

  function renderLobby(preferred) {
    const data = state();
    const blades = currentBlades();
    syncSelection(blades, preferred);
    root.dataset.screen = entry.mode === 'quick' ? 'lobby' : 'detail';
    disconnectBladeThumbnails();
    root.innerHTML = `${notice ? `<p class="arena-alert" role="status">${esc(notice)}</p>` : ''}
      ${entry.mode === 'quick' ? renderHome(data, blades) : renderDetail(data, blades)}`;
    mountBladeArts(blades);
    if (settings().sound !== false && settings().volume > 0) warmTrialAudio();
  }

  function refreshLobby() {
    const previous = root.querySelector('.arena-detail-scroll') ?? page;
    const scroll = previous.scrollTop;
    renderLobby();
    const next = root.querySelector('.arena-detail-scroll') ?? page;
    next.scrollTop = scroll;
  }

  function openPicker(title, markup, trigger, select) {
    if (picker) return null;
    const body = document.createElement('div');
    body.className = 'arena-picker v19-surface';
    body.innerHTML = markup;
    body.addEventListener('click', event => {
      const item = event.target.closest('[data-picker-value]');
      if (!item) return;
      select(item.dataset.pickerValue);
      refreshLobby();
      picker?.close();
    });
    picker = sheet({ title, body, onClose: () => { picker = null; },
      returnFocus: () => page.classList.contains('is-active') ? root.querySelector(trigger) : null });
    return body;
  }

  function chooseBlade(slot) {
    const save = getSave();
    const blades = eligibleBlades(save);
    const ids = selectedIds();
    const multi = entry.mode === 'apex';
    const specialty = entry.mode === 'quick' ? null : previewCourse(slot).specialty;
    const row = (id, name, meta, profile) => `<button type="button" class="arena-picker-blade" data-picker-value="${esc(id)}"
        aria-pressed="${id === ids[slot]}">${bladeArt(id)}<span class="arena-blade-copy"><b>${esc(name)}</b>
        <small>${esc(meta)}</small>${profile ? `<span class="arena-picker-profile">${profile}</span>` : ''}</span>
        ${id === ids[slot] ? symbol('check') : symbol('next')}</button>`;
    const options = [
      entry.mode === 'practice' ? row('training', '工坊试刀', '借用') : '',
      ...blades.map(blade => {
        const id = bladeId(blade);
        const assigned = ids.indexOf(id);
        const mastery = masteryOf(save, blade);
        const order = multi && assigned >= 0 ? ` · 第 ${assigned + 1} 轮` : '';
        const suited = specialty === mastery.specialty ? ' · 适合本轮' : '';
        return row(id, blade.name, mastery.level + ' · ' + mastery.project + '专长' + order + suited, profileText(blade));
      }),
    ];
    const body = openPicker(multi ? `第 ${slot + 1} 轮出战刀` : '选择出战刀', options.join(''),
      `[data-arena-action="choose-blade"][data-slot="${slot}"]`, id => {
        if (multi) {
          const other = lineup.indexOf(id);
          if (other >= 0) lineup[other] = lineup[slot];
          lineup[slot] = id;
        } else if (entry.mode === 'practice') practice = id;
        else solo = id;
      });
    if (body) mountBladeArts(blades, body);
  }

  function chooseMaterial() {
    const options = Object.entries(TARGET_NAMES).map(([key, name]) => `<button type="button" class="arena-picker-target"
      data-picker-value="${key}" aria-pressed="${key === entry.material}">${art(key, 'loading="lazy"')}<span>${name}</span></button>`);
    options.unshift(`<button type="button" class="arena-picker-target all-targets" data-picker-value="" aria-pressed="${!entry.material}">按练习方式出靶</button>`);
    openPicker('选择练习靶具', `<div class="arena-target-picker">${options.join('')}</div>`, '[data-arena-action="choose-material"]',
      value => { entry.material = value; });
  }

  /** 给刀卡补上真实刀模；未出图前保留底色占位，不会出现空白洞。 */
  function mountBladeArts(blades, container = root) {
    container.querySelectorAll('[data-thumb-blade]').forEach(host => {
      const blade = blades.find(item => bladeId(item) === host.dataset.thumbBlade);
      if (!blade?.visual) {
        host.dataset.state = 'fallback';
        return;
      }
      mountBladeThumbnail(host, { v19Visual: blade.visual, bladeName: blade.name });
    });
  }

  function closeBout() {
    engine?.destroy();
    engine = null;
    bout = null;
  }

  function scrollTop() {
    page.scrollTop = 0;
    root.querySelector('h1, h2')?.focus({ preventScroll: true });
  }

  function prepare(run) {
    closeBout();
    disconnectBladeThumbnails();
    const course = courseFor(run);
    const selected = run.roster[run.mode === 'apex' ? run.reports.length : 0];
    const blade = { ...selected, mastery: masteryOf(getSave(), selected) };
    const current = bout = { run, course, bladeName: blade.name };
    const rounds = roundNames(run.mode);
    root.dataset.screen = 'play';
    root.innerHTML = `
      <section class="arena-match" aria-label="${esc(course.title)}">
        <header class="trial-hud">
          <div><small>得分</small><b data-trial="score">0000</b><em data-trial="delta"></em></div>
          <div><small${course.limit === 30 ? ' data-trial="phase"' : ''}>${course.limit === 30 ? '热身' : '剩余'}</small><b data-trial="time">${course.limit}″</b></div>
          <div><small>连斩</small><b data-trial="combo">—</b></div>
          ${button('pause', symbol('pause'), 'round-pause', 'aria-label="暂停" title="暂停"')}
          <progress class="trial-timer" data-trial="timer" max="${course.limit}" value="${course.limit}" aria-label="剩余时间"></progress>
        </header>
        <div class="trial-frame" data-act="0">
          <canvas tabindex="0" aria-label="${esc(blade.name)}。手指滑过飞靶。键盘空格横斩，数字键选斩。"></canvas>
          <div class="trial-ready" data-trial-ready hidden><b>开斩</b><span>${esc(course.focus || '滑过飞靶，一刀多斩')}</span></div>
          <div class="trial-verdict"><span data-trial="verdict" class="cut-callout"></span></div>
          <div class="trial-cover" data-cover hidden></div>
        </div>
        <footer class="trial-bottom">
          ${course.goals.map((goal, i) => `<div class="trial-goal" aria-label="${esc(goalText(goal))}">
            <span>${esc(goal.label)} <b data-trial="goal-${i}"></b></span>
            ${goal.id === 'durability' ? '<progress data-trial="wear" aria-label="刀刃耐久" max="100" value="100"></progress>' : ''}
          </div>`).join('')}
          ${course.wearScale && !course.goals.some(goal => goal.id === 'durability') ? `<div class="trial-goal trial-wear">
            <span>刀刃耐久 <b data-trial="durability">100%</b></span>
            <progress data-trial="wear" aria-label="刀刃耐久" max="100" value="100"></progress>
          </div>` : ''}
          <div class="trial-cut-count${course.goals.length ? ' sr-only' : ''}"><span>斩断 <b data-trial="hits">0</b></span></div>
          ${rounds.length ? `<span class="trial-round" aria-label="第 ${run.reports.length + 1} 轮，共 ${rounds.length} 轮">${run.reports.length + 1}/${rounds.length}</span>` : ''}
        </footer>
      </section>`;
    scrollTop();
    try {
      engine = createTrial(root.querySelector('.trial-frame'), course, blade, {
        hud: root.querySelector('.arena-match'),
        muted: settings().sound === false, volume: settings().volume, onPause: () => showPause(current),
        onFinish: result => finish(current, result),
      });
      focusCanvas();
      engine.start();
    } catch (error) {
      console.warn('[arena] 画布初始化失败', error);
      setCover(`<h3 id="trial-cover-title">切割舞台暂不可用</h3>${button('lobby', '返回大厅', 'primary')}`);
    }
  }

  function setCover(content) {
    const cover = root.querySelector('[data-cover]');
    cover.innerHTML = `<div class="trial-card" role="dialog" aria-modal="true" aria-labelledby="trial-cover-title">${content}</div>`;
    cover.hidden = false;
    root.querySelector('.round-pause').disabled = true;
    root.querySelector('canvas').inert = true;
    cover.querySelector('button')?.focus({ preventScroll: true });
  }

  function showPause(current) {
    const { run, course, bladeName } = current;
    setCover(`<h3 id="trial-cover-title">比赛暂停</h3>
      <p>${esc(course.title)} · ${esc(bladeName)}</p>
      ${button('resume', '继续挥刀', 'primary')}
      <div class="arena-actions">${button('lobby', '返回大厅')}${button('settings', '设置')}</div>
      ${run.mode === 'practice' ? '' : '<small>返回大厅后，本轮需重新开始。</small>'}`);
  }

  function resume() {
    root.querySelector('[data-cover]').hidden = true;
    root.querySelector('.round-pause').disabled = false;
    root.querySelector('canvas').inert = false;
    focusCanvas();
    engine.resume(settings());
  }

  function focusCanvas() {
    root.querySelector('canvas')?.focus({ preventScroll: true });
  }

  function finish(current, result) {
    if (current !== bout) return;
    if (current.run.mode === 'practice') {
      const report = summarizeRound(current.course, result);
      return renderReport({ mode: 'practice', done: true, title: report.title, report }, current.run);
    }
    const reply = commit(draft => settleRound(draft, current.run.id, current.run.reports.length, result));
    if (reply.error) {
      current.result = result;
      setCover(`<h3 id="trial-cover-title">战报暂未保存</h3><p>${esc(reply.error)}</p>
        ${button('retry-report', '重试保存', 'primary')}${button('lobby', '返回大厅')}`);
      return;
    }
    renderReport(reply.record, current.run);
  }

  function renderReport(record, run) {
    if (!record) return;
    closeBout();
    const { report, mode } = record;
    const casual = ['practice', 'quick', 'daily'].includes(mode);
    const active = state().active;
    const canContinue = active && active.id === record.id;
    const heading = record.champion ? (mode === 'national' ? '全国冠军' : '巅峰冠军') :
      mode === 'practice' ? '试刀结束' : casual ? '本局结束' :
      !record.done ? (mode === 'national' ? '获胜晋级' : '本轮结束') :
      mode === 'national' ? '本届止步' : mode === 'apex' ? '巅峰赛结束' : report.win ? '试炼通过' : '试炼待破';
    const nextGrade = run && mode === 'school' && report.win && run.grade < GRADIENTS.length - 1 ? run.grade + 1 : null;
    replay = run && (casual || mode === 'school') ? {
      plan: { mode, style: run.style, material: run.material, school: run.school, grade: nextGrade ?? run.grade },
      ids: run.roster.filter(blade => blade.id !== 'training').map(bladeId),
    } : null;
    const reason = casual ? (report.reason === 'wear' ? '刀刃耐久耗尽' : record.paidDaily ? '今日奖励已领取' :
      !record.qualified && mode !== 'practice' ? '斩断 4 个靶具即可获得成长奖励' : '') :
      mode === 'apex' && record.done && !record.champion ? '全轮达标且总评 ≥ ' + APEX_GOAL + ' 分夺冠' :
      !report.win ? (report.reason === 'wear' ? '耐久耗尽' : '本轮目标未达成') : '';
    root.dataset.screen = 'report';
    const shownScore = casual ? report.score : report.performance;
    const bestProject = (report.projects || []).filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)[0];
    const showMultiplier = report.cut > 0 && Number.isFinite(report.scoreMultiplier);
    const hasDetails = bestProject || record.rank?.gain || showMultiplier || record.rounds?.length > 1;
    const borrow = mode === 'practice' && !currentBlades().length;
    const mainAction = canContinue ? button('continue', '进入下一轮', 'primary') :
      record.unlockedNational ? button('mode', '报名全国赛', 'primary', 'data-value="national"') :
        borrow ? button('forge', '去锻第一把刀', 'primary') :
          replay ? button('replay', nextGrade === null ? '再来一局' : '挑战下一阶', 'primary') : '';
    root.innerHTML = `<section class="arena-report">
      <div class="arena-report-scroll">
      <header class="arena-result-header">
        <div class="arena-result-title">
          <span>${esc(record.title)}</span><h2 tabindex="-1">${heading}</h2>
          ${Number.isFinite(record.best) && shownScore > record.best
            ? `<p class="arena-best">${record.best ? '刷新纪录 · +' + (shownScore - record.best) : '创下个人纪录'}</p>`
            : record.best ? `<p>个人最高 ${record.best}</p>` : ''}
        </div>
        <div class="arena-result-score">
          <div class="arena-score-line"><strong data-report-score>0</strong>
            ${report.medal ? `<b class="arena-medal" data-medal="${esc(report.medal)}" aria-label="${esc(report.medal)}级评价">${esc(report.medal)}</b>` : ''}
          </div>
          <small>${casual ? '本局得分' : '评定分 / 1000'}</small>
        </div>
      </header>
      ${reason ? `<p class="arena-report-hint">${reason}</p>` : ''}
      <div class="arena-result-metrics"><div><b>${report.cut}</b><span>斩断</span></div>
        ${Number.isFinite(report.swipe) ? `<div><b>${report.swipe}</b><span>一刀最多</span></div>` : ''}
        <div><b>×${report.combo}</b><span>最高连斩</span></div>
        ${report.tracksWear && !report.goals?.some(goal => goal.id === 'durability') ? `<div><b>${Math.floor(report.durability)}%</b><span>剩余耐久</span></div>` : ''}
      </div>
      ${report.goals?.length ? `<div class="arena-report-goals">${report.goals.map(goal => `<div data-met="${goal.met}">
        <span>${esc(goal.label)}</span><b>${esc(goal.value)}${esc(goal.unit)} / ${esc(goal.target)}${esc(goal.unit)} ${goal.met ? '✓' : ''}</b>
      </div>`).join('')}</div>` : ''}
      ${record.cr || record.xp ? `<div class="report-rewards">${record.cr ? `<b>+${record.cr} CR</b>` : ''}
        ${record.xp ? `<b>工坊 +${record.xp} XP</b>` : ''}
        ${record.streakBonus ? `<span class="is-hot">连胜 ×${record.streak} · +${record.streakBonus} CR</span>` : ''}</div>` : ''}
      ${record.mastery ? `<div class="arena-blade-growth${record.mastery.leveled ? ' is-up' : ''}">
        <div class="arena-blade-growth-head"><span>${esc(record.blade)} · ${esc(record.mastery.level)}</span><b>+${record.masteryGain} XP</b></div>
        <div class="arena-rank-track" aria-label="刀具成长进度"><i style="--v:${Math.round(record.mastery.progress * 100)}%"></i></div>
        <small>${record.mastery.leveled ? '熟练度升级 · ' : ''}${esc(record.mastery.project)}专长 +${Math.round(record.mastery.bonus * 100)}%
          ${record.mastery.nextLevel ? ' · 距' + esc(record.mastery.nextLevel) + ' ' + (record.mastery.nextXp - record.mastery.xp) + ' XP' : ''}</small>
        ${record.swipeBonus ? `<small>达成一刀 ${report.swipe} 斩 · 内含里程碑 +${record.swipeBonus} XP</small>` : ''}
        ${record.mastery.swipeGoal ? `<p class="arena-next-swipe">下次目标 <b>一刀斩断 ${record.mastery.swipeGoal.count} 靶</b><span>+${record.mastery.swipeGoal.xp} XP</span></p>` : ''}
      </div>` : ''}
      ${record.workshop?.gained ? `<div class="arena-workshop-growth">
        <span>工坊 Lv.${record.workshop.level}${record.workshop.leveled ? ' · 升级' : ''}</span>
        ${record.workshop.leveled && !canContinue && !record.unlockedNational ? button('forge', '去锻刀', 'arena-text') :
          `<b>${record.workshop.nextXp ? `再获 ${record.workshop.nextXp - record.workshop.xp} XP${record.workshop.nextPerk ? ' · ' + esc(record.workshop.nextPerk) : ''}` : '已满级'}</b>`}
      </div>` : ''}
      ${borrow ? '<p class="arena-report-hint">锻出第一把刀，即可报名 30 秒快赛。</p>' : ''}
      ${hasDetails ? `<details class="arena-details arena-report-details">
        <summary>战报详情</summary><div>
      ${showMultiplier ? `<p class="arena-report-hint">
        灵性得分 ×${report.scoreMultiplier.toFixed(2)}${report.deflections > 0 ? ' · 弹刀 ' + report.deflections + ' 次' : ''}
      </p>` : ''}
      ${bestProject ? `<div class="arena-best-cut"><span>表现最佳</span><b>${esc(bestProject.name)}</b><strong>${bestProject.score}%</strong></div>` : ''}
      ${record.rank?.gain ? `<div class="arena-rank-gain${record.rank.levelUp ? ' is-up' : ''}">
        <div class="arena-rank-gain-head"><span>赛事评级</span><b>${record.rank.before}</b><i aria-hidden="true">›</i><b>${record.rank.after}</b><em>+${record.rank.gain}</em></div>
        <div class="arena-rank-track" aria-hidden="true"><i style="--v:${Math.round((record.rank.progress ?? 0) * 100)}%"></i></div>
        <div class="arena-rank-foot"><span>${record.rank.levelUp ? '升段 · ' + esc(record.rank.to) : '下一段 ' + esc(record.rank.next || '')}</span>${record.rank.next ? `<b>还差 ${record.rank.toNext}</b>` : '<b>MAX</b>'}</div>
      </div>` : ''}
      ${record.rounds?.length > 1 ? `<div class="arena-round-result"><span>总评</span><b>${record.total}${mode === 'apex' ? ' / ' + APEX_GOAL : ''}</b></div>
        ${record.rounds.map(item => `<div class="arena-round-result"><span>${esc(item.title)}</span><b>${item.win ? '' : '未达标 · '}${item.performance}</b></div>`).join('')}` : ''}
        </div></details>` : ''}
      </div>
      <footer class="arena-dock report-actions">
        ${borrow && replay ? button('replay', '再试一次') : button('lobby', '返回大厅', mainAction ? 'secondary' : 'primary')}
        ${mainAction}
      </footer>
    </section>`;
    countUp(root.querySelector('[data-report-score]'), 0, shownScore, 660);
    scrollTop();
  }

  function register(plan, ids) {
    const { run, error } = plan.mode === 'practice' ? createEntry(getSave(), plan, ids, eventId()) :
      commit(draft => createEntry(draft, plan, ids, eventId()));
    if (run) return prepare(run);
    notice = error || '报名未完成，请重试';
    renderLobby();
  }

  function chooseSchool(id) {
    entry.school = id;
    entry.grade = Math.min(GRADIENTS.length - 1, state().schools[id] || 0);
  }

  function showLobby() {
    closeBout();
    entry.mode = 'quick';
    confirming = false;
    renderLobby();
    scrollTop();
  }

  root.addEventListener('keydown', event => {
    const cover = root.querySelector('[data-cover]:not([hidden])');
    if (event.key === 'Escape') {
      if (cover?.querySelector('[data-arena-action="resume"]')) {
        event.preventDefault();
        resume();
      } else if (engine?.pause()) event.preventDefault();
    }
    if (event.key === 'Tab' && cover) {
      const buttons = [...cover.querySelectorAll('button:not(:disabled)')];
      const first = buttons[0], last = buttons.at(-1);
      if ((event.shiftKey && event.target === first) || (!event.shiftKey && event.target === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    }
  });

  root.addEventListener('click', event => {
    const target = event.target.closest('[data-arena-action]');
    if (!target) return;
    const { arenaAction: action, value } = target.dataset;
    notice = '';
    switch (action) {
      case 'legacy-career': return onLegacy();
      case 'forge': return onForge();
      case 'settings': return onSettings();
      case 'loan': return register({ mode: 'practice', style: 'mix' }, []);
      case 'choose-blade': return chooseBlade(Number(target.dataset.slot));
      case 'choose-material': return chooseMaterial();
      case 'register': return register({ ...entry }, selectedIds().filter(id => id !== 'training'));
      case 'replay': if (replay) return register(replay.plan, replay.ids); return;
      case 'mode':
        if (value === 'school') chooseSchool(target.dataset.school || entry.school);
        entry.mode = value;
        renderLobby();
        return scrollTop();
      case 'school': chooseSchool(value); break;
      case 'grade': entry.grade = Number(value); break;
      case 'style': entry.style = value; entry.material = ''; break;
      case 'continue': {
        const active = state().active;
        confirming = false;
        if (active) return prepare(active);
        break;
      }
      case 'abandon': confirming = !confirming; break;
      case 'confirm-abandon': {
        const id = state().active?.id;
        const result = commit(draft => abandonEntry(draft, id) ? {} : { error: '这场比赛已结束' });
        confirming = false;
        notice = result.error || '';
        break;
      }
      case 'pause': return engine?.pause();
      case 'resume': return resume();
      case 'retry-report': return finish(bout, bout.result);
      case 'history': return renderReport(state().history[Number(value)]);
      case 'lobby': return showLobby();
      default: return;
    }
    refreshLobby();
    root.querySelector(`[data-arena-action="${action}"]${value == null ? '' : `[data-value="${value}"]`}`)?.focus({ preventScroll: true });
  });

  return {
    open({ bladeId: preferred, mode = 'quick' } = {}) {
      closeBout();
      entry.mode = Object.hasOwn(EVENTS, mode) ? mode : 'quick';
      confirming = false;
      notice = '';
      renderLobby(preferred);
      scrollTop();
    },
    back() {
      if (!['detail', 'report'].includes(root.dataset.screen)) return false;
      showLobby();
      return true;
    },
    leave() { picker?.close(); closeBout(); },
    pause: () => engine?.pause(),
  };
}
