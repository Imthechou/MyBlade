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
import { countUp } from '../../ui/dom.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);
const seriesModes = { school: '流派试炼', national: '全国赛', apex: '巅峰赛' };
const practiceStyles = { mix: '混合', row: '连斩', heavy: '重劈' };
const button = (action, label, kind = 'secondary', attrs = '') =>
  `<button class="${kind}" type="button" data-arena-action="${action}" ${attrs}>${label}</button>`;
const selectButton = (action, value, label, active, disabled = false) =>
  button(action, label, 'arena-choice', `data-value="${value}" aria-pressed="${active}" ${disabled ? 'disabled' : ''}`);
const art = (key, attrs = '') => `<img src="${targetThumbnail(key)}" alt="" ${attrs}>`;
const eventId = () => globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2);

export function mountTournament(root, { getSave, commit, settings, onLegacy, onForge, hasLegacyCareer }) {
  const entry = { mode: 'quick', school: 'edge', grade: 0, style: 'mix', material: '' };
  let chosen = [];
  let notice = '', confirming = false;
  let bout, engine, replay;

  const state = () => tournamentState(getSave());
  const isFormal = () => Object.hasOwn(seriesModes, entry.mode);
  const currentBlades = () => eligibleBlades(getSave());

  function syncSelection(preferred) {
    const ids = currentBlades().map(bladeId);
    if (entry.mode === 'practice' && (preferred ?? chosen[0]) === 'training') {
      chosen = ['training'];
      return;
    }
    const valid = [preferred, ...chosen, ...ids].filter(id => ids.includes(id));
    chosen = [...new Set(valid)].slice(0, bladeCount(entry));
    if (!chosen.length && entry.mode === 'practice') chosen = ['training'];
  }

  /**
   * 出战刀选择：不再用原生下拉框（只有一行字），改成带真实刀模的卡。
   * 单刀赛点一下即选；三刀赛（巅峰）点选切换，最多三把。
   */
  function bladeFields(blades, data, course) {
    const count = bladeCount(entry);
    const multi = count > 1;
    const specialties = multi ? roundNames(entry.mode).map((_, i) =>
      courseFor({ ...entry, id: 'preview', reports: Array(i) }).specialty) : [course?.specialty];
    const selected = !multi && blades.find(blade => bladeId(blade) === chosen[0]);
    const profile = selected && arenaBladeStats(selected.stats);
    const card = (id, name, meta, on, locked, mastered = 0, suited = false) => `<button type="button" class="arena-blade-card${on ? ' is-picked' : ''}${suited ? ' is-suited' : ''}"
      data-arena-action="pick-blade" data-value="${esc(id)}" aria-pressed="${on}"${locked ? ' disabled' : ''}${mastered ? ` data-mastery="${mastered}"` : ''}>
      <span class="arena-blade-art" data-thumb-blade="${esc(id)}"><i class="arena-blade-fallback" aria-hidden="true"></i></span>
      <b>${esc(name)}</b><span class="arena-blade-meta">${esc(meta)}</span>
    </button>`;
    return `<div class="arena-blades">
      <div class="arena-blades-head"><span>出战刀</span>${multi ? `<b>已选 ${chosen.filter(id => id !== 'training').length} / ${count}</b>` : ''}</div>
      <div class="arena-blade-row">
        ${entry.mode === 'practice' ? card('training', '工坊试刀', '借用 · 68 分', chosen[0] === 'training', false) : ''}
        ${blades.map(blade => {
          const id = bladeId(blade);
          const on = chosen.includes(id);
          const locked = multi && !on && chosen.filter(item => item !== 'training').length >= count;
          const mastery = masteryOf({ tournament: data }, blade);
          const slot = multi ? on ? chosen.indexOf(id) : chosen.length : 0;
          const suited = specialties[slot] === mastery.specialty;
          const order = multi && on ? '第' + (chosen.indexOf(id) + 1) + '轮 · ' : '';
          return card(id, blade.name,
            `${order}${mastery.level} · ${mastery.project}专长${suited ? ' · 适合本轮' : ''}`,
            on, locked, mastery.levelIndex, suited);
        }).join('')}
      </div>
      ${profile ? `<div class="arena-blade-profile" aria-label="参赛刀能力">
        <span title="强度与锋利">破坏 <b>${profile.power}</b></span>
        <span title="韧性与工艺">控制 <b>${profile.control}</b></span>
        <span title="设计与灵性">表现 <b>${profile.art}</b></span>
      </div>` : ''}
    </div>`;
  }

  /**
   * 下一目标：把「段位 → 流派阶位 → 全国赛 → 巅峰赛」串成一条线，
   * 大厅不再只是"再打一局"，而是"再打几局能解锁什么"。
   */
  function goalCard(data) {
    const [school, cleared] = Object.entries(data.schools).filter(([key, value]) => SCHOOLS[key] && value > 0)
      .sort((a, b) => b[1] - a[1])[0] || ['edge', 0];
    const goal = cleared < NATIONAL_UNLOCK
      ? { action: 'school', school, label: '下一站', title: `${SCHOOLS[school].name} · 通关${GRADIENTS[NATIONAL_UNLOCK - 1]}`,
        value: cleared / NATIONAL_UNLOCK, step: `${cleared} / ${NATIONAL_UNLOCK} 阶` }
      : !data.titles.national
        ? { action: 'national', label: '下一站', title: '全国大赛 · 夺冠', value: 0, step: '已解锁' }
        : { action: 'apex', label: '下一站', title: '三刀巅峰赛',
          value: data.titles.apex ? 1 : 0, step: data.titles.apex ? '已夺冠' : '已解锁' };
    return `<button type="button" class="arena-goal" data-arena-action="mode" data-value="${goal.action}"${goal.school ? ` data-school="${goal.school}"` : ''}>
      <div class="arena-goal-head"><span>${goal.label}</span><b>${esc(goal.step)}</b></div>
      <div class="arena-goal-title">${esc(goal.title)}</div>
      <div class="arena-rank-track" aria-hidden="true"><i style="--v:${Math.round(goal.value * 100)}%"></i></div>
    </button>`;
  }
  function rankBlock(data) {
    const rank = rankOf(data.rating);
    /* 五段阶梯本身是主题内容，但以前只看得到「当前段」和「下一段」。
       补一行全段路径，玩家能看清自己在整条路上的位置。 */
    const nextAt = RANKS[rank.index + 1]?.at ?? null;
    const steps = RANKS.map((item, i) =>
      `<span class="${i === rank.index ? 'is-now' : i < rank.index ? 'is-done' : ''}">${esc(item.name)}</span>`).join('');
    return `<section class="arena-rank" data-tier="${rank.index}">
      <div class="arena-rank-head"><b>${esc(rank.name)}</b><span>${nextAt ? `评级 ${rank.rating} / ${nextAt}` : `评级 ${rank.rating} · 顶阶`}</span></div>
      <div class="arena-rank-track" aria-label="距离 ${esc(rank.next || '顶阶')} 还需 ${rank.toNext}">
        ${rank.progress > 0 ? `<i style="--v:${Math.round(rank.progress * 100)}%"></i>` : ''}
      </div>
      <div class="arena-rank-steps" aria-hidden="true">${steps}</div>
      <div class="arena-rank-foot"><span>${rank.next ? '下一段 ' + esc(rank.next) : '已达顶阶'}</span>${rank.next ? `<b>还差 ${rank.toNext}</b>` : '<b>MAX</b>'}</div>
    </section>`;
  }

  function activeCard(active) {
    if (!active) return '';
    return `<section class="arena-active">
      <div><span>进行中</span><b>${esc(courseFor(active).title)}</b></div>
      ${button('continue', '继续比赛', 'primary')}
      ${button('abandon', confirming ? '取消' : '结束', 'arena-text')}
      ${confirming ? `<div class="arena-confirm"><span>已结算的奖励会保留</span>${button('confirm-abandon', '确认结束', 'arena-text')}</div>` : ''}
    </section>`;
  }

  function historyList(data) {
    if (!data.history.length) return '';
    return `<details class="arena-details arena-history"><summary>近期战报</summary>
      ${data.history.slice(0, 6).map((record, index) => button('history',
        `<span>${esc(record.title)}</span><b>${record.report.score} 分</b>`,
        'arena-history-row', `data-value="${index}"`)).join('')}
    </details>`;
  }

  function renderHome(data, blades) {
    const loan = !blades.length;
    const dailyDone = Boolean(data.daily[dayKey()]?.rewarded);
    const workshop = getSave().workshop;
    const keys = ['card', 'rope', 'bamboo'];
    warmTargets(keys);
    return `<section class="arena-home">
      ${activeCard(data.active)}
      <header class="arena-hero">
        <div class="arena-hero-heading">
          <span class="arena-chip">${loan ? '12 秒试刀' : '30 秒快赛'}</span>
          <span class="arena-chip">工坊 Lv.${workshop.level}</span>
          ${data.streak >= 2 ? `<span class="arena-chip" data-hot="true">连胜 ×${data.streak}</span>` : ''}
          ${data.best.flightQuick ? `<span class="arena-chip">最高 ${data.best.flightQuick}</span>` : ''}
          <h1 tabindex="-1">斩试场</h1>
        </div>
        <div class="arena-hero-art" aria-hidden="true">${keys.map(key => art(key)).join('')}</div>
      </header>
      <div class="arena-launch">
        ${!loan ? bladeFields(blades, data) : ''}
        ${loan ? button('loan', '借刀开斩', 'primary') :
          data.active ? button('loan', '借刀练习') : button('register', '开始快赛', 'primary')}
      </div>
      <nav class="arena-shortcuts" aria-label="更多赛事">
        ${button('mode', '<b>进阶赛</b><span aria-hidden="true">↗</span>', 'arena-shortcut', 'data-value="series"')}
        ${button('mode', `<b>每日</b><span aria-hidden="true">${dailyDone ? '✓' : '↗'}</span>`, 'arena-shortcut',
          `data-value="daily"${dailyDone ? ' data-done="true"' : ''}`)}
        ${button('mode', '<b>练习</b><span aria-hidden="true">↗</span>', 'arena-shortcut', 'data-value="practice"')}
      </nav>
      ${!loan ? goalCard(data) + rankBlock(data) : ''}
      ${hasLegacyCareer() ? button('legacy-career', '继续旧赛程', 'arena-text') : ''}
      ${historyList(data)}
    </section>`;
  }

  function renderSeries() {
    const artKeys = ['bamboo', 'steel', 'shield'];
    return `<section class="arena-detail">
      <header class="arena-detail-head">
        ${button('mode', '‹ 大厅', 'arena-text', 'data-value="quick"')}
        <h1 tabindex="-1">进阶赛</h1>
      </header>
      <nav class="arena-series" aria-label="进阶赛类型">
        ${Object.entries(seriesModes).map(([mode, label], index) => button('mode',
          `${art(artKeys[index])}<b>${label}</b><span aria-hidden="true">›</span>`, 'arena-series-entry', `data-value="${mode}"`)).join('')}
      </nav>
    </section>`;
  }

  function seriesOptions(data) {
    if (entry.mode !== 'school') return '';
    const cleared = data.schools[entry.school] ?? 0;
    return `<div class="arena-school-fields"><label class="arena-select"><span>流派</span>
      <select data-arena-choice="school" aria-label="流派">${Object.entries(SCHOOLS).map(([key, school]) =>
        `<option value="${key}" ${entry.school === key ? 'selected' : ''}>${school.name}</option>`).join('')}</select>
      </label>
      <label class="arena-select"><span>阶位</span>
        <select data-arena-choice="grade" aria-label="试炼阶位">${GRADIENTS.map((name, grade) =>
          `<option value="${grade}" ${entry.grade === grade ? 'selected' : ''} ${grade > cleared ? 'disabled' : ''}>${name}${grade < cleared ? ' ✓' : ''}</option>`).join('')}</select>
      </label></div>`;
  }

  function practiceOptions() {
    return `<div class="arena-choices" aria-label="练习方式">${Object.entries(practiceStyles).map(([id, label]) =>
      selectButton('style', id, label, entry.style === id && !entry.material)).join('')}</div>
      <details class="arena-details" ${entry.material ? 'open' : ''}><summary>${entry.material ? TARGET_NAMES[entry.material] : '自选靶具'}</summary>
      <div class="arena-target-picker">${Object.entries(TARGET_NAMES).map(([key, name]) => selectButton(
        'material', key, art(key, 'loading="lazy"') + `<span>${name}</span>`, key === entry.material)).join('')}</div></details>`;
  }

  function courseNotes(course) {
    const list = roundNames(entry.mode);
    const task = course.goals.length ? `<div class="arena-course-rule"><b>${esc(course.focus)}</b>
      <span>${course.limit} 秒 · ${course.goals.map(goalText).join(' · ')}</span></div>` : '';
    if (list.length) {
      return `${task}<details class="arena-details"><summary>${list.length} 轮赛程</summary>
        <ol>${list.map((label, i) => {
          const { specialty } = courseFor({ ...entry, id: 'preview', reports: Array(i) });
          return `<li>${esc(label)} · ${PROJECTS[specialty].name}专长</li>`;
        }).join('')}</ol>
        <small>${entry.mode === 'national' ? '一把刀，逐轮晋级' : '三把刀各打一轮，全达标且总评 ≥ ' + APEX_GOAL}</small></details>`;
    }
    if (entry.mode === 'daily') return '<div class="arena-course-meta">30 秒 · 当日固定靶序 · 首场有效奖励</div>';
    return task;
  }

  function renderDetail(data, blades) {
    const course = courseFor({ ...entry, id: 'preview', reports: [] });
    const reason = gate(getSave(), entry);
    const blocked = data.active && entry.mode !== 'practice';
    const bestDaily = data.daily[dayKey()]?.flightBest;
    const targets = [...new Set(course.waves.flatMap(wave => wave.targets))].slice(0, 3);
    warmTargets(course.waves[0].targets);
    return `<section class="arena-detail">
      <header class="arena-detail-head">
        ${button('mode', isFormal() ? '‹ 进阶赛' : '‹ 大厅', 'arena-text', `data-value="${isFormal() ? 'series' : 'quick'}"`)}
        <h1 tabindex="-1">${seriesModes[entry.mode] || EVENTS[entry.mode].name}</h1>
      </header>
      ${isFormal() ? seriesOptions(data) : entry.mode === 'practice' ? practiceOptions() : ''}
      <div class="arena-event">
        <div class="arena-event-title">
          <div><h2>${entry.mode === 'school' ? course.title : entry.mode === 'practice' ? '12 秒试斩' : entry.mode === 'daily' ? '今日挑战' : '赛前准备'}</h2>
            ${entry.mode === 'daily' && bestDaily ? `<span>最高 ${bestDaily}</span>` : ''}</div>
          <div class="arena-course-art" aria-hidden="true">${targets.map(key => art(key)).join('')}</div>
        </div>
        ${courseNotes(course)}
        ${reason ? `<p class="arena-lock">${esc(reason)}</p>` : bladeFields(blades, data, course)}
        ${blocked ? button('continue', '继续比赛', 'primary') : !reason ? button('register', '开斩', 'primary') :
          !blades.length ? button('forge', '去锻刀', 'primary') : ''}
      </div>
      ${entry.mode === 'daily' ? '<a class="arena-text arena-daily-link" href="#/daily">今日工坊目标 ›</a>' : ''}
    </section>`;
  }

  function renderLobby() {
    const data = state();
    const blades = currentBlades();
    root.dataset.screen = entry.mode === 'quick' ? 'lobby' : 'detail';
    disconnectBladeThumbnails();
    root.innerHTML = `${notice ? `<p class="arena-alert" role="status">${esc(notice)}</p>` : ''}
      ${entry.mode === 'quick' ? renderHome(data, blades) : entry.mode === 'series' ? renderSeries() : renderDetail(data, blades)}`;
    mountBladeArts(blades);
    if (settings().sound !== false && settings().volume > 0) warmTrialAudio();
  }

  /** 给刀卡补上真实刀模；未出图前保留底色占位，不会出现空白洞。 */
  function mountBladeArts(blades) {
    root.querySelectorAll('[data-thumb-blade]').forEach(host => {
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
    root.closest('.page').scrollTop = 0;
    root.querySelector('h1, h2')?.focus({ preventScroll: true });
  }

  function prepare(run) {
    closeBout();
    disconnectBladeThumbnails();
    const course = courseFor(run);
    const selected = run.roster[run.mode === 'apex' ? run.reports.length : 0];
    const blade = { ...selected, mastery: masteryOf(getSave(), selected) };
    const current = bout = { run, course };
    const rounds = roundNames(run.mode);
    root.dataset.screen = 'play';
    root.innerHTML = `
      <div class="arena-round-head">
        <h2 tabindex="-1">${esc(course.title)}</h2>
        <span class="arena-active-blade" title="${esc(blade.name)}">${esc(blade.name)}</span>
        ${rounds.length ? `<span class="arena-round-index">${run.reports.length + 1} / ${rounds.length}</span>` : ''}
        ${button('pause', '暂停', 'quiet round-pause')}
      </div>
      <div class="trial-frame" data-act="0">
        <canvas tabindex="0" aria-label="挥刀舞台。手指滑过飞靶。键盘空格横斩，数字键选斩。"></canvas>
        <div class="trial-hud">
          <div><small>得分</small><b data-trial="score">0000</b><em data-trial="delta"></em></div>
          <div><small>剩余</small><b data-trial="time">${course.limit}″</b></div>
          <div><small>连斩</small><b data-trial="combo">—</b></div>
        </div>
        <div class="trial-ready" data-trial-ready hidden><b>开斩</b><span>${esc(course.focus || '滑过飞靶，一刀多斩')}</span></div>
        <div class="trial-verdict"><span data-trial="verdict" class="cut-callout"></span></div>
        ${course.limit === 30 ? '<div class="trial-phase" data-trial="phase"></div>' : ''}
        <div class="trial-bottom">
          ${course.goals.map((goal, i) => `<div class="trial-goal" aria-label="${esc(goalText(goal))}">
            <span>${esc(goal.label)} <b data-trial="goal-${i}"></b></span>
            ${goal.id === 'durability' ? '<progress data-trial="wear" aria-label="刀刃耐久" max="100" value="100"></progress>' : ''}
          </div>`).join('')}
          ${course.wearScale && !course.goals.some(goal => goal.id === 'durability') ? `<div class="trial-goal trial-wear">
            <span>刀刃耐久 <b data-trial="durability">100%</b></span>
            <progress data-trial="wear" aria-label="刀刃耐久" max="100" value="100"></progress>
          </div>` : ''}
          <div class="trial-cut-count"><span>斩断 <b data-trial="hits">0</b></span></div>
        </div>
        <div class="trial-cover" data-cover hidden></div>
      </div>`;
    scrollTop();
    try {
      engine = createTrial(root.querySelector('.trial-frame'), course, blade, {
        muted: settings().sound === false, volume: settings().volume, onPause: showPause,
        onFinish: result => finish(current, result),
      });
      focusCanvas();
      engine.start();
    } catch (error) {
      console.warn('[arena] 画布初始化失败', error);
      setCover(`<h3>切割舞台暂不可用</h3>${button('lobby', '返回大厅', 'primary')}`);
    }
  }

  function setCover(content) {
    const cover = root.querySelector('[data-cover]');
    cover.innerHTML = `<div class="trial-card">${content}</div>`;
    cover.hidden = false;
    root.querySelector('.round-pause').hidden = true;
    cover.querySelector('button')?.focus({ preventScroll: true });
  }

  function showPause() {
    setCover(`<h3>比赛暂停</h3>${button('resume', '继续挥刀', 'primary')}${button('lobby', '返回大厅')}`);
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
      setCover(`<h3>战报暂未保存</h3><p>${esc(reply.error)}</p>
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
    const borrow = mode === 'practice' && !currentBlades().length;
    const mainAction = canContinue ? button('continue', '进入下一轮', 'primary') :
      record.unlockedNational ? button('mode', '报名全国赛', 'primary', 'data-value="national"') :
        borrow ? button('forge', '去锻第一把刀', 'primary') :
          replay ? button('replay', nextGrade === null ? '再来一局' : '挑战下一阶', 'primary') : '';
    root.innerHTML = `<section class="arena-report">
      <header><span>${esc(record.title)}</span><h2 tabindex="-1">${heading}</h2>
        <div class="arena-score-line">
          <strong><span data-report-score>0</span></strong>
          ${report.medal ? `<b class="arena-medal" data-medal="${esc(report.medal)}" aria-label="${esc(report.medal)}级评价">${esc(report.medal)}</b>` : ''}
        </div>
        <small>${casual ? '本局得分' : '评定分 / 1000'}</small>
        ${Number.isFinite(record.best) && shownScore > record.best
          ? `<p class="arena-best is-new">${record.best ? '刷新纪录 · +' + (shownScore - record.best) : '创下个人纪录'}</p>`
          : record.best ? `<p class="arena-best">个人最高 <b>${record.best}</b></p>` : ''}
        ${reason ? `<p>${reason}</p>` : ''}
      </header>
      <div class="arena-result-metrics"><div><b>${report.cut}</b><span>斩断</span></div>
        ${Number.isFinite(report.swipe) ? `<div><b>${report.swipe}</b><span>一刀最多</span></div>` : ''}
        <div><b>×${report.combo}</b><span>最高连斩</span></div>
        ${report.tracksWear && !report.goals?.some(goal => goal.id === 'durability') ? `<div><b>${Math.floor(report.durability)}%</b><span>剩余耐久</span></div>` : ''}
      </div>
      ${report.cut > 0 && Number.isFinite(report.scoreMultiplier) ? `<p class="arena-report-hint">
        灵性得分 ×${report.scoreMultiplier.toFixed(2)}${report.deflections > 0 ? ' · 弹刀 ' + report.deflections + ' 次' : ''}
      </p>` : ''}
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
        <b>${record.workshop.nextXp ? `再获 ${record.workshop.nextXp - record.workshop.xp} XP${record.workshop.nextPerk ? ' · ' + esc(record.workshop.nextPerk) : ''}` : '已满级'}</b>
      </div>` : ''}
      ${borrow ? '<p class="arena-report-hint">锻出第一把刀，即可报名 30 秒快赛。</p>' : ''}
      <div class="report-actions">
        ${mainAction}
        ${borrow ? button('replay', '再试一次') : record.workshop?.leveled && !canContinue && !record.unlockedNational ? button('forge', '去锻刀') : ''}
        ${button('lobby', '返回大厅', mainAction ? 'secondary' : 'primary')}
      </div>
      ${bestProject ? `<div class="arena-best-cut"><span>表现最佳</span><b>${esc(bestProject.name)}</b><strong>${bestProject.score}%</strong></div>` : ''}
      ${record.rank?.gain ? `<div class="arena-rank-gain${record.rank.levelUp ? ' is-up' : ''}">
        <div class="arena-rank-gain-head"><span>赛事评级</span><b>${record.rank.before}</b><i aria-hidden="true">›</i><b>${record.rank.after}</b><em>+${record.rank.gain}</em></div>
        <div class="arena-rank-track" aria-hidden="true"><i style="--v:${Math.round((record.rank.progress ?? 0) * 100)}%"></i></div>
        <div class="arena-rank-foot"><span>${record.rank.levelUp ? '升段 · ' + esc(record.rank.to) : '下一段 ' + esc(record.rank.next || '')}</span>${record.rank.next ? `<b>还差 ${record.rank.toNext}</b>` : '<b>MAX</b>'}</div>
      </div>` : ''}
      ${record.rounds?.length > 1 ? `<details class="arena-details"><summary>总评 ${record.total}${mode === 'apex' ? ' / ' + APEX_GOAL : ''}</summary>
        ${record.rounds.map(item => `<div class="arena-round-result"><span>${esc(item.title)}</span><b>${item.win ? '' : '未达标 · '}${item.performance}</b></div>`).join('')}</details>` : ''}
    </section>`;
    requestAnimationFrame(() => countUp(root.querySelector('[data-report-score]'), 0, shownScore, 820));
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

  root.addEventListener('change', event => {
    const { arenaChoice } = event.target.dataset;
    if (!['school', 'grade'].includes(arenaChoice)) return;
    if (arenaChoice === 'school') chooseSchool(event.target.value);
    else entry.grade = Number(event.target.value);
    renderLobby();
    root.querySelector(`[data-arena-choice="${arenaChoice}"]`)?.focus({ preventScroll: true });
  });

  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && engine?.pause()) event.preventDefault();
  });

  root.addEventListener('click', event => {
    const target = event.target.closest('[data-arena-action]');
    if (!target) return;
    const { arenaAction: action, value } = target.dataset;
    notice = '';
    switch (action) {
      case 'legacy-career': return onLegacy();
      case 'forge': return onForge();
      case 'loan': return register({ mode: 'practice', style: 'mix' }, []);
      case 'pick-blade': {
        const limit = bladeCount(entry);
        const current = chosen.filter(item => item !== 'training');
        if (limit === 1) chosen = [value];
        else if (chosen.includes(value)) chosen = current.filter(item => item !== value);
        else if (current.length < limit) chosen = [...current, value];
        renderLobby();
        return;
      }
      case 'register': return register({ ...entry }, chosen[0] === 'training' ? [] : chosen);
      case 'replay': if (replay) return register(replay.plan, replay.ids); return;
      case 'mode':
        if (value === 'school') chooseSchool(target.dataset.school || entry.school);
        entry.mode = value;
        if (value !== 'series') syncSelection();
        renderLobby();
        return scrollTop();
      case 'style': entry.style = value; entry.material = ''; break;
      case 'material': entry.material = value; break;
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
      case 'resume':
        root.querySelector('[data-cover]').hidden = true;
        root.querySelector('.round-pause').hidden = false;
        focusCanvas();
        return engine?.resume(settings());
      case 'retry-report': return finish(bout, bout.result);
      case 'history': return renderReport(state().history[Number(value)]);
      case 'lobby':
        closeBout();
        entry.mode = 'quick';
        syncSelection();
        renderLobby();
        return scrollTop();
      default: return;
    }
    renderLobby();
    root.querySelector(`[data-arena-action="${action}"]${value == null ? '' : `[data-value="${value}"]`}`)?.focus({ preventScroll: true });
  });

  return {
    open({ bladeId: preferred, mode = 'quick' } = {}) {
      closeBout();
      entry.mode = mode;
      confirming = false;
      notice = '';
      syncSelection(preferred);
      renderLobby();
      scrollTop();
    },
    leave() { closeBout(); },
    pause: () => engine?.pause(),
  };
}
