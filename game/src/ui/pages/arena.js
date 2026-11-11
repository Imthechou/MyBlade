import { momentumChip, momentumLadder, momentumHint, momentumTrail, FACE_CN, STAT_CN, FACE_STATS, faceOfStat, faceCompareRow } from '../arenaReportParts.js';
/** 赛事 V3 页面：四类赛事共用切割输入、时钟、选卡与 Canvas 舞台。旧赛程保留恢复入口。 */

import { icon } from '../icons.js';
import { el, $, clear, mount, toast, countUp, sheet } from '../dom.js';
import * as Core from '../../core/index.js';
import { BRANCHES, GRADIENTS } from '../../data/arena/branches.js';
import { TIERS, NATIONAL_ROUNDS, THEMES } from '../../data/arena/tournaments.js';
import { FACES } from '../../data/balance.js';
import Game from '../../app/game.js';
import router from '../router.js';
import * as Challenge from '../../core/arenaChallenge.js';
import { advanceArenaClock, formalCutPayload } from '../../core/arenaCutBridge.js';
import { bus, EVENTS, audio, haptics, motion, env } from '../../platform/index.js';
import { drawArenaStage } from '../arenaStage.js';
import { cutImpact } from '../arenaImpact.js';
import * as Formal from '../formalPerformance.js';
import * as FormalTest from '../formalTestStage.js';
import * as FormalDef from '../../data/arena/formalTests.js';
import * as Suite from '../../core/arenaSuite.js';
import * as Performance from '../../core/arenaPerformance.js';
import { KNIFE_TYPES, resolveModelId } from '../../data/knifeTypes.js';
import { BUFF_BY_ID, BUFF_TIERS, BUFF_FAMILIES, BUILD_TAGS } from '../../data/arena/buffs.js';
import { mountCollectionPreview, disconnectCollectionPreviews } from '../../render/collectionPreview.js';

let root = null;
let body = null;

/* 赛前选择（模块态，跨 render 保留） */
let tier = 'school';
let styleId = BRANCHES[0].id;
let gradient = 0;
let themeId = null;
let selectedBladeId = null;


/**
 * ★ 战报只结算一次。
 *   render() 在 Game.match.done 时每次都走 renderReport()（切页回来也会），
 *   页面用 match.id 避免重复播报；Core.progress.recordMatch() 同时使用
 *   存档级 match.id 幂等，避免重复奖励、胜负计数或归档。
 *   换一场比赛（id 变了）自然重新结算。
 */
let reportedMatchId = null;
let arenaMode = 'tournament';
let challengeRun = null;
// 仅保留当前页的结算回执；重绘不重试，失败也不改写或丢弃原 run。
const quickChallengeSettlements = new WeakMap();
// Short trial comparisons are transient observations, not saved progression.
const recentSampleTrials=new Map();
let quickChallengeSettlingRun = null;

function pendingQuickChallenge() {
  return quickChallengeSettlingRun || (challengeRun &&
    quickChallengeSettlements.get(challengeRun)?.code === 'PERSIST_FAILED' ? challengeRun : null);
}

// 离页本身保留模块态；所有会覆盖本局的入口必须先过此守护。
function guardPendingQuickChallenge() {
  if (!pendingQuickChallenge()) return false;
  toast('本局奖励尚未保存，请先回战报重试结算；暂不能重开或切换赛事。', 'warn');
  return true;
}

let challengeFrame = 0;
let challengeCanvas = null;
let challengePointer = null;
let challengeResizeObserver = null;
let challengeResizeHandler = null;
let challengeVisibilityHandler = null;
let challengeKeyHandler = null;
let fieldTestRun = null;
let fieldTestMatchId = null;
// 新正式赛、全国赛、巅峰赛的切割分项共用同一 Canvas/判定实例；与旧 Game.match 独立。
let unifiedFormalRun = null;
let unifiedFormalKey = null;
let sliceRun = null;   // 单刀赛事的当前局（与 challengeRun / fieldTestRun 并列）
let formalCutStroke = null;
let teamSelection = [];
/* 三刀巅峰赛的阵容选择（模块态，跨 render 保留）。
   ★ rework T09：资格约束由 core/arenaFormal.validateApexRoster 强制，
     这里只维护玩家点选的三个 ID，不自己做合法性判定。 */
let apexSelection = [];
let teamDispatchId = null;
let teamResumeChecked = false;
let teamStageCleanup = null;
let nationalResumeChecked = false;
let nationalSnapshot = null;
let nationalLocal = null;
let nationalPendingCommit = null;
let nationalSave = { state: 'idle', savedAt: null, durability: null, recovered: false, cleanupPending: false };


export function create() {
  root = $('.page[data-page="' + legacyArenaRoute() + '"]');
  if (!root) return;
  root.innerHTML = '';
  body = el('div', { class: 'arena-body' });
  root.appendChild(body);
}

/** 离开赛事页：把界面上的浮层与动画收掉（路由会在切页时调用） */
export function leave() {
  stopTeamStage(true);
  disconnectCollectionPreviews();
  const run = unifiedFormalRun || (challengeRun && !Game.match ? challengeRun : (sliceRun || fieldTestRun));
  if (run && !run.done) Challenge.setPaused(run, true);
  Formal.pauseFormalStage();
  stopChallengeFrame();
}

const legacyArenaRoute = () => new URLSearchParams(location.search).has('legacy') ? 'arena' : 'legacy-arena';

/** Legacy Daily navigation now lands on the arena's fixed-seed quick challenge. */
export function openDailyChallenge() {
  if (guardPendingQuickChallenge()) { router.go(legacyArenaRoute()); return; }
  arenaMode = 'challenge';
  challengeRun = null;
  Game.match = null;
  router.go(legacyArenaRoute());
}

/** 显式 UI 去向，不沿用赛事页上次停留的模式。 */
export function openQuickChallenge(bladeId = null) {
  if (guardPendingQuickChallenge()) { router.go(legacyArenaRoute()); return; }
  if (bladeId) selectedBladeId = bladeId;
  openDailyChallenge();
}

/** Collection short-range blade feel test; no persistent reward or score ladder. */
export function openCollectionSample(bladeId) {
  if(guardPendingQuickChallenge())return {ok:false,reason:'请先保存上一局的奖励'};
  const blade=Core.progress.bladeById(bladeId);
  if(!blade)return {ok:false,reason:'找不到可用藏刀'};
  const made=Challenge.createChallenge(blade,{mode:'sample',seconds:12,seed:81241});
  if(!made.ok)return made;
  selectedBladeId=bladeId;
  arenaMode='challenge';
  challengeRun=made.run;
  Game.match=null;
  router.go(legacyArenaRoute());
  return {ok:true};
}

export function openTournament(bladeId = null) {
  if (guardPendingQuickChallenge()) { router.go(legacyArenaRoute()); return; }
  if (bladeId) selectedBladeId = bladeId;
  arenaMode = 'tournament';
  challengeRun = null;
  Game.match = null;
  router.go(legacyArenaRoute());
}

export function render() {
  if (!root) create();
  if (!body) return;
  stopTeamStage();
  disconnectCollectionPreviews();
  Formal.disposeFormalStage();
  FormalTest.disposeFormalTestStage();
  clear(body);
  // 从首页/其他页返回时，恢复原对象的失败战报，不被赛事恢复流程覆盖。
  if (pendingQuickChallenge()) {
    arenaMode = 'challenge';
    return renderChallengeReport();
  }
  if (challengeRun?.mode==='sample') {
    // Collection trials are isolated practice, even if a career cup happens
    // to be checkpointed. No saved cup or its roster is overwritten.
    return challengeRun.done ? renderChallengeReport() : renderChallenge();
  }
  if (!Game._careerV41ResumeChecked) {
    Game._careerV41ResumeChecked=true;
    Game.resumeCareerV41();
  }
  if (Game.sliceMatch) {
    if (Game.sliceMatch.done) return renderSliceReport();
    if (Game.sliceMatch.phase === 'dispatch') return renderSeriesDispatch();
    if (Game.sliceMatch.phase === 'buff') return renderSliceBuff();
    if (Game.sliceMatch.phase === 'runResult') return renderSliceRunResult();
    return renderSliceRun();
  }
  if (Game.formalMatch) {
    /* ★ rework T06：正式单刀赛 = 多项目测试（各流派项目组合不同），
       不再是三次 35 秒切割 + 逐局 buff。 */
    if (Game.formalMatch.done) return renderFormalReport();
    const task = Game.formalTask();
    if (task?.kind === 'cutting') renderUnifiedFormalCut(Game.formalMatch, task,
      payload => Game.submitFormalTest(payload), () => Game.abandonFormalMatch(),
      {tier:'school',gradient:Game.formalMatch.gradient});
    else FormalTest.renderFormalTest(Game.formalMatch, body, render);
    return;
  }
  if (Game.apexMatch) {
    /* ★ rework T09：三刀巅峰赛 —— 三轮不同项目，每轮派一把未用过的刀 */
    if (Game.apexMatch.done) return renderApexReport();
    return renderApexMatch();
  }
  if (!teamResumeChecked) {
    teamResumeChecked = true;
    const resumed = Game.resumeTeamMatch();
    if (resumed.ok && resumed.team) arenaMode = 'team';
    else if (!resumed.ok) toast(resumed.reason || '无法恢复组刀赛', 'warn');
  }
  /* ★ rework T09：全国赛新链路优先。
     五轮都是真实多项目测试（composite 三项），不再走旧的
     “三局 35 秒切割 + 逐局 buff” 结构。旧 nationalRuns 仅在无新赛时兼容历史。 */
  if (Game.nationalMatch) {
    if (Game.nationalMatch.done) return renderNationalReport();
    return renderNationalMatch();
  }
  if (!nationalResumeChecked) {
    nationalResumeChecked = true;
    const resumed = nationalRestore();
    if (resumed.ok && resumed.run && arenaMode === 'tournament' && !Game.match) { tier = 'national'; arenaMode = 'national-entry'; }
  }
  // A restored checkpoint lives in nationalSnapshot, not necessarily in Game's main-archive view.
  if (arenaMode === 'national-entry') { renderNationalEntry(); nationalPaintSave(); return; }
  if (arenaMode === 'national') { renderNational(); nationalPaintSave(); return; }
  if (arenaMode === 'team') return renderTeam();

  if (arenaMode === 'challenge' && !Game.match) {
      if (challengeRun && !challengeRun.done) return renderChallenge();
    if (challengeRun?.done) return renderChallengeReport();
    return renderChallengeSetup();
  }

  if (Game.match && !Game.match.done) return renderMatch();
  if (Game.match && Game.match.done) { return renderReport(); }
  renderSetup();
}

function modeSwitch() {
  return el('div', { class: 'arena-mode-switch' }, [
    el('button', { class: 'arena-mode' + (['tournament', 'national-entry', 'national'].includes(arenaMode) ? ' is-active' : ''), text: '正式赛事', onclick: () => { if (guardPendingQuickChallenge()) return; arenaMode = 'tournament'; challengeRun = null; render(); } }),
    el('button', { class: 'arena-mode' + (arenaMode === 'team' ? ' is-active' : ''), text: teamView().team && teamView().status !== 'settled' ? '恢复组刀赛' : '三刀巅峰', onclick: () => { if (guardPendingQuickChallenge()) return; if(!teamView().team || teamView().status==='settled'){arenaMode='tournament';tier='apex';challengeRun=null;render();return;} const r = Game.resumeTeamMatch(); if (!r.ok) { toast(r.reason, 'warn'); return; } arenaMode = 'team'; render(); } }),
    el('button', { class: 'arena-mode' + (arenaMode === 'challenge' ? ' is-active' : ''), text: '快速挑战', onclick: () => { arenaMode = 'challenge'; Game.match = null; render(); } }),
  ]);
}

/* ══ 赛前 ═══════════════════════════════════════════════════════ */

function renderSetup() {
  return renderTournamentHub();
}

/**
 * 赛前对手预览。
 * ★ 用 Core.arena.createMatch 试算一场再丢掉 —— 它是纯函数（随机数由注入的
 *   seed 流产生），不会污染任何全局状态。这样"赛前展示对手"与"真实开赛"
 *   共用同一条代码路径，不会出现"预览一个对手、开赛换一个"的错位。
 */

/**
 * 对手画像。
 *
 * ★ 字段来自 data/arena/opponents.js#decorate()（唯一真源）：
 *   { id, name, styleId, tier, knifeName, stats, score, sixMean,
 *     traits: string[], tendency: id, tendencyName, revealed }
 *   ——**没有** styleName / tendencies 这两个字段，之前按不存在的名字取值，
 *   结果"风格"与"倾向"两栏永远渲染成兜底文案。
 *   styleId → 流派中文名需经 BRANCHES 查表；倾向直接用 tendencyName。
 *
 * @param {object} m           一场比赛（含 opponent / oppFaces）
 * @param {'high'|'partial'|'low'} transparency  信息透明度（§18 / §20）
 */

function bladePicker(blades, selected) {
  const art = el('span',{class:'arena-blade-symbol blade-thumb','aria-hidden':'true'});
  if (selected) mountCollectionPreview(art, selected, Game.resolveVisualState(selected, {}, {modelId:resolveModelId(selected, selected.knifeTypeId),viewPreset:'forge'}));
  return el('button', { class: 'arena-loadout', 'aria-label': '更换参赛刀', onclick: () => {
    const list = el('div', { class: 'loadout-list' }, blades.map(b => el('button', {
      class: 'loadout-option' + (b.id === selectedBladeId ? ' is-selected' : ''),
      'aria-pressed': String(b.id === selectedBladeId), onclick: () => { selectedBladeId = b.id; handle.close(); render(); },
    }, [bladeSymbol(), el('span', {}, [el('b', {text:b.bladeName || b.name || b.id}), el('small', {text:`${b.rarityName || b.rarity || '成刀'} · 评分 ${b.score || 0}`})]), el('span', {text:b.id === selectedBladeId ? '已选' : '选择'})])));
    const handle = sheet({ title: '选择参赛刀', body: list });
  } }, [art, el('span', {class:'arena-loadout-copy'}, [el('small',{text:'参赛刀'}),el('b',{text:selected?.bladeName || selected?.name || '成刀'}),el('small',{text:`六维均值 ${Math.round(Object.values(selected?.stats || {}).reduce((a,b)=>a+(Number(b)||0),0)/6)} · 档案永久保留`})]), el('span',{class:'arena-loadout-score'},[el('b',{text:String(selected?.score || 0)}),el('small',{text:'评分'})]), el('span',{class:'arena-loadout-change'},[icon('next')])]);
}
function bladeSymbol() {
  const mark = el('span',{class:'arena-blade-symbol','aria-hidden':'true'});
  mark.innerHTML = '<svg viewBox="0 0 48 64" fill="none"><path d="M33 4 36 22 19 47 12 42Z" fill="url(#steelIcon)"/><path d="m33 4-17 40 3 3 17-25Z" fill="#88A8B7"/><path d="m10 40 13 8-3 4-13-8Z" fill="#A77B38"/><path d="m12 47 6 4-6 10-6-4Z" fill="#17344B"/><defs><linearGradient id="steelIcon"><stop stop-color="#F8FDFF"/><stop offset="1" stop-color="#8FA8B5"/></linearGradient></defs></svg>';
  return mark;
}
function renderTournamentHub() {
  body.className = 'arena-body arena-view-hub';
  if (tier === 'national') return renderNationalEntry();
  const blades = Core.progress.collection().filter(b => b.canEnterArena !== false && !b.fractured);
  if (!blades.length) {
    mount(body,[modeSwitch(),el('section',{class:'arena-empty-card'},[bladeSymbol(),el('h2',{text:'带上你的第一把刀'}),el('p',{text:'完成锻造，把锋芒带进赛场。'}),el('button',{class:'btn btn--primary btn--block',text:'去锻刀',onclick:async()=>{if(!Game.run||Game.run.finished)Game.startForge({});try{await Game.prewarmCandidates();}catch(e){console.warn('[forge] warmup',e);}router.go('forge');}})])]);return;
  }
  if (!blades.some(b => b.id === selectedBladeId)) selectedBladeId = blades[0].id;
  if (!BRANCHES.some(b => b.id === styleId)) styleId = BRANCHES[0].id;
  if (tier === 'apex' && !THEMES.some(x=>x.id===themeId)) themeId=THEMES[0]?.id || null;
  const selected=blades.find(b=>b.id===selectedBladeId), branch=BRANCHES.find(b=>b.id===styleId);
  const cleared=tier==='school'?Core.progress.schoolProgress(styleId):[];
  const maxUnlocked=Math.min(GRADIENTS.length-1,Math.max(0,...cleared.map(x=>x+1)));
  if(tier==='school'&&(gradient>maxUnlocked||gradient<0))gradient=maxUnlocked;
  const t=TIERS[tier];
  const node=el('div',{class:'arena-hub'},[modeSwitch(),bladePicker(blades,selected),el('div',{class:'hub-tier-tabs','aria-label':'赛事层级'},Object.values(TIERS).map(x=>el('button',{class:'hub-tier'+(tier===x.id?' is-active':''),'aria-pressed':String(tier===x.id),text:x.name,onclick:()=>{tier=x.id;render();}}))),el('header',{class:'hub-event-heading'},[el('h1',{text:tier==='school'?'选择流派':tier==='national'?'全国晋级之路':'选择三把刀'}),el('p',{text:({school:'选择流派，逐级证明你的刀。',national:'从32强到决赛，每轮重新抽签。',apex:'三把不同的刀，三轮主题切割，每把本场一次。'})[tier]})])]);
  if(tier==='school'){
    node.append(el('div',{class:'hub-branches'},BRANCHES.map((b,i)=>el('button',{class:'hub-branch'+(styleId===b.id?' is-active':''),'aria-pressed':String(styleId===b.id),onclick:()=>{styleId=b.id;gradient=0;render();}},[el('span',{class:'hub-branch-glyph',text:['锤','刃','准','彩','复','载'][i]}),el('span',{},[el('b',{text:b.name}),el('small',{text:FormalDef.branchFormat(b.id)?.focus || b.tag})]),styleId===b.id?el('span',{class:'selection-check',text:'✓'}):null]))),el('div',{class:'hub-section-label'},[el('b',{text:'进阶之路'}),el('span',{text:`已通关 ${cleared.length}/${GRADIENTS.length}`})]),el('div',{class:'hub-progression'},GRADIENTS.map((g,i)=>{const unlocked=i===0||cleared.includes(i-1),done=cleared.includes(i);return el('button',{class:'hub-step'+(i===gradient?' is-active':'')+(done?' is-done':'')+(!unlocked?' is-locked':''),disabled:!unlocked,'aria-label':`${g.name}${done?'，已通关':!unlocked?'，未解锁':''}`,'aria-pressed':String(i===gradient),onclick:()=>{gradient=i;render();}},[el('b',{text:done?'✓':String(i+1)}),el('small',{text:g.name})]);})));
  }else if(tier==='national')node.append(el('div',{class:'hub-national-strip'},NATIONAL_ROUNDS.map(r=>el('span',{},[el('b',{text:String(r.size)}),el('small',{text:r.name})]))));
  else if(tier!=='apex') node.append(el('div',{class:'hub-themes'},THEMES.slice(0,4).map(x=>el('button',{class:'hub-theme'+(themeId===x.id?' is-active':''),'aria-pressed':String(themeId===x.id),onclick:()=>{themeId=x.id;render();}},[el('b',{text:x.name}),el('small',{text:x.desc || ''})]))));
  /* ★ rework T09：巅峰赛必须选三把不同的刀，不再允许单刀旁路。
     资格由 core/arenaFormal.validateApexRoster 最终把关；这里只做选择与可见回执。 */
  if(tier==='apex'){
    const owned=blades.map(b=>b.id);
    apexSelection=apexSelection.filter(id=>owned.includes(id));
    const picked=apexSelection;
    const roster=Core.arenaFormal.validateApexRoster(picked.map(id=>blades.find(b=>b.id===id)).filter(Boolean));
    node.append(
      el('div',{class:'hub-section-label'},[el('b',{text:'选择三把刀'}),el('span',{text:`已选 ${picked.length}/3 · 每把本场只能出场一次`})]),
      el('div',{class:'arena-team-list'},blades.map(b=>{
        const on=picked.includes(b.id);
        return el('button',{class:'btn'+(on?' btn--primary':''),'aria-pressed':String(on),
          onclick:()=>{
            const i=apexSelection.indexOf(b.id);
            if(i>=0)apexSelection.splice(i,1);
            else if(apexSelection.length<3)apexSelection.push(b.id);
            else{toast('最多三把：先取消一把再选','warn');return;}
            render();
          },
          text:`${on?'✓ ':''}${b.bladeName||b.name||b.id} · ${b.rarityName||b.rarity||'成刀'} · 评分 ${b.score||0}`});
      })),
      el('p',{class:'arena-note',text:roster.ok?`赛前顺序：${picked.map((id,i)=>`${i+1}. ${blades.find(b=>b.id===id)?.bladeName||id}`).join(' → ')} · 无赛中选卡`:`还不能开赛：${roster.reason}`}),
      el('p',{class:'arena-note',text:'三轮主题：极致锋芒 → 不屈之刃 → 巅峰之作。各刀只出场一次。'}),
    );
  }
  node.append(el('details',{class:'arena-rules'},[el('summary',{text:'赛制与对手情报'}),tournamentPreviewCard(t,branch)]),el('div',{class:'hub-launch-bar'},[el('span',{class:'hub-ready-note',text:`${tier==='school'?GRADIENTS[gradient]?.name+' · ':''}${tier==='school'?branch?.name:''} · 结构目标 · 无赛中选卡`}),el('button',{class:'btn btn--primary hub-launch',text:'开始挑战',onclick:()=>{
    /* ★ rework T06：正式单刀赛走 core/arenaFormal 的多项目测试，
       不再走 arenaSlice 的三次 35 秒切割 + 逐局 buff。
       每个流派的项目组合不同（锻压=强度+耐久、精密=精度+切割 …）。 */
    if(tier==='apex'){
      const owned=blades.map(b=>b.id);
      const picked=(apexSelection||[]).filter(id=>owned.includes(id));
      if(picked.length!==3){toast('巅峰赛需要选择三把不同的刀','warn');return;}
      const am=Game.startApexMatch({bladeIds:picked});
      if(!am?.ok){toast(am?.reason || '无法开始三刀赛','warn');return;}
      render();return;
    }
    const m=Game.startFormalMatch({bladeId:selectedBladeId,tier,styleId,gradient:tier==='school'?gradient:0});
    if(!m?.ok){toast(m?.reason || '无法开始比赛','warn');return;}
    render();
  }})]));
  body.append(node);
}
function tournamentPreviewCard(t,branch) {
  const def=FormalDef.buildFormalDefinition({branchId:branch?.id || 'composite',gradient});
  return el('section',{class:'hub-rule-card','aria-label':'赛事规则'},[
    el('div',{class:'hub-rule-cell'},[el('small',{text:'本轮赛制'}),el('b',{text:'70–120 秒结构拆解 · 完整刀技'})]),
    el('div',{class:'hub-rule-cell'},[el('small',{text:'操作侧重'}),el('b',{text:tier==='apex'?'极致锋芒 / 不屈之刃 / 巅峰之作':def.focus})]),
    el('div',{class:'hub-rule-cell'},[el('small',{text:'达标条件'}),el('b',{text:tier==='school'?`${def.targetScore} 分 · ${def.require}`:'每轮达到公开目标分；刀况耗尽判负'})]),
  ]);
}

/* ══ 对局中 ═════════════════════════════════════════════════════ */

function renderMatch() {
  body.className='arena-body arena-view-event';
  const m=currentArenaMatch(),faces=arenaFaces(m),evNo=Math.min(m.eventIndex+1,m.events.length);
  if(!Core.arena.currentEvent(m)&&m.fieldTest&&!m.fieldTest.used){if(arenaMode==='national')renderNationalTest();else if(arenaMode==='team')renderTeamTest();else renderFormalFieldTest(m);return;}
  mount(body,[el('div',{class:'arena-head'},[el('span',{class:'event-round',text:`${TIERS[m.tier].name} · 赛前策略 ${evNo}/${m.events.length}`}),momentumChip(m.momentum)]),el('div',{class:'arena-vs'},[el('div',{class:'arena-side arena-me'},[el('span',{class:'side-tag',text:'我方'}),el('b',{text:m.blade.name}),el('span',{class:'side-score',text:String(m.blade.score)})]),el('span',{class:'arena-vs-mid',text:'对阵'}),el('div',{class:'arena-side arena-opp'},[el('span',{class:'side-tag',text:'对手'}),el('b',{text:m.opponent.name}),el('span',{class:'side-score',text:String(m.opponent.score)})])]),el('div',{class:'event-progress','aria-label':`事件 ${evNo}/${m.events.length}`},m.events.map((_,i)=>el('i',{class:i<m.eventIndex?'is-done':i===m.eventIndex?'is-current':''}))),el('details',{class:'arena-rules event-analysis'},[el('summary',{text:'查看对抗与局势'}),el('div',{class:'face-box'},Object.keys(FACES).map(f=>faceCompareRow(f,faces[f],m.oppFaces[f]))),momentumLadder(m.momentum)])]);
  renderDecision();
}
/** 六维对抗分（含 Momentum 修正）—— 与结算同一口径，避免"显示的分 ≠ 算的分" */
function arenaFaces(m) {
  return Core.arena.finalFaces(m);
}

/* ── 页内决策调度 ─────────────────────────────────────────── */

function renderDecision() {
  const m = currentArenaMatch();
  if (!m || m.done) return;
  const ev = Core.arena.currentEvent(m);
  if (ev) return renderEventDecision(ev);
  if (m.fieldTest && !m.fieldTest.used) return arenaMode === 'national' ? renderNationalTest() : arenaMode === 'team' ? renderTeamTest() : renderFormalFieldTest(m);
  // 事件走完且没有待做测试 → core 应已结算
  return undefined;
}

/* ── 事件三选一（页内，§17）───────────────────────────── */

function renderEventDecision(ev) {
  const m = currentArenaMatch();
  const evNo = m.eventIndex + 1;
  const transparency = TIERS[m.tier].infoTransparency;

  const list = el('div', { class: 'choice-list' }, ev.choices.map((c) => {
    const face = faceOfStat(c.mainStat);
    return el('button', {
      class: `choice choice--${c.kind}`,
      onclick: () => {
        const r = arenaMode === 'national' ? nationalCommitResult(m.id, draft => Core.arena.choose(draft, c.id)) : arenaMode === 'team' ? Game.teamChoose(c.id) : Game.choose(c.id);
        if (!r || !r.ok) {
          if (arenaMode === 'national') nationalWrite(r);
          else if (arenaMode === 'team') teamWrite(r, false);
          else toast(r?.reason || '无法选择', 'warn');
          return;
        }
        audio.play('select');
        haptics.feedback('select');
        render();
      },
    }, [
      el('div', { class: 'choice-head' }, [
        el('span', { class: 'choice-kind', text: c.kindName }),
        el('span', { class: `chip chip--face chip--face-${face.toLowerCase()}`, text: FACE_CN[face] }),
        momentumHint(c.momentumDelta),
      ]),
      el('div', { class: 'choice-title', text: c.title }),

      /* ★ 这里**刻意不出风险 chip**。
         赛事事件数据里确实带 riskDelta（0–0.08 的小数），但 `core/arena.js`
         对它的引用数是 **0** —— 没有任何一条规则消费它。而 V2.1 §21 明确
         "不把锻造期间的 Risk 或峰值 Risk 直接套用到比赛中"。
         把"风险 +0.1"画在选项上，就是在告诉玩家一个不会发生的后果：
         要么我们撒谎，要么玩家去追一个不存在的机制。所以只显示
         **真正会被结算的东西**：对抗面（主/次属性）与局势（momentumDelta）。 */
      el('div', { class: 'choice-sub' }, [
        el('span', { class: 'chip chip--stat u-st-' + c.mainStat, text: STAT_CN[c.mainStat] }),
        c.secondaryStat ? el('span', { class: 'chip chip--stat-sub u-st-' + c.secondaryStat, text: STAT_CN[c.secondaryStat] }) : null,
      ]),
    ]);
  }));

  /* ⚠ 这里原先读的是 `m.opponent.styleName` —— 对手对象**没有这个字段**
     （见 data/arena/opponents.js#decorate：是 styleId / tendencyName），
     于是流派试炼这一档永远走到 else 分支，把"信息透明度最高"的层级
     说成了"对手意图最少"，正好说反。 */
  const oppBranch = BRANCHES.find((b) => b.id === m.opponent.styleId);
  const oppKnown = [oppBranch ? oppBranch.name : null, m.opponent.tendencyName].filter(Boolean).join(' · ');
  const oppHint = transparency === 'high'
    ? `对手倾向：${oppKnown || '未公开'}`
    : (transparency === 'partial' ? '对手倾向仅部分公开 —— 其余从事件线索推断' : '巅峰赛：对手意图最少，只能从事件线索推断');

  body.append(el('section', {class:'event-decision'}, [el('div',{class:'event-decision-heading'},[el('h2',{text:ev.name}),el('p',{text:oppHint})]),list]));
}

/* ── 正式赛事暂定三项原型；切割旧结算，新增两项先记录诊断 ───── */
/* ══ 战报（§21.1）═══════════════════════════════════════════════ */

function renderReport() {
  body.className = 'arena-body arena-view-report';
  const m = Game.match;
  const r = m.result;
  // ★ 只结算一次（见 reportedMatchId 的说明）——否则每次 render 都会再发一遍奖励
  let fin = null;
  if (reportedMatchId !== m.id) {
    fin = Game.finishMatch();
    if (fin?.ok === false) {
      mount(body, el('div', { class: 'card', role: 'alert', text: fin.reason }),
        el('button', { class: 'btn btn--primary', text: '重试结算', onclick: () => render() }));
      return;
    }
    reportedMatchId = m.id;
    // 把奖励挂到 match 上，重渲染时照样能显示（fin 只在第一次有值）
    if (fin) m.reward = fin.reward;
  }
  const reward = (fin && fin.reward) || m.reward || null;

  const score = el('div', { class: 'report-verdict-score mono', text: '0' });
  // countUp 内部自己 rAF，但这里显式延后一帧：保证节点已挂进文档再改 textContent
  requestAnimationFrame(() => countUp(score, 0, r.composite, 700));
  const faceRows = Object.keys(FACES).map((f) => faceCompareRow(f, r.faces[f], r.oppFaces[f]));
  const panel = el('div', { class: 'circuit-report-detail', role: 'tabpanel', id: 'circuitReportDetail' });
  const details = [
    ['对抗分析', () => [
      el('div', { class: 'face-box' }, faceRows),
      el('div', { class: 'split-legend' }, [
        el('span', { text: `六维对抗 ${r.faceScore} × 70%` }),
        el('span', { text: `评分对抗 ${r.scoreFace} × 30%` }),
      ]),
      el('div', { class: 'arena-note', text: '切割表现沿用既有现场测试接口；精度、强度暂记操作诊断，不新增合成权重。综合分仍按原有70/30公式计算。' }),
    ]],
    ['局势回放', () => [
      el('div', { class: 'section-title', text: '局势走势' }), momentumTrail(m),
      ...m.log.map((l, i) => el('div', { class: 'report-line', text: `${i + 1}. ${l.fieldTest ? `现场切割 · ${l.fieldTest.tier === 'perfect' ? '完美' : l.fieldTest.tier === 'near' ? '接近' : '失手'}` : `${l.eventName || ''} → ${l.choiceTitle || ''}`}` })),
    ]],
    ['战报解释', () => r.report.lines.map(text => el('div', { class: 'report-line', text }))],
  ];
  const tabs = el('div', { class: 'circuit-report-tabs', role: 'tablist', 'aria-label': '战报详情' });
  details.forEach(([label, renderDetail], i) => tabs.appendChild(el('button', {
    type: 'button', role: 'tab', class: i === 0 ? 'is-active' : '', text: label,
    'aria-selected': String(i === 0), 'aria-controls': 'circuitReportDetail',
    onclick: (event) => {
      for (const button of tabs.children) { button.classList.remove('is-active'); button.setAttribute('aria-selected', 'false'); }
      event.currentTarget.classList.add('is-active'); event.currentTarget.setAttribute('aria-selected', 'true');
      mount(panel, renderDetail()); panel.scrollTop = 0;
    },
  })));
  mount(panel, details[0][1]());
  const cuttingPerformance = m.fieldTest?.result?.performance;
  mount(body, [
    el('div', { class: `circuit-verdict ${r.win ? 'is-win' : 'is-lose'}` }, [
      el('div', { class: 'quick-kicker', text: TIERS[m.tier].name }),
      el('div', { class: 'circuit-verdict-title', text: r.bladeDestroyed ? '结构失效 · 断刀退赛' : r.win ? '挑战胜利' : '惜败，再来一场' }),
      el('div', { class: 'circuit-scoreline' }, [
        el('div', {}, [el('small', { text: '我方综合分' }), score]),
        el('span', { text: 'VS' }),
        el('div', {}, [el('small', { text: '对手综合分' }), el('b', { class: 'mono', text: String(r.oppComposite) })]),
      ]),
      el('div', { class: 'circuit-opponent-name', text: `${m.blade.name} 对阵 ${m.opponent.name}` }),
      r.tieBreak ? el('div', { class: 'report-tie', text: r.tieBreak === 'face' ? '平分 → 比六维对抗分' : '平分 → 比 Momentum' }) : null,
    ]),
    el('div', { class: 'circuit-report-stats' }, [
      ['六维对抗', r.faceScore], ['评分对抗', r.scoreFace], ['切割评级', cuttingPerformance?.grade || '—'],
    ].map(([label, value]) => el('div', {}, [el('small', { text: label }), el('b', { text: String(value) })]))),
    el('div', { class: 'quick-reward' }, [
      el('span', { text: r.bladeDestroyed ? '信用点已结算 · 完整历史转入断刀册，已失去参赛资格' : '信用点已结算 · 成刀完好保留' }),
      el('b', { text: `+${reward?.cr || 0} CR` }),
    ]),
    Formal.renderSuiteDiagnostics(m),
    tabs, panel,
    el('div', { class: 'circuit-report-actions' }, [
      el('button', { class: 'btn btn--primary', text: '再来一场', onclick: () => { Game.match = null; render(); } }),
      el('button', { class: 'btn', text: '回首页', onclick: () => { Game.match = null; router.go('home'); } }),
    ]),
  ]);
}

/* ══ 快速切割挑战（2D；与正式赛事独立，统一走赛事页入口） ══ */
function renderChallengeSetup() {
  body.className='arena-body arena-view-quick-setup';
  const blades=Core.progress.collection().filter(b=>b.canEnterArena!==false&&!b.fractured);
  if(!blades.length){mount(body,[modeSwitch(),el('section',{class:'arena-empty-card'},[bladeSymbol(),el('h2',{text:'先锻一把参赛刀'}),el('p',{text:'完整成刀可无限次参赛，收藏不会受损。'}),el('button',{class:'btn btn--primary',text:'去锻刀',onclick:async()=>{if(!Game.run||Game.run.finished)Game.startForge({});try{await Game.prewarmCandidates();}catch(e){console.warn(e);}router.go('forge');}})])]);return;}
  if(!blades.some(b=>b.id===selectedBladeId))selectedBladeId=blades[0].id;
  const selected=blades.find(b=>b.id===selectedBladeId);
  const stats=[['强度','strength'],['锋利','sharpness'],['韧性','toughness']];
  mount(body,[modeSwitch(),bladePicker(blades,selected),el('header',{class:'quick-hero'},[el('h2',{text:'45秒，尽展锋芒'}),el('p',{text:'划过材料，连切得分。收藏刀具不会受损。'})]),el('div',{class:'quick-stat-strip'},stats.map(([label,key])=>el('span',{},[el('small',{text:label}),el('b',{text:String(Math.round(selected.stats?.[key] || 0))})]))),el('div',{class:'quick-entry-list'},[el('section',{class:'quick-entry-card is-daily'},[el('div',{class:'quick-entry-copy'},[el('h3',{text:'每日挑战'}),el('p',{text:'相同靶序，磨练你的最佳刀路。'})]),el('span',{class:'quick-entry-duration',text:'45秒'}),el('button',{class:'btn btn--primary btn--block',text:'开始每日挑战',onclick:()=>startQuickChallenge(true,Core.daily.seedOfDay(Core.daily.dayKey()))})]),el('section',{class:'quick-entry-card'},[el('div',{class:'quick-entry-copy'},[el('h3',{text:'自由快赛'}),el('p',{text:'随机靶序，橙色封条请避让，连切挑战新高分。'})]),el('span',{class:'quick-entry-duration',text:'45秒'}),el('button',{class:'btn btn--block',text:'开始自由快赛',onclick:()=>startQuickChallenge(false)})])]),el('details',{class:'arena-rules'},[el('summary',{text:'赛道、刀况与奖励'}),el('p',{text:'全程无随机强化弹窗。普通软靶流畅连切，硬靶可选择挑战或放过；橙色「避让 ×」封条不可切，误切只断连击。不消耗收藏刀具刀况，完整体验45秒。完成后按得分与评级结算CR，不影响正式赛事晋级。'})])]);
}

function startQuickChallenge(daily, seed = null) {
  if (guardPendingQuickChallenge()) return;
  const blade = Core.progress.bladeById(selectedBladeId);
  const created = Challenge.createChallenge(blade, { seed, daily });
  if (!created.ok) { toast(created.reason || '无法开始挑战', 'warn'); return; }
  challengeRun = created.run; challengePointer = null;
  render();
}

function stopChallengeFrame() {
  if (challengeFrame) cancelAnimationFrame(challengeFrame);
  if (formalCutStroke) Formal.noteCutStroke(Game.match, formalCutStroke, true);
  formalCutStroke = null;
  challengeFrame = 0; challengeCanvas = null; challengePointer = null;
  challengeResizeObserver?.disconnect(); challengeResizeObserver = null;
  if (challengeResizeHandler) window.removeEventListener('resize', challengeResizeHandler);
  challengeResizeHandler = null;
  if (challengeVisibilityHandler) document.removeEventListener('visibilitychange', challengeVisibilityHandler);
  challengeVisibilityHandler = null;
  if (challengeKeyHandler) document.removeEventListener('keydown', challengeKeyHandler);
  challengeKeyHandler = null;
}

function renderChallenge() {
  body.className = 'arena-body arena-view-quick-match';
  const run = challengeRun;
  if (!run || run.done) return renderChallengeReport();
  stopChallengeFrame();
  const stage = el('section', { class: 'quick-match' });
  const hud = el('div', { class: 'quick-hud' }, [
    el('div', { class: 'quick-hud-time' }, [el('small', { text: '剩余时间' }), el('b', { class: 'mono', text: run.remaining.toFixed(1) }), el('span', { text: '秒' })]),
    el('div', { class: 'quick-hud-score' }, [el('small', { text: '当前得分' }), el('b', { class: 'mono', text: String(Math.floor(run.score)).padStart(4, '0') })]),
    el('div', { class: 'quick-hud-vitals' }, [el('small', { text: run.mode==='sample'?'模拟刀况':'快赛模式' }), el('b', { text: run.mode==='sample'?`${Math.round(run.health)}%`:'∞' }), el('i', { style: { transform: `scaleX(${run.health / 100})` } })]),
  ]);
  const canvas = el('canvas', { class: 'quick-canvas', 'aria-label': '2D 切割赛场；按住并划过材料靶完成切割' });
  const mission = el('div', { class: 'quick-stage-label' }, [el('b', { text: run.mode==='sample'?'六材料标准试刀':'热身连切' }), el('span', { text: run.mode==='sample'?'同靶序 · 记录切口、刀损和完成时间':'划过靶具，一笔连切' })]);
  const footer = el('div', { class: 'quick-footer' }, [
    el('span', { class: 'quick-combo', text: `斩断 ${run.kills} · 连击 ×${run.combo}` }),
    el('span', { class: 'quick-time-label', text: run.blade.name }),
    el('button', { class: 'quick-pause quick-pause-toggle', 'aria-label': run.paused ? '继续' : '暂停', title: run.paused ? '继续' : '暂停', onclick: () => { Challenge.setPaused(run, !run.paused); render(); } }, [icon(run.paused ? 'play' : 'pause')]),
    el('button', { class: 'quick-pause quick-help-toggle', 'aria-label': '查看切割操作说明', title: '操作说明', onclick: () => openChallengeHelp(stage, run) }, [icon('help')]),
  ]);
  stage.append(hud, mission, canvas, footer);
  if (run.paused) {
    stage.classList.add('is-paused');
    stage.appendChild(challengePauseOverlay({
      onResume: () => { Challenge.setPaused(run, false); render(); },
      onRestart: () => run.mode==='sample' ? openCollectionSample(selectedBladeId) : startQuickChallenge(run.daily, run.seed),
      onAbandon: () => { challengeRun = null; render(); },
      onFinish: () => { if(run.done)return; Challenge.finish(run,'manual'); settleQuickChallenge(); }, 
      label: run.daily ? '每日挑战不会因暂停而重置' : '重开或放弃都不会提前结算 CR',
    }));
  }
  body.appendChild(stage);
  const updateMission = () => {
    if(run.mode==='sample') {mission.querySelector('b').textContent='六材料标准试刀';mission.querySelector('span').textContent=`已切断 ${run.kills}/6 · 有效接触 ${run.primaryContacts||0} · 临时刀况 ${Math.round(100*run.health/Math.max(1,run.maxHealth))}%`;return;}
    mission.querySelector('b').textContent = ({ warmup: '热身连切', route: run.route?.name || '路线挑战', speed: '节奏提速', finale: run.finale?.name || '压轴测试', 'route-choice': '赛道选择', 'finale-choice': '压轴选择' })[run.phase] || '赛事进行中';
    mission.querySelector('span').textContent = run.phase === 'warmup' ? (run.elapsed < 3 && !run.kills ? '划过靶具，一笔连切' : '软靶连切 · 建立节奏') : run.phase === 'route' ? `模拟负荷 · 不会断刀 · 当前路线加成 ×${run.route?.bonus}` : run.phase === 'speed' ? '加快节奏，善用连切与刀路' : run.phase === 'finale' ? `模拟负荷 · 不会断刀 · 压轴倍率 ×${run.finale?.bonus}` : '选择后继续计时';
  };
  renderChallengeCanvas(canvas, run, { hud, mission, footer, updateMission, onDone: settleQuickChallenge });
}

function renderFormalFieldTest(match) {
  body.className = 'arena-body arena-view-formal-match';
  stopChallengeFrame();
  clear(body);
  if (Formal.renderFormalSuite(match, body, render)) return;
  if (!fieldTestRun || fieldTestMatchId !== match.id) {
    const seed = (match.seed ^ 0x6f2a91d3 ^ [...String(match.fieldTest.type)].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261)) >>> 0;
    const created = Challenge.createChallenge(match.blade, { seed, mode: 'formal' });
    if (!created.ok) { Core.arena.skipFieldTest(match); render(); return; }
    fieldTestRun = created.run; fieldTestMatchId = match.id;
  }
  const run = fieldTestRun;
  if (run.done) {
    const performance = run.result;
    fieldTestRun = null; fieldTestMatchId = null;
    Formal.completeFormalCut(match, performance, render);
    return;
  }
  const task = Core.arena.fieldTestTask(match);
  const stage = el('section', { class: 'quick-match formal-field-match' });
  stage.append(el('div', { class: 'formal-field-intro' }, [
    el('span', { class: 'quick-kicker', text: TIERS[match.tier].name }),
    el('b', { text: '实际测试 1/3 · 切割（3项为暂定默认）' }),
    el('span', { text: '正式测试可能断刀：硬靶负荷与累积受损会导致结构失效；概率曲线待定。' }),
  ]));
  const hud = el('div', { class: 'quick-hud' }, [
    el('div', { class: 'quick-hud-time' }, [el('small', { text: '剩余时间' }), el('b', { class: 'mono', text: run.remaining.toFixed(1) }), el('span', { text: '秒' })]),
    el('div', { class: 'quick-hud-score' }, [el('small', { text: '切割表现' }), el('b', { class: 'mono', text: String(Math.floor(run.score)).padStart(4, '0') })]),
    el('div', { class: 'quick-hud-vitals' }, [el('small', { text: '测试刀况 · 可能断刀' }), el('b', { text: `${Math.round(run.health)}%` }), el('i', { style: { transform: `scaleX(${run.health / 100})` } })]),
  ]);
  const canvas = el('canvas', { class: 'quick-canvas', 'aria-label': '正式赛事现场测试：45秒2D切割场；按住并划过多个材料靶' });
  const mission = el('div', { class: 'quick-stage-label' }, [el('b', { text: '热身连切' }), el('span', { text: '划过靶具，一笔连切' })]);
  const footer = el('div', { class: 'quick-footer' }, [
    el('span', { class: 'quick-combo', text: `切断 ${run.kills} · 连击 ×${run.combo}` }),
    el('span', { class: 'quick-time-label', text: run.blade.name }),
    el('button', { class: 'quick-pause quick-pause-toggle', 'aria-label': run.paused ? '继续' : '暂停', title: run.paused ? '继续' : '暂停', onclick: () => { Challenge.setPaused(run, !run.paused); render(); } }, [icon(run.paused ? 'play' : 'pause')]),
    el('button', { class: 'quick-pause quick-help-toggle', 'aria-label': '查看切割操作说明', title: '操作说明', onclick: () => openChallengeHelp(stage, run) }, [icon('help')]),
  ]);
  stage.append(hud, mission, canvas, footer);
  if (run.paused) {
    stage.classList.add('is-paused');
    stage.appendChild(challengePauseOverlay({
      onResume: () => { Challenge.setPaused(run, false); render(); },
      onRestart: run.version==='arena-3' && run.mode==='formal' ? null : () => {
        const created = Challenge.restartChallenge(run);
        if (!created.ok) { toast(created.reason || '无法重开现场测试', 'warn'); return; }
        fieldTestRun = created.run; render();
      },
      onAbandon: () => {
        Core.arena.skipFieldTest(match, Challenge.finish(run, 'abandon'));
        Formal.abandonFormalSuite(match);
        fieldTestRun = null; fieldTestMatchId = null; render();
      },
      label: '放弃仍按既有规则记为放弃；重开不清除本项受损。跨项目受损与收手细则待定。',
    }));
  }
  body.appendChild(stage);
  const updateMission = () => {
    mission.querySelector('b').textContent = ({ warmup: '热身连切', route: run.route?.name || '路线挑战', speed: '节奏提速', finale: run.finale?.name || '压轴测试', 'route-choice': '赛道选择', 'finale-choice': '压轴选择' })[run.phase] || '赛事进行中';
    mission.querySelector('span').textContent = run.risk?.status === 'warning' || run.risk?.status === 'failed' ? run.risk.message : run.phase === 'warmup' ? '正式测试可能断刀；硬靶负荷与累积受损决定危险征兆' : run.phase === 'route' ? `${run.route?.tag || ''} · 路线 ×${run.route?.bonus}` : run.phase === 'speed' ? '提速连切，留意刀路与刀况' : run.phase === 'finale' ? `${run.finale?.tag || ''} · 压轴 ×${run.finale?.bonus}` : '选择期间计时暂停';
  };
  renderChallengeCanvas(canvas, run, { hud, mission, footer, updateMission, onDone: () => {
    if (formalCutStroke) Formal.noteCutStroke(match, formalCutStroke, true);
    formalCutStroke = null;
    const performance = run.result;
    fieldTestRun = null; fieldTestMatchId = null;
    Formal.completeFormalCut(match, performance, render);
  } });
}

/**
 * 正式赛切割项目统一到原来的完整切割内核。
 * 三类正式赛仅在提交/放弃回调不同：判定、画面、路线、压轴和时钟一条链路。
 * 非切割项目保留原正式测试操作及各流派专长。
 */
function renderUnifiedFormalCut(match, task, submit, abandon, encounter = null) {
  body.className = 'arena-body arena-view-formal-match arena-view-quick-match';
  stopChallengeFrame();
  if (task.invalid || !task.sequence?.length || task.rule?.kind !== 'sweep') {
    mount(body, [el('section', { class: 'arena-empty-card', role: 'alert' }, [
      el('h2', { text: '切割题目生成失败' }),
      el('p', { text: task.reason || '目标为空，不能记作0分。请重试加载或退出赛事。' }),
      el('button', { class: 'btn', text: '重试加载', onclick: render }),
    ])]);
    return;
  }
  const key = `${match.id}:${task.index}:cutting`;
  if (key !== unifiedFormalKey || !unifiedFormalRun) {
    const source = Core.progress.bladeById(match.blade.id) || match.blade;
    const created = Challenge.createChallenge(source, {
      seed: ((Number(match.seed) || 1) ^ Math.imul(task.index + 1, 2654435761)) >>> 0,
      mode: 'formal', seconds: task.rule.seconds, encounter:{...encounter,structure:true,styleId:match.styleId,styleIds:match.styleIds}, styleId:match.styleId, targetScore:match.definition.targetScore,
    });
    if (!created.ok) {
      mount(body, [el('p', { class: 'arena-note', text: created.reason || '无法创建切割测试' })]);
      return;
    }
    unifiedFormalRun = created.run;
    unifiedFormalRun.unifiedFormalCut = true;
    unifiedFormalKey = key;
  }
  const run = unifiedFormalRun;
  const submitResult = () => {
    if (run !== unifiedFormalRun || !run.done) return;
    const payload = formalCutPayload(run);
    if (!payload) return;
    const receipt = submit(payload);
    if (!receipt?.ok) {
      const message = receipt?.reason || '比赛提交失败，保留结果以便重试';
      toast(message, 'warn');
      clear(body);
      body.append(el('section', { class: 'arena-empty-card', role: 'alert' }, [
        el('h2', { text: '比赛尚未完成提交' }),
        el('p', { text: message }),
        el('button', { class: 'btn btn--primary', text: '重试提交', onclick: submitResult }),
      ]));
      return;
    }
    unifiedFormalRun = null; unifiedFormalKey = null;
    render();
  };
  if (run.done) { submitResult(); return; }

  const stage = el('section', { class: 'quick-match formal-field-match' });
  const hud = el('div', { class: 'quick-hud' }, [
    el('div', { class: 'quick-hud-time' }, [
      el('small', { text: '剩余时间' }), el('b', { class: 'mono', text: run.remaining.toFixed(1) }), el('span', { text: '秒' }),
    ]),
    el('div', { class: 'quick-hud-score' }, [
      el('small', { text: '结构得分' }), el('b', { class: 'mono', text: String(Math.floor(run.score)).padStart(4, '0') }),
    ]),
    el('div', { class: 'quick-hud-vitals' }, [
      el('small', { text: '临时刀况' }), el('b', { text: `${Math.round(run.health / Math.max(1,run.maxHealth) * 100)}%` }),
      el('i', { style: { transform: `scaleX(${run.health / Math.max(1, run.maxHealth)})` } }),
    ]),
  ]);
  const canvas = el('canvas', {
    class: 'quick-canvas', 'aria-label': '正式赛事完整切割场：单指划过靶具，完成破甲、补刀与连击',
  });
  const mission = el('div', { class: 'quick-stage-label' }, [
    el('b', { text: `${match.definition.branchName} · 第 ${task.index + 1}/${task.total} 项` }),
    el('span', { text: '选择连接拆解路线 · 顺槽续切 · 刀况只在局内消耗' }),
  ]);
  const footer = el('div', { class: 'quick-footer' }, [
    el('span', { class: 'quick-combo', text: `斩断 ${run.kills} · 连击 ×${run.combo}` }),
    el('button', {class:'quick-collect',hidden:true,disabled:true,text:'收手结算',onclick:()=>{
      if(run.done || !run.structure?.completed) return;
      Challenge.finish(run,'collected');
      stopChallengeFrame();
      submitResult();
    }}),
    el('span', { class: 'quick-time-label', text: match.blade.name }),
    el('button', { class: 'quick-pause quick-pause-toggle', 'aria-label': run.paused ? '继续' : '暂停', title: run.paused ? '继续' : '暂停',
      onclick: () => { Challenge.setPaused(run, !run.paused); render(); } }, [icon(run.paused ? 'play' : 'pause')]),
    el('button', { class: 'quick-pause quick-help-toggle', 'aria-label':'查看切割操作说明', title:'操作说明',
      onclick: () => openChallengeHelp(stage, run) }, [icon('help')]),
  ]);
  stage.append(hud, mission, canvas, footer);
  if (run.paused) {
    stage.classList.add('is-paused');
    stage.appendChild(challengePauseOverlay({
      onResume: () => { Challenge.setPaused(run, false); render(); },
      onRestart: run.version==='arena-3' && run.mode==='formal' ? null : () => {
        const created = Challenge.restartChallenge(run);
        if (!created.ok) { toast(created.reason || '本项无法重开', 'warn'); return; }
        created.run.unifiedFormalCut = true;
        unifiedFormalRun = created.run;
        render();
      },
      onAbandon: () => {
        const result = abandon();
        if (!result?.ok) { toast(result?.reason || '退出失败', 'warn'); return; }
        unifiedFormalRun = null; unifiedFormalKey = null;
        render();
      },
      label: '局内损伤与临时失效参与本项判定，不销毁藏刀阁里的永久成刀。',
    }));
  }
  body.append(stage);
  const updateMission = () => {
    const label = ({warmup:run.structure?.name || '结构试刀',route:run.route?.name,speed:'节奏提速',
      finale:run.finale?.name})[run.phase] || '切割考验';
    mission.querySelector('b').textContent = `${match.definition.branchName} · ${label}`;
    const collect=footer.querySelector('.quick-collect');
    if(collect) {collect.hidden=!run.structure?.completed||run.done;collect.disabled=!run.structure?.completed||run.done;}
    mission.querySelector('span').textContent = run.structure?.completed
      ? `主目标达成 · 当前 ${Math.round(run.score)} 分 · 可收手，或继续切附加部件`
      : run.risk?.status === 'failed'
      ? '结构临时失效 · 本项结束'
      : run.structure
        ? `主结构 ${Math.round(run.structure.primary*100)}% · 连接松脱 ${run.structure.failedJoins.length}/${run.structure.joins.length} · 刀况 ${Math.round(run.health / Math.max(1,run.maxHealth)*100)}%`
        : `目标 ${match.definition.targetScore} 分 · 已投放 ${run.stageSpawned} 靶 · 刀况 ${Math.round(run.health/Math.max(1,run.maxHealth)*100)}%`;
  };
  renderChallengeCanvas(canvas, run, {
    hud, mission, footer, updateMission,
    onDone: () => { stopChallengeFrame(); submitResult(); },
  });
}

/** Both 45-second modes share input, RAF, resize/DPR, rendering and pause semantics. */
function renderChallengeCanvas(canvas, run, { hud, mission, footer, updateMission, onDone }) {
  challengeCanvas = canvas;
  // 浏览器触控时不让页面滚动/缩放抢走滑切轨迹（尤其 iOS Safari）。
  canvas.style.touchAction = 'none';
  challengePointer = null;
  /* 诊断出口（只读）：2D 舞台的当前 run / 画布。供 tools/probe-* 直接读靶具、阶段与特效队列，
     不参与任何玩法判定；与 __FORGE_PREP 同一约定。 */
  globalThis.__FORGE_ARENA = { run, canvas, effects: null };
  const stage = canvas.closest('.quick-match');
  const pausedMenu = stage.querySelector('.quick-pause-overlay');
  if (pausedMenu) secureOverlay(pausedMenu);
  // 永久工艺特性与赛事临时强化分开；持续展示，命中时反馈真实对应行为。
  const forgeSkills = Array.isArray(run.params?.forgeTraits) ? run.params.forgeTraits : [];
  const forgedIds = new Set(forgeSkills.map(item => item.id));
  const forgeRibbon = forgeSkills.length ? el('div', { class: 'quick-forge-skills', 'aria-label': '本刀永久工艺特性' }, [
    el('span', { class: 'quick-forge-kicker', text: '刀技' }),
    ...forgeSkills.slice(0, 2).map(t => el('span', { class: 'quick-forge-skill', text: t.name })),
    forgeSkills.length > 2 ? el('span', { class: 'quick-forge-extra', text: '+' + (forgeSkills.length - 2) }) : null,
    el('span', { class: 'quick-forge-activated', 'aria-live': 'polite' }),
  ]) : null;
  if (forgeRibbon) stage.appendChild(forgeRibbon);
  let lastForgeBurst = -Infinity;
  const pulseForgeSkill = (hit, now) => {
    if (!forgeRibbon || now - lastForgeBurst < 950) return;
    const material = hit.target?.type;
    let id = '';
    if (hit.weak && forgedIds.has('precision')) id = 'precision';
    else if (hit.complete && material === 'ice' && forgedIds.has('cold')) id = 'cold';
    else if (hit.crossedIce && forgedIds.has('layer')) id = 'layer';
    else if (hit.contactEvent === 'armor' && forgedIds.has('layer')) id = 'layer';
    else if (hit.combo >= 2 && forgedIds.has('flow')) id = 'flow';
    else if (hit.complete && (material === 'foam' || material === 'rope') && forgedIds.has('edge')) id = 'edge';
    else if (hit.target && material !== 'foam' && material !== 'rope' && forgedIds.has('heat')) id = 'heat';
    else if (hit.target && material !== 'foam' && material !== 'rope' && forgedIds.has('stable')) id = 'stable';
    else if (hit.quality === 'PERFECT' && forgedIds.has('oxide')) id = 'oxide';
    else if (hit.quality === 'PERFECT' && forgedIds.has('ST_mirror')) id = 'ST_mirror';
    if (!id) return;
    lastForgeBurst = now;
    const activated = forgeRibbon.querySelector('.quick-forge-activated');
    const label = forgeSkills.find(t => t.id === id)?.name || '工艺特性';
    activated.textContent = label + ' 生效';
    forgeRibbon.classList.remove('is-activated'); void forgeRibbon.offsetWidth;
    forgeRibbon.classList.add('is-activated');
  };
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const trail = [], hitLabels = [], bursts = [], debris = [];
  const effects = {trail,hitLabels,bursts,debris,now:0,pointer:null,reducedMotion:motion.reduced()};
  if (globalThis.__FORGE_ARENA?.run === run) globalThis.__FORGE_ARENA.effects = effects;
  let bounds = canvas.getBoundingClientRect(), lastSoundAt=0;
  const timeNode=hud.querySelector('.quick-hud-time b'),scoreNode=hud.querySelector('.quick-hud-score b'),vitals=hud.querySelector('.quick-hud-vitals');
  const healthNode=vitals.querySelector('b'),healthBar=vitals.querySelector('i');
  const pauseNode=footer.querySelector('.quick-pause-toggle');
  const rail=el('div',{class:'quick-phase-rail','aria-hidden':'true'},[el('i')]);stage.appendChild(rail);
  const phaseBar=rail.firstElementChild;
  const isSlice = !!run.matchId;
  const cutFeedback = run.mode === 'formal' && !isSlice && !run.unifiedFormalCut ? el('div', { class: 'formal-operation-feedback', role: 'status', 'aria-live': 'polite', text: Game.match?.formalPerformance?.cutDiagnostics?.at(-1)?.message || '沿材料虚线从「起」点划过；轨迹、切口与切断结果分别反馈。' }) : null;
  if (cutFeedback) stage.appendChild(cutFeedback);
  let scoreDelayUntil = 0, shownScore = run.score;
  const text=(node,value)=>{if(node.textContent!==value)node.textContent=value;};
  const dprNow = () => Math.min(2, window.devicePixelRatio || 1);
  let drawWidth = 0, drawHeight = 0, drawDpr = 0;
  const resize = () => {
    if (!canvas.isConnected || challengeCanvas !== canvas) return;
    const rect = bounds = canvas.getBoundingClientRect(), dpr = dprNow();
    const width = Math.max(1, Math.floor(rect.width * dpr)), height = Math.max(1, Math.floor(rect.height * dpr));
    if (width !== drawWidth || height !== drawHeight || dpr !== drawDpr) {
      drawWidth = width; drawHeight = height; drawDpr = dpr;
      canvas.width = width; canvas.height = height;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    drawScene(performance.now());
  };
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
  resizeObserver?.observe(canvas);
  const resizeHandler = () => resize();
  window.addEventListener('resize', resizeHandler, { passive: true });
  challengeResizeObserver = resizeObserver;
  challengeResizeHandler = resizeHandler;
  const point = (event) => {
    const rect = bounds;
    return { x: Math.max(-.05,Math.min(1.05,(event.clientX - rect.left) / Math.max(1, rect.width))),
      y: Math.max(-.05,Math.min(1.05,(event.clientY - rect.top) / Math.max(1, rect.height))), time: performance.now() };
  };
  canvas.addEventListener('pointerdown', event => {
    if(run.done || run.paused || run.phase.endsWith('-choice') || challengePointer || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0))return;
    event.preventDefault();bounds=canvas.getBoundingClientRect();audio.unlock();
    try{canvas.setPointerCapture(event.pointerId);}catch{}
    Challenge.beginSwipe(run);challengePointer={...point(event),id:event.pointerId,hit:false,distance:0};
    if (run.mode === 'formal' && !run.unifiedFormalCut) formalCutStroke = { points: [point(event)], hits: [], distance: 0 };
  });
  const movePointer = event => {
    const pointer=challengePointer;if(!pointer || pointer.id!==event.pointerId || run.paused || run.done)return;
    const next=point(event),from={x:pointer.x,y:pointer.y};
    pointer.distance+=Math.hypot(next.x-from.x,next.y-from.y);
    trail.push({a:from,b:{x:next.x,y:next.y},at:next.time});if(trail.length>64)trail.shift();
    const result=Challenge.swipe(run,from,next,{duration:Math.max(.018,(next.time-pointer.time)/1000)});
    if (formalCutStroke) { formalCutStroke.points.push(next); formalCutStroke.hits.push(...result.hits); formalCutStroke.distance = pointer.distance; }
    if (run.mode === 'formal' && result.hits.length) scoreDelayUntil = next.time + 120;
    for(const hit of result.hits){
      pointer.hit=true;
      /* ★ rework T07：把 core 算出的**接触结果类型**带给舞台，
         让「弹刀 / 打不动 / 破甲 / 击破」在命中位置有不同表现，
         而不是全部变成同一句“切入 xx%”。 */
      const marker={x:hit.target.x,y:hit.target.y,points:hit.points,at:next.time,complete:hit.complete,quality:hit.quality,type:hit.target.type,progress:hit.target.progress,angle:hit.target.lastAngle,combo:hit.combo,objective:hit.objective,slot:hit.target.slot,followup:hit.target.cuts.length>1,contactEvent:hit.contactEvent||null,armorLeft:hit.armorLeft??null};
      // 六层参数在一个地方绑定，不更改玩法刀损、强度或原生计分。
      Object.assign(marker,cutImpact({...marker,target:hit.target},{reducedMotion:motion.reduced()}));
      hitLabels.push(marker);bursts.push({...marker});
      pulseForgeSkill(hit, next.time);
      /* 斩断的一瞬间留一份"碎块"记录：arenaStage 据此把靶具画成两半飞开。
         只加视觉事件，不改 run —— 判定与计分仍全部由 core 完成。 */
      if (hit.complete) debris.push({ x: hit.target.x, y: hit.target.y, type: hit.target.type,
        layout: hit.target.layout, angle: hit.target.lastAngle, at: next.time });
      if(next.time-lastSoundAt>60){audio.playCutImpact(marker);haptics.vibrate(marker.hapticMs);lastSoundAt=next.time;}
    }
    if(hitLabels.length>18)hitLabels.splice(0,hitLabels.length-18);if(bursts.length>18)bursts.splice(0,bursts.length-18);
    if(debris.length>12)debris.splice(0,debris.length-12);
    text(footer.querySelector('.quick-combo'),`切断 ${run.kills} · 连击 ×${run.combo}`);
    pointer.x=next.x;pointer.y=next.y;pointer.time=next.time;
    if(result.done || run.done){onDone();return;}
  };
  canvas.addEventListener('pointermove',event=>{
    if(!challengePointer || event.pointerId!==challengePointer.id)return;event.preventDefault();
    // Preserve high-frequency pen/touch segments rather than cutting across curves.
    const samples=event.getCoalescedEvents?.();
    for(const sample of samples?.length?samples:[event]){movePointer(sample);if(!challengePointer || run.done)break;}
  });
  const endSwipe=event=>{
    const pointer=challengePointer;if(pointer?.id!==event.pointerId)return;
    // pointerup 的终点可能没触发最后一次 pointermove：把末段纳入切割。
    // cancel/lostcapture 不补切，防止系统手势离开页面时误击。
    if(event.type==='pointerup'&&!run.done&&!run.paused&&canvas.isConnected) {
      const end=point(event);
      if(Math.hypot(end.x-pointer.x,end.y-pointer.y)>.009)movePointer(event);
    }
    if (formalCutStroke) {
      const diagnosis = Formal.noteCutStroke(Game.match, formalCutStroke, event.type !== 'pointerup');
      if (diagnosis && cutFeedback) text(cutFeedback, `${diagnosis.message} 行程 ${(diagnosis.travel * 100).toFixed(1)}%；切口偏差 ${Number.isFinite(diagnosis.meanDeviation) ? (diagnosis.meanDeviation * 100).toFixed(1) + '%' : '—'}。`);
    }
    formalCutStroke = null;
    if(event.type==='pointerup' && !pointer.hit && pointer.distance>.06){hitLabels.push({x:Math.max(.12,Math.min(.88,pointer.x)),y:Math.max(.15,Math.min(.85,pointer.y)),points:0,at:performance.now(),quality:'MISS',complete:false,contactEvent:'miss'});if(hitLabels.length>18)hitLabels.shift();}
    challengePointer=null;
  };
  canvas.addEventListener('pointerup',endSwipe);canvas.addEventListener('pointercancel',endSwipe);canvas.addEventListener('lostpointercapture',endSwipe);

  let lastHudUpdate = -Infinity;
  let lastHudScore = NaN, lastHudHealth = NaN, lastHudPhase = '';
  let lastHudPaused = null, lastHudRisk = '';
  const drawScene = (now) => {
    if (challengeCanvas !== canvas || !canvas.isConnected) return;
    const width=bounds.width,height=bounds.height;
    ctx.clearRect(0,0,width,height);
    effects.now=now;effects.pointer=challengePointer;effects.reducedMotion=motion.reduced();
    drawArenaStage(ctx,run,width,height,effects);
    if (run.mode==='formal' && !isSlice && !run.unifiedFormalCut) Formal.drawFormalCutGuides(ctx, run, width, height);
    if (run.mode !== 'formal' || now >= scoreDelayUntil) shownScore = run.score;
    // Canvas runs at display refresh rate for crisp cutting. HUD layout and
    // mission text only need 10-12 Hz unless gameplay state changes.
    const risk = run.risk?.status || '';
    const important = shownScore !== lastHudScore || run.health !== lastHudHealth
      || run.phase !== lastHudPhase || run.paused !== lastHudPaused || risk !== lastHudRisk;
    if (!important && now - lastHudUpdate < 90) return;
    lastHudUpdate = now;
    lastHudScore = shownScore; lastHudHealth = run.health;
    lastHudPhase = run.phase; lastHudPaused = run.paused; lastHudRisk = risk;
    text(hud.querySelector('.quick-hud-score small'),run.targetScore?`目标 ${run.targetScore}`:'当前得分');
    text(timeNode,run.remaining.toFixed(1));text(scoreNode,String(Math.floor(shownScore)).padStart(4,'0'));
    const healthPercent = Math.max(0, Math.min(100, run.health / Math.max(1, run.maxHealth ?? 100) * 100));
    const arcade=run.mode==='quick'&&!isSlice;
    text(healthNode,arcade?'∞':isSlice ? `${Math.round(run.health)}/${Math.round(run.maxHealth ?? 100)}` : `${Math.round(healthPercent)}%`);
    healthBar.style.display=arcade?'none':'';
    if(!arcade)healthBar.style.transform=`scaleX(${healthPercent/100})`;
    stage.classList.toggle('is-risky',run.finale?.id==='rush');stage.classList.toggle('is-low-health',healthPercent<35);stage.classList.toggle('is-countdown',run.remaining<=5);
    text(vitals.querySelector('small'), isSlice
      ? (run.risk?.status === 'failed' ? '结构失效' : run.risk?.status === 'warning' ? '⚠ 高负荷' : '刀况')
      : run.mode === 'formal' ? (run.risk?.status === 'failed' ? '结构失效' : '临时刀况') : run.mode==='sample'?'模拟刀况':'无限试刀');
    phaseBar.style.transform=`scaleX(${Math.max(0,run.remaining)/(run.total || Challenge.CHALLENGE_SECONDS)})`;
    const pauseLabel=run.paused?'继续':'暂停';
    if (pauseNode && pauseNode.getAttribute('aria-label')!==pauseLabel) { pauseNode.setAttribute('aria-label',pauseLabel); pauseNode.title=pauseLabel; }
    updateMission();
    if(run.augments && run.version==='arena-3') {
      const span=mission.querySelector('span');
      if(span)span.textContent=`${run.buffs.map(id=>BUFF_BY_ID[id]?.name).join(' · ') || '等待强化'}${run.resonances.length?' | '+run.resonances.map(id=>BUILD_TAGS[id]+'共鸣').join(' '):''} · 可反向补刀`;
    }
  };
  challengeVisibilityHandler = () => {
    if (challengeCanvas !== canvas || !canvas.isConnected || run.done) return;
    if (document.hidden) {
      Challenge.setPaused(run, true);
      if (formalCutStroke) Formal.noteCutStroke(Game.match, formalCutStroke, true);
      formalCutStroke = null;
      challengePointer = null;
      drawScene(performance.now());
      return;
    }
    // Backgrounding is an explicit pause, not an accidental RAF stall. Require
    // an intentional tap to resume so no cut is made on return from another app.
    if (run.paused) { render(); return; }
    drawScene(performance.now());
  };
  document.addEventListener('visibilitychange', challengeVisibilityHandler);
  challengeKeyHandler = (event) => {
    if (challengeCanvas !== canvas || !canvas.isConnected || run.done || run.phase.endsWith('-choice')) return;
    const help = stage.querySelector('.quick-help-overlay');
    if (help) {
      if (event.key === 'Escape') { event.preventDefault(); help.querySelector('button')?.click(); }
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      Challenge.setPaused(run, !run.paused); render();
    } else if (event.key.toLowerCase() === 'p') {
      event.preventDefault(); Challenge.setPaused(run, !run.paused); render();
    }
  };
  document.addEventListener('keydown', challengeKeyHandler);
  let lastFrame = 0;
  const paint = (now) => {
    if (challengeCanvas !== canvas || (challengeRun !== run && fieldTestRun !== run && sliceRun !== run && unifiedFormalRun !== run)) return;
    // 实际经过时间 ≠ 帧时长。低 FPS 不能把 45 秒赛事拖成数分钟。
    // 将 wall-clock delta 分片交给 core（tick 单次最多 .25s），
    // 一旦进入暂停/路线选择/结算立即停止，避免穿过决策阶段。
    const delta = lastFrame ? Math.max(0, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    if (!run.paused) advanceArenaClock(run, delta, Challenge.tick);
    drawScene(now);
    if (run.phase.endsWith('-choice')) {
      stopChallengeFrame(); showChallengeChoice(run); return;
    }
    if (run.done) { stopChallengeFrame(); onDone(); return; }
    if (!run.paused) challengeFrame = requestAnimationFrame(paint);
  };
  resize();
  if (run.paused) drawScene(performance.now());
  else challengeFrame = requestAnimationFrame(paint);
}

function challengePauseOverlay({ onResume, onRestart, onAbandon, onFinish, label }) {
  const panel = el('div', { class: 'quick-choice-panel' }, [
    el('div', { class: 'quick-kicker', text: '计时已冻结' }),
    el('h2', { text: '挑战已暂停' }),
    el('p', { text: '你的进度与刀况保持不变。' }),
    el('p', { class: 'quick-settlement-note', text: label }),
    el('div', { class: 'quick-choice-list', style: { gridTemplateColumns: '1fr' } }, [
      el('button', { class: 'quick-choice-card', type: 'button', onclick: onResume }, [el('b', { text: '继续挑战' }), el('span', { text: '回到当前进度' })]),
      onRestart ? el('button', { class: 'quick-choice-card', type: 'button', onclick: onRestart }, [el('b', { text: '重开本局' }), el('span', { text: '从 45 秒起重新开始' })]) : null,
      onFinish ? el('button', { class: 'quick-choice-card', type: 'button', onclick: onFinish }, [el('b', { text: '提前收刀 · 看本局成绩' }), el('span', { text: '立即结束，不发放CR，不计挑战完成' })]) : null,
      el('button', { class: 'quick-choice-card', type: 'button', onclick: onAbandon }, [el('b', { text: '放弃并退出' }), el('span', { text: '未完成本局不发 CR' })]),
    ]),
  ]);
  return el('div', { class: 'quick-choice-overlay quick-pause-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': '赛事暂停菜单' }, [panel]);
}

function openChallengeHelp(stage, run) {
  if (stage.querySelector('.quick-help-overlay')) return;
  const wasPaused = run.paused;
  Challenge.setPaused(run, true);
  const close = () => {
    overlay.remove();
    Challenge.setPaused(run, wasPaused);
    render();
  };
  const overlay = el('div', { class: 'quick-choice-overlay quick-help-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': '切割操作说明' }, [
    el('div', { class: 'quick-choice-panel' }, [
      el('div', { class: 'quick-kicker', text: '操作说明' }),
      el('h2', { text: '按住，划过，连切' }),
      el('p', { text: '鼠标或单指划过材料即可切割，一笔可以连续切过多个目标。自然停顿、反向回划或抬手会产生新刀次；原地微抖无效。' }),
      el('p', { text: '快赛完整 45 秒不被强化选卡打断；硬靶可选择挑战或放过。正式赛事需要沿持续切槽拆解结构连接，刀况耗尽只结束本轮，不会损坏收藏。' }),
      el('p', { text: '得分、评级和 CR 只在完成后的战报结算。暂停不会消耗时间；按 P 或 Escape 可暂停，切到后台会自动暂停。' }),
      el('button', { class: 'quick-choice-card', type: 'button', onclick: close }, [el('b', { text: '明白，继续' })]),
    ]),
  ]);
  stage.appendChild(overlay);
  secureOverlay(overlay);
}

function showAugmentChoice(run) {
  const stage=body.querySelector('.quick-match') || body;
  if(stage.querySelector('.arena-augment-overlay'))return;
  const tier=BUFF_TIERS[BUFF_BY_ID[run.offers[0]]?.tier];
  const overlay=el('div',{class:'quick-choice-overlay is-inline arena-augment-overlay',role:'dialog','aria-modal':'true','aria-label':'选择局内强化'},[
    el('div',{class:'quick-choice-panel'},[
      el('div',{class:'quick-kicker',text:`${run.choicesMade+1} / 3 · ${tier?.name || ''} · 计时暂停`}),
      el('h2',{text:'选择强化'}),
      el('p',{text:`${run.total} 秒切割 · 本轮目标 ${run.targetScore || '自由高分'}${run.buffs.length?' · 已选 '+run.buffs.map(id=>BUFF_BY_ID[id]?.name).join(' / '):''}`}),
      el('div',{class:'quick-choice-list'},run.offers.map(id=>{
        const b=BUFF_BY_ID[id];
        return el('button',{class:`quick-choice-card augment--${b.tier}`,'data-augment-id':id,onclick:()=>{
          const result=Challenge.chooseAugment(run,id);
          if(!result.ok){toast(result.reason,'warn');return;}
          audio.play('select');render();
        }},[el('small',{text:tier?.name}),el('b',{text:b.name}),el('span',{text:b.desc})]);
      })),
      run.resonances.length?el('p',{text:'已激活共鸣：'+run.resonances.map(id=>BUILD_TAGS[id]).join(' / ')}):null,
    ]),
  ]);
  stage.appendChild(overlay);secureOverlay(overlay);
}

function showChallengeChoice(run) {
  if(run.phase==='buff-choice')return showAugmentChoice(run);
  const isFinal = run.phase === 'finale-choice';
  const options = isFinal ? Challenge.FINALES : Challenge.ROUTES;
  const overlay = el('div', { class: 'quick-choice-overlay is-inline', role:'dialog', 'aria-modal':'true', 'aria-label':isFinal?'选择压轴路线':'选择挑战路线' }, [
    el('div', { class: 'quick-choice-panel' }, [
      el('div', { class: 'quick-kicker', text: '计时已暂停 · 选完继续' }),
      el('h2', { text: isFinal ? '收官路线' : '本轮赛道' }),
      el('p', { text: run.mode === 'formal' ? '更硬的靶具增加实际受力与累积受损；正式赛可能断刀。' : '更高倍率对应更硬靶具；仅模拟刀况，不会断刀。' }),
      el('div', { class: 'quick-choice-list' }, options.map((x) => el('button', { class: 'quick-choice-card', onclick: () => {
        const res = isFinal ? Challenge.chooseFinale(run, x.id) : Challenge.chooseRoute(run, x.id);
        if (!res.ok) { toast(res.reason, 'warn'); return; }
        render();
      } }, [el('b', { text: x.name }), el('span', { text: run.mode === 'formal' ? x.tag : '模拟负荷 · 0%断刀' }), el('strong', { text: `×${x.bonus.toFixed(2)}` }), el('small', { text: x.types.map((id) => Challenge.MATERIALS[id].short).join('  /  ') })]))),
    ]),
  ]);
  const owner=body.querySelector('.quick-match') || body; owner.appendChild(overlay);
  secureOverlay(overlay);
}

function quickChallengeSettlement(run, retry = false) {
  const previous = quickChallengeSettlements.get(run);
  // 同步保存/CR事件监听若重入渲染，不重复调用 Game，也不开放清局入口。
  if (quickChallengeSettlingRun === run) return { code: 'SETTLING', settled: false };
  if (!previous || (retry && previous.code === 'PERSIST_FAILED' && previous.retryable === true)) {
    quickChallengeSettlingRun = run;
    try {
      const result = Game.settleQuickChallenge(run);
      quickChallengeSettlements.set(run, result);
      return result;
    } finally {
      quickChallengeSettlingRun = null;
    }
  }
  return previous;
}

function settleQuickChallenge() {
  const run = challengeRun;
  if (!run || !run.done) return;
  stopChallengeFrame();
  render();
}

function renderCollectionTrialReport(run){
  const r=run.result,max=run.maxHealth||100;
  const current={id:run.blade.id,name:run.blade.name,cuts:r.primaryContacts||0,
    kills:r.kills,loss:Math.round(max-r.health),
    seconds:r.reason==='sample-complete'?Number(r.elapsedSeconds).toFixed(1):null};
  const previous=[...recentSampleTrials.values()].filter(t=>t.id!==current.id).at(-1)||null;
  recentSampleTrials.delete(current.id);recentSampleTrials.set(current.id,current);
  const comparison=previous
    ? `同一组六材料 · 上把「${previous.name}」：切断 ${previous.kills}/6、接触 ${previous.cuts} 次、刀损 ${previous.loss}、用时 ${previous.seconds===null?'未全部切断':previous.seconds+' 秒'}。操作刀路不同，成绩仅供练习对比。`
    : '同一组六材料（泡棉、绳束、塑板、木材、冰晶、金属），可返回藏刀阁选择另一把刀复测。';
  mount(body,[el('section',{class:'quick-report'},[
    el('div',{class:'quick-kicker',text:'藏刀阁 · 12 秒标准短试刀'}),
    el('h2',{text:r.reason==='sample-complete'?'六材料试刀完成':'试刀结束 · 保留实际成绩'}),
    el('p',{class:'arena-note',text:run.blade.name+' · 真实切割引擎；只计算临时损耗，不发 CR/XP，不损伤收藏'}),
    el('div',{class:'quick-result-stats'},[
      ['切断样品',r.kills+'/6'],['有效接触',current.cuts],['本次刀损',current.loss],
      ['完成用时',current.seconds===null?'未完成':current.seconds+'秒'],
    ].map(([name,value])=>el('div',{},[el('small',{text:name}),el('b',{text:String(value)})]))),
    el('p',{class:'arena-note',text:comparison}),
    el('div',{class:'quick-report-actions'},[
      el('button',{class:'btn btn--primary',text:'同刀再试',onclick:()=>openCollectionSample(run.blade.id)}),
      el('button',{class:'btn',text:'返回藏刀阁 · 换刀对照',onclick:()=>{challengeRun=null;router.go('workshop');}}),
    ]),
  ])]);
}

function renderChallengeReport() {
  body.className = 'arena-body arena-view-quick-report';
  const run = challengeRun;
  if (!run?.result) return renderChallengeSetup();
  if(run.mode==='sample')return renderCollectionTrialReport(run);
  const r = run.result;
  const settlement = r.reason==='manual' ? { code:'MANUAL', ok:true, settled:false, settledReward:0 } : quickChallengeSettlement(run);
  // 只认本 UI 首次 OK 的成功回执；旧纪录 DUPLICATE 不能被当成到账凭据。
  const settled = settlement.code === 'OK' && settlement.ok === true && settlement.settled === true;
  const retryable = settlement.code === 'PERSIST_FAILED' && settlement.retryable === true;
  const settlementNote = r.reason==='manual'
    ? '已主动收刀：成绩仅供查看，不发放CR或计入挑战纪录。'
    : settled
    ? '奖励已入账，收藏刀具完好保留。'
    : settlement.code === 'SETTLING'
      ? '正在保存本局，请稍候。'
      : settlement.code === 'PERSIST_FAILED'
      ? '保存失败，奖励尚未到账；本局已保留，请重试结算。'
      : settlement.code === 'DUPLICATE'
        ? '本局已有匹配纪录，无法确认奖励到账；不会重复发放。'
        : '本局数据无效，无法结算奖励。';
  const stats = el('div', { class: 'quick-result-stats' }, [
    ['完成切断', r.kills], ['最高连切', r.maxCombo], ['避让误切', r.avoidHits || 0], ['一划斩断', r.bestSwipe],
  ].map(([a, b]) => el('div', {}, [el('small', { text: a }), el('b', { text: String(b) })])));
  mount(body, [el('section', { class: 'quick-report' }, [
    el('div', { class: 'quick-kicker', text: run.daily ? '每日挑战' : '自由快赛' }),
    el('div', { class: 'quick-result-heading' }, [el('div', { class: 'quick-grade', text: r.grade }), el('div', {}, [el('h2', { text: r.reason==='manual' ? '提前收刀 · 本局成绩' : run.daily ? '每日挑战完成' : '切割挑战完成' }), el('p', { text: `${run.blade.name} · ${r.route} → ${r.finale}` })]), el('div', { class: 'quick-total' }, [el('small', { text: '赛事得分' }), el('b', { class: 'mono', text: String(r.score).padStart(4, '0') }), el('span', { text: 'PTS' })])]),
    stats,
    el('div', { class: 'quick-reward' }, [el('span', { text: r.reason==='manual' ? '主动结束 · 无奖励' : settled ? '信用点结算' : '信用点未确认到账' }), el('b', { text: r.reason==='manual' ? '0 CR' : settled ? `+${settlement.settledReward} CR` : `本局奖励 ${r.reward} CR（未确认到账）` })]),
    el('div', { class: 'quick-settlement-note', role: 'status', text: settlementNote }),
    el('div', { class: 'quick-report-actions' }, [
      retryable ? el('button', { class: 'btn btn--primary', text: '重试结算', onclick: () => {
        if (challengeRun !== run) return;
        quickChallengeSettlement(run, true);
        render();
      } }) : null,
      el('button', { class: 'btn btn--primary', text: '再来一场', onclick: () => startQuickChallenge(run.daily, run.daily ? Core.daily.seedOfDay() : null) }),
      el('button', { class: 'btn', text: '回快速挑战', onclick: () => openQuickChallenge(selectedBladeId) }),
      el('button', { class: 'btn', text: '回锻刀', onclick: async event => {
        if (guardPendingQuickChallenge()) return;
        const button = event.currentTarget;
        if (button.disabled) return;
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        try {
          Game.startForge({ mode: 'normal' });
          await Game.prewarmCandidates();
          if (challengeRun !== run || guardPendingQuickChallenge()) return;
          challengeRun = null;
          router.go('forge');
        } catch (error) {
          console.warn('[forge] GPU warmup', error);
          toast('工艺准备未完成，请重试', 'warn');
        } finally {
          button.disabled = false;
          button.removeAttribute('aria-busy');
        }
      } }),
      el('button', { class: 'btn', text: '进正式赛事', onclick: () => openTournament(selectedBladeId) }),
    ]),
  ])]);
}

function secureOverlay(overlay){
  // The paused choice owns keyboard focus; background controls cannot activate.
  const owner = overlay.parentElement;
  for (const sibling of owner?.children || []) if (sibling !== overlay) sibling.inert = true;
  overlay.addEventListener('keydown',event=>{
    if(event.key!=='Tab')return;
    const buttons=[...overlay.querySelectorAll('button:not(:disabled)')];
    if(!buttons.length)return;
    const first=buttons[0],last=buttons[buttons.length-1];
    if(event.shiftKey && (document.activeElement===first || !overlay.contains(document.activeElement))){event.preventDefault();last.focus();}
    else if(!event.shiftKey && (document.activeElement===last || !overlay.contains(document.activeElement))){event.preventDefault();first.focus();}
  });
  overlay.querySelector('button')?.focus();
}
export default { create, render, leave };

/* ══ 可选三刀队伍：快照只读，全部写操作经 Game 事务 ═══════════ */
function currentArenaMatch() { return arenaMode === 'national' ? (nationalSnapshot || Game.nationalRunView())?.activeMatch : arenaMode === 'team' ? teamView().team?.activeMatch : Game.match; }
function teamWrite(result, redraw = true) {
  if (!result?.ok) {
    toast(result?.reason || '保存失败，请重试；未消耗名额', 'warn');
    if (arenaMode === 'team' && body && !body.querySelector('.arena-team-retry')) body.append(el('button', {
      class: 'btn arena-team-retry', text: '重试恢复当前组刀进度', onclick: () => { Game.resumeTeamMatch(); render(); },
    }));
    return false;
  }
  if (redraw) render();
  return true;
}
function teamUpdate(mutator, redraw = true) { return teamWrite(Game.updateTeamRound(mutator), redraw); }
function teamHeading(kicker, title, copy) {
  return el('header', { class: 'arena-team-heading' }, [el('small', { text: kicker }), el('h1', { text: title }), copy ? el('p', { text: copy }) : null]);
}
function teamFooter(note, label, action, disabled = false) {
  return el('div', { class: 'arena-team-footer' }, [el('small', { text: note }), el('button', { class: 'btn btn--primary btn--block', text: label, disabled, onclick: action })]);
}
function teamView() {
  // Read-only query is the authority for eligibility/dispatch status. No UI rule copy.
  return Game.teamMatchView();
}
function teamBladeArt(blade) {
  const host = el('div', { class: 'arena-team-art', role: 'img', 'aria-label': `${blade.bladeName || blade.name || '成刀'}的档案外观` });
  const type = KNIFE_TYPES.find(x => x.id === blade.knifeTypeId);
  /* ★ fix：`blade.knifeType` 是模型 id，旧存档可能写入刀型 id；统一走 resolveModelId。 */
  const visual = Game.resolveVisualState(blade, {}, { modelId: resolveModelId(blade, blade.knifeTypeId), viewPreset: 'forge' });
  // Mount once attached, so cached previews are not dropped as disconnected nodes.
  queueMicrotask(() => { if (host.isConnected) mountCollectionPreview(host, blade, visual); });
  return host;
}
function teamBladeCard(blade, { badge, note, action, label, selected = false, disabled = false } = {}) {
  const stats = Object.entries(blade.stats || {}).filter(([key]) => STAT_CN[key]).sort((a, b) => b[1] - a[1]).slice(0, 2);
  return el('article', { class: 'arena-team-card' + (selected ? ' arena-team-choice is-selected' : ''), 'data-blade-id': blade.id }, [
    teamBladeArt(blade), el('div', { class: 'arena-team-copy' }, [
      el('b', { text: blade.bladeName || blade.name || blade.id }),
      el('small', { text: `${KNIFE_TYPES.find(x => x.id === blade.knifeTypeId)?.name || '成刀'} · 评分 ${blade.score ?? '—'}` }),
      el('p', { text: `专长 ${stats.map(([key, value]) => `${STAT_CN[key]} ${value}`).join(' / ') || '未记录'}` }),
      el('span', { class: 'arena-team-badge', text: badge || '资格待赛事校验' }),
      note ? el('small', { text: note }) : null,
    ]), action ? el('button', { class: 'btn', text: label, disabled, 'aria-label': `${label}：${blade.bladeName || blade.name || blade.id}`, 'aria-pressed': String(selected), onclick: action }) : null,
  ]);
}
/* ══ 单刀赛事：3 局 × 35 秒（buff 构筑 + 幽灵分）══════════════ */

function sliceTotal(m) { return m.ghosts?.length || 3; }
function sliceRunNo(m) { return Math.min(sliceTotal(m), m.runIndex + 1); }
function sliceKindLabel(m) {
  return m.kind === 'team' ? 'GLOBAL APEX · 组刀赛' : m.kind === 'national' ? '全国大赛' : TIERS[m.tier].name;
}
function sliceUnit(m) { return m.kind === 'national' ? '轮' : '局'; }

/** 组队赛：派这一局出战的刀 */
function renderSeriesDispatch() {
  const m = Game.sliceMatch;
  body.className = 'arena-body arena-view-quick-setup';
  const pool = Core.arenaSlice.availableBlades(m);
  const cards = m.blades.map((b) => {
    const usable = pool.some((x) => x.id === b.id);
    const used = m.bladeOrder.includes(b.id);
    const sig = BUFF_BY_ID[b.signature];
    return el('button', {
      class: 'choice', type: 'button', disabled: !usable,
      onclick: () => {
        if (!usable) return;
        const r = Game.dispatchSliceBlade(b.id);
        if (!r.ok) { toast(r.reason || '无法派出', 'warn'); return; }
        render();
      },
    }, [
      el('div', { class: 'choice-head' }, [
        el('span', { class: 'choice-kind', text: b.fractured ? '已断刀' : used ? '已出战' : '待命' }),
        el('span', { class: 'chip', text: '评分 ' + b.score }),
        sig ? el('span', { class: 'chip chip--accent', text: '本命 · ' + sig.name }) : null,
      ]),
      el('div', { class: 'choice-title', text: b.name }),
      el('div', { class: 'choice-sub' }, [el('span', { text: sig ? sig.desc : '无本命强化' })]),
    ]);
  });
  mount(body, [
    el('header', { class: 'quick-hero' }, [
      el('h2', { text: '第 ' + sliceRunNo(m) + '/' + sliceTotal(m) + ' 局 · 派谁出战' }),
      el('p', { text: '对手 ' + m.opponent.name + '（评分 ' + m.opponent.score + '）· 本局目标 ' + Core.arenaSlice.ghostOf(m) + ' 分' }),
    ]),
    el('div', { class: 'choice-list' }, cards),
    el('div', { class: 'arena-team-footer' }, [
      el('small', { text: '每把刀只能出战一次，断刀后不能再派；三局两胜，少一把也能翻盘。' }),
      pool.length ? null : el('button', { class: 'btn btn--block', text: '无刀可用 · 记本轮缺席', onclick: () => { Core.arenaSlice.forfeitRound(m); render(); } }),
    ]),
  ]);
}

function buffChip(id, extra = '') {
  const b = BUFF_BY_ID[id];
  if (!b) return null;
  return el('span', { class: 'chip ' + extra, text: `${b.name} · ${BUFF_TIERS[b.tier].name}`, title: b.desc });
}

function sliceOwnedBar(m) {
  if (!m.buffs.length) return el('div', { class: 'muted tiny', text: '本场还没有强化' });
  return el('div', { class: 'row row--wrap' }, m.buffs.map((id) => buffChip(id)));
}

/** 赛前强化三选一 */
function renderSliceBuff() {
  const m = Game.sliceMatch;
  body.className = 'arena-body arena-view-quick-setup';
  const pick = (id) => {
    const r = Game.pickSliceBuff(id);
    if (!r.ok) { toast(r.reason || '无法选择', 'warn'); return; }
    render();
  };
  const cards = m.offers.map((id) => {
    const b = BUFF_BY_ID[id];
    const tier = BUFF_TIERS[b.tier];
    const owned = m.buffs.filter((x) => x === id).length;
    return el('button', {
      class: 'choice choice--build', type: 'button', onclick: () => pick(id),
      'aria-label': `${b.name}：${b.desc}`,
    }, [
      el('div', { class: 'choice-head' }, [
        el('span', { class: 'choice-kind', text: tier.name }),
        el('span', { class: 'chip', text: BUFF_FAMILIES[b.family] }),
        owned ? el('span', { class: 'chip chip--accent', text: `已持有 ×${owned}` }) : null,
      ]),
      el('div', { class: 'choice-title', text: b.name }),
      el('div', { class: 'choice-sub' }, [el('span', { text: b.desc })]),
    ]);
  });
  const params = Core.arenaSlice.currentParams(m);
  mount(body, [
    el('header', { class: 'quick-hero' }, [
      el('h2', { text: m.kind === 'team'
        ? '第 ' + sliceRunNo(m) + '/' + sliceTotal(m) + ' 局 · ' + m.blade.name + ' 出战'
        : '第 ' + sliceRunNo(m) + '/' + sliceTotal(m) + ' ' + sliceUnit(m) + ' · 赛前强化' }),
      el('p', { text: sliceKindLabel(m) + ' · 对手 ' + m.opponent.name + '（评分 ' + m.opponent.score + '）· 本局目标 ' + Core.arenaSlice.ghostOf(m) + ' 分' }),
    ]),
    m.kind === 'national' && m.buffs.length >= 3
      ? el('div', { class: 'muted tiny', text: '已带满 3 个强化，选新的会替换最早获得的「' + (BUFF_BY_ID[m.buffs[0]]?.name || '') + '」' })
      : null,
    el('div', { class: 'row row--between' }, [el('b', { text: '选一项带走' }), sliceOwnedBar(m)]),
    el('div', { class: 'choice-list' }, cards),
    el('details', { class: 'arena-rules' }, [
      el('summary', { text: '本刀参数与规则' }),
      el('div', { class: 'stack' }, [
        el('div', { class: 'report-line', text: `刃长 ${(params.radius / 0.095).toFixed(2)}× · 突破 ${params.hardBase.toFixed(2)} · 容差 ${Math.round(params.tolerance * 180 / Math.PI)}° · 连击窗 ${params.comboWindow.toFixed(2)}s` }),
        el('div', { class: 'report-line', text: `刀况上限 ${Math.round(params.healthMax)} · 得分倍率 ×${(params.spiritMult * params.scoreMult).toFixed(2)}` }),
        el('div', { class: 'muted tiny', text: '三局两胜；每局刀况回满；局内刀况归零且切的是硬靶会断刀。' }),
      ]),
    ]),
    el('div', { class: 'arena-team-footer' }, [
      el('small', { text: '点上面任意一张卡带走；强化只在本场生效，不写入锻造数值。' }),
    ]),
  ]);
}

/** 正在打的一局 */
function renderSliceRun() {
  const m = Game.sliceMatch;
  const started = Game.startSliceRun();
  if (!started.ok) { toast(started.reason || '无法开局', 'warn'); return renderSliceBuff(); }
  const run = started.run;
  sliceRun = run;
  body.className = 'arena-body arena-view-quick-match';
  const ghost = started.ghost;
  const stage = el('section', { class: 'quick-match' });
  const hud = el('div', { class: 'quick-hud' }, [
    el('div', { class: 'quick-hud-time' }, [
      el('small', { text: `第 ${sliceRunNo(m)}/3 局` }), el('b', { class: 'mono', text: run.remaining.toFixed(1) }), el('span', { text: '秒' }),
    ]),
    el('div', { class: 'quick-hud-score' }, [
      el('small', { text: `目标 ${ghost}` }), el('b', { class: 'mono', text: '0000' }),
    ]),
    el('div', { class: 'quick-hud-vitals' }, [
      el('small', { text: '刀况' }), el('b', { text: `${Math.round(run.health)}%` }), el('i', {}),
    ]),
  ]);
  const mission = el('div', { class: 'quick-stage-label' }, [el('b', { text: '热身' }), el('span', { text: '' })]);
  const canvas = el('canvas', { class: 'quick-canvas', 'aria-label': '赛事切割场；按住划过材料完成切割' });
  const footer = el('div', { class: 'quick-footer' }, [
    el('span', { class: 'quick-combo', text: '切断 0 · 连击 ×1' }),
    el('button', { class: 'quick-pause quick-pause-toggle', 'aria-label': '暂停', title: '暂停', onclick: () => { Challenge.setPaused(run, !run.paused); render(); } }, [icon('pause')]),
  ]);
  stage.append(hud, mission, canvas, footer);
  body.appendChild(stage);
  const updateMission = () => {
    const names = { warmup: '热身', route: '路线', speed: '提速', finale: '压轴' };
    mission.querySelector('b').textContent = `${sliceRunNo(m)}/3 · ${names[run.phase] || '进行中'}`;
    const delta = Math.round(run.score - ghost);
    mission.querySelector('span').textContent = delta >= 0 ? `领先 ${delta} 分` : `距目标 ${-delta} 分`;
  };
  renderChallengeCanvas(canvas, run, {
    hud, mission, footer, updateMission,
    onDone: () => {
      const perf = run.result;
      sliceRun = null;
      Game.finishSliceRun(perf);
      render();
    },
  });
}

/** 单局结算 */
function renderSliceSaveFailure() {
  const result = Game.retrySliceSave();
  if (result?.ok !== false && !result?.error) return false;
  mount(body, el('div', { class: 'card', role: 'alert', text: result.reason || result.error || '本场保存失败，请重试' }),
    el('button', { class: 'btn btn--primary', text: '重试结算', onclick: () => render() }));
  return true;
}

function renderSliceRunResult() {
  const m = Game.sliceMatch;
  if (renderSliceSaveFailure()) return;
  const r = m.lastRun;
  body.className = 'arena-body arena-view-quick-report';
  const win = r.win;
  mount(body, [
    el('section', { class: 'quick-report' }, [
      el('div', { class: 'quick-kicker', text: sliceKindLabel(m) + ' · 第 ' + (r.index + 1) + '/' + sliceTotal(m) + ' ' + sliceUnit(m) }),
      el('div', { class: 'quick-result-heading' }, [
        el('div', { class: 'quick-grade', text: r.grade }),
        el('div', {}, [el('h2', { text: win ? '本局拿下' : '本局失守' }), el('p', { text: `${m.blade.name} 对阵 ${m.opponent.name}` })]),
        el('div', { class: 'quick-total' }, [el('small', { text: '本局得分' }), el('b', { class: 'mono', text: String(r.score).padStart(4, '0') }), el('span', { text: 'PTS' })]),
      ]),
      el('div', { class: 'quick-result-stats' }, [
        ['目标', r.ghost], ['切断', r.kills], ['最高连击', r.maxCombo], ['最佳一刀', r.bestSwipe],
      ].map(([a, b]) => el('div', {}, [el('small', { text: a }), el('b', { text: String(b) })]))),
      el('div', { class: 'quick-reward' }, [
        el('span', { text: `场上比分 ${m.wins || 0} : ${m.losses || 0} · 刀况 ${r.health}/${r.maxHealth}` }),
        el('b', { text: win ? '胜' : '负' }),
      ]),
      el('div', { class: 'quick-report-actions' }, [
        el('button', { class: 'btn btn--primary', text: m.finishedRuns ? '查看战报' : m.kind === 'team' ? '派下一把刀' : '进入第 ' + (m.runIndex + 1) + ' 局', onclick: () => { Game.nextSliceRun(); render(); } }),
      ]),
    ]),
  ]);
}

/** 整场战报 */
function renderSliceReport() {
  const m = Game.sliceMatch;
  if (renderSliceSaveFailure()) return;
  const res = m.result || {};
  body.className = 'arena-body arena-view-quick-report';
  const rows = res.runs.map((r) => el('div', { class: 'report-line' }, [
    el('span', { text: '第 ' + (r.index + 1) + ' ' + sliceUnit(m) + (r.bladeName ? ' · ' + r.bladeName : '') }),
    el('span', { class: r.win ? 'chip chip--accent' : 'chip', text: r.win ? '胜' : '负' }),
    el('span', { text: r.score + ' / ' + r.ghost }),
  ]));
  const buildList = m.kind === 'team'
    ? (res.allBuffs || []).map((b) => el('div', { class: 'stack' }, [
        el('div', { class: 'muted tiny', text: b.bladeName }),
        el('div', { class: 'row row--wrap' }, b.buffs.map((id) => buffChip(id))),
      ]))
    : [sliceOwnedBar(m)];
  const verdict = res.fractured && m.kind === 'national' ? '结构失效 · 本届淘汰'
    : m.kind === 'national' ? (res.win ? '全国赛冠军' : '本届止步')
      : res.fractured ? '结构失效 · 断刀退赛' : res.win ? '赛事获胜' : '赛事落败';
  mount(body, [
    el('section', { class: `circuit-verdict ${res.win ? 'is-win' : 'is-lose'}` }, [
      el('div', { class: 'quick-kicker', text: sliceKindLabel(m) }),
      el('div', { class: 'circuit-verdict-title', text: verdict }),
      el('div', { class: 'circuit-scoreline' }, [
        el('div', {}, [el('small', { text: '我方总分' }), el('b', { class: 'mono', text: String(res.score) })]),
        el('span', { text: 'VS' }),
        el('div', {}, [el('small', { text: '对手目标' }), el('b', { class: 'mono', text: String(res.ghost) })]),
      ]),
      el('div', { class: 'circuit-opponent-name', text: `${res.wins || 0} 胜 ${res.losses || 0} 负 · ${m.blade.name} 对阵 ${m.opponent.name}` }),
    ]),
    el('div', { class: 'quick-result-stats' }, [
      ['最高连击', res.maxCombo || 0], ['总漏切', res.runs.reduce((a, r) => a + (r.misses || 0), 0)], ['获得', `+${m.reward || 0} CR`],
    ].map(([a, b]) => el('div', {}, [el('small', { text: a }), el('b', { text: String(b) })]))),
    el('div', { class: 'stack' }, [
      el('div', { class: 'section-title', text: m.kind === 'team' ? '三局比分（每把刀一局）' : '各局比分' }),
      ...rows,
      el('div', { class: 'section-title', text: '本场构筑' }),
      ...buildList,
    ]),
    el('div', { class: 'quick-report-actions' }, [
      el('button', { class: 'btn btn--primary', text: '再来一场', onclick: () => { Game.clearSliceMatch(); render(); } }),
      el('button', { class: 'btn', text: '回首页', onclick: () => { Game.clearSliceMatch(); router.go('home'); } }),
    ]),
  ]);
}

/* ══ 正式多项目赛（rework T06） ══════════════════════════ */

/**
 * 正式赛战报。
 * ★ 只读 core 已算好的 result，页面不重算任何倍率或权重（T14：展示只读结果）。
 * ★ 明确写出“本场无永久断刀”，并标出政策仍待定，不把未定写成已定。
 */
function renderFormalReport() {
  const m = Game.formalMatch;
  const r = m?.result;
  if (!r) { mount(body, [el('p', { class: 'arena-note', text: '没有可显示的战报。' })]); return; }
  body.className = 'arena-body arena-view-quick-report';
  const d = r.definition || {};
  const scoreRows = (r.projectScores || []).map((p) => el('div', { class: 'report-line' }, [
    el('span', { text: p.name + (p.failed ? '（临时失效）' : '') }),
    el('span', { class: p.score === null ? 'chip' : 'chip chip--accent', text: p.score === null ? p.status : String(p.score) }),
    el('span', { class: 'mono', text: `×${(r.weights?.[p.kind] ?? 0).toFixed(2)}` }),
  ]));
  const saveFail = m.done && !m.settled;
  mount(body, [
    el('section', { class: `circuit-verdict ${r.win ? 'is-win' : 'is-lose'}` }, [
      el('div', { class: 'quick-kicker', text: `${d.branchName || '正式赛'} · ${d.gradientName || ''}` }),
      el('div', { class: 'circuit-verdict-title', text: r.headline || (r.win ? '达标' : '未达标') }),
      el('div', { class: 'circuit-scoreline' }, [
        el('div', {}, [el('small', { text: '切割分' }), el('b', { class: 'mono', text: String(r.composite) })]),
        el('span', { text: 'VS' }),
        el('div', {}, [el('small', { text: '目标分' }), el('b', { class: 'mono', text: String(r.target) })]),
      ]),
      el('div', { class: 'circuit-opponent-name', text: `${r.bladeName || m.blade.name} · ${r.margin >= 0 ? '超出' : '差'} ${Math.abs(r.margin)} 分` }),
    ]),
    el('div', { class: 'quick-result-stats' }, [
      ['精准命中',m.session.entries[0]?.result?.detail?.perfects || 0],
      ['有效破甲',m.session.entries[0]?.result?.detail?.armorBreaks || 0],
      ['临时损伤', `${Math.round((r.temporaryDamage || 0) * 100)}%`],
      ['获得', `+${m.reward || 0} CR`],
    ].map(([a, b]) => el('div', {}, [el('small', { text: a }), el('b', { text: String(b) })]))),
    el('div', { class: 'stack' }, [
      el('div', { class: 'section-title', text: '分项成绩（权重来自赛事定义）' }),
      ...scoreRows,
      r.honors?.length?el('div',{class:'row row--wrap'},r.honors.map(text=>el('span',{class:'chip chip--accent',text}))):null,
      r.report ? el('div', { class: 'section-title', text: '赛报' }) : null,
      ...((r.report?.lines || []).map((line) => el('p', { class: 'arena-note', text: line }))),
      el('p', { class: 'arena-note', text: '刀况耗尽将结束本轮；临时损伤不影响收藏刀具。' }),
    ]),
    saveFail ? el('p', { class: 'arena-note', text: '本场记录尚未保存。' }) : null,
    /* ★ rework T12：赛后也给出“下一步”。
       任务书要求「首页、**赛后**和图鉴可追踪一个下一步目标」，
       改造前只有首页有，打完一场就不知道干嘛了。
       这里复用 progress.nextGoal()（core 唯一真源），不另写一套优先级。 */
    postMatchGoal(() => Game.clearFormalMatch()),
    el('div', { class: 'quick-report-actions' }, [
      saveFail ? el('button', { class: 'btn btn--primary', text: '重试保存', onclick: () => { const x = Game.retryFormalSave(); if (!x?.ok) toast(x?.reason || '保存仍然失败', 'warn'); render(); } }) : null,
      el('button', { class: 'btn btn--primary', text: '再打一场', onclick: () => { Game.clearFormalMatch(); render(); } }),
      el('button', { class: 'btn', text: '去藏刀阁', onclick: () => { Game.clearFormalMatch(); router.go('workshop'); } }),
      el('button', { class: 'btn', text: '回首页', onclick: () => { Game.clearFormalMatch(); router.go('home'); } }),
    ].filter(Boolean)),
  ]);
}

/* ══ 三刀巅峰赛（rework T09） ══════════════════════════ */

/**
 * 赛后「下一个目标」卡片（rework T12）。
 *
 * ★ 目标由 `Core.progress.nextGoal()` 计算（core 单一真源），页面只展示与跳转。
 * ★ 点击前先清理当前战报（调用方传入的 clear），避免回到页面后又被旧战报抢走。
 */
function postMatchGoal(clear) {
  const goal = Core.progress.nextGoal();
  if (!goal) return null;
  return el('button', {
    class: 'home-goal arena-post-goal', type: 'button',
    'aria-label': `下一个目标：${goal.title}`,
    onclick: async (event) => {
      const button = event.currentTarget;
      if (button.disabled) return;
      if (goal.route === 'forge') {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
        try {
          if (!(Game.run && !Game.run.finished)) Game.startForge({ mode: 'normal' });
          await Game.prewarmCandidates();
          clear?.();
          router.go('forge');
        } catch (error) {
          console.warn('[forge] preparation', error);
          toast('工艺准备未完成，请重试', 'warn');
          button.disabled = false;
          button.removeAttribute('aria-busy');
        }
        return;
      }
      if (goal.route === 'workshop') {
        clear?.();
        Workshop.openTab(goal.tab || 'collection');
        return;
      }
      clear?.();
      router.go(goal.route || 'arena');
    },
  }, [
    el('span', { class: 'home-goal-kicker', text: '下一个目标' }),
    el('b', { class: 'home-goal-title', text: goal.title }),
    el('span', { class: 'home-goal-desc', text: goal.desc || '' }),
    el('span', { class: 'home-goal-action', text: `${goal.action || '前往'} →` }),
  ]);
}

/**
 * 三刀赛：派刀 / 当前轮 / 轮间结果。
 * ★ 每轮主题不同（切割 / 结构耐久 / 精度综合），已出场的刀不能重复派出 ——
 *   这个约束在 core 里强制，UI 只负责展示可选池。
 */
function renderApexMatch() {
  const m = Game.apexMatch;
  body.className = 'arena-body arena-view-team';
  const round = m.rounds[m.roundIndex];
  const available = (Core.arenaFormal.apexAvailable(m) || []);
  const blades = Core.progress.collection().filter(b => b.canEnterArena !== false && !b.fractured);

  if (round?.status === 'active' && round.match) {
    /* 当前轮：复用同一套测试舞台，提交转发到 apexSubmit */
    const task = Core.arenaFormal.testTask(round.match);
    if (task?.kind === 'cutting') renderUnifiedFormalCut(round.match, task,
      payload => Game.apexSubmit(payload),
      () => Game.apexSubmit({ measure: 0, failed: true }),
      {tier:'apex',round:m.roundIndex});
    else FormalTest.renderFormalTest(round.match, body, render, {
      submit: (payload) => Game.apexSubmit(payload),
      taskOverride: task,
    });
    return;
  }

  const rounds = el('ol', { class: 'arena-team-rounds', 'aria-label': '三轮项目进度' }, m.rounds.map((r) => el('li', {
    class: r.status === 'complete' ? 'is-complete' : r.status === 'active' ? 'is-current' : '',
    'aria-current': r.round === m.roundIndex ? 'step' : null,
    text: `${r.label}${r.dispatchedBladeId ? ' · 已派刀' : ''}${r.status === 'complete' ? ' ✓' : ''}`,
  })));

  const list = el('div', { class: 'arena-team-list' }, available.map((b) => {
    const rec = blades.find((x) => x.id === b.id);
    return el('button', {
      class: 'btn', 'aria-label': `派出 ${b.name}`,
      onclick: () => {
        const r = Game.apexDispatch(b.id);
        if (!r?.ok) { toast(r?.reason || '无法派刀', 'warn'); return; }
        render();
      },
      text: `${b.name} · 评分 ${b.score}${rec ? '' : ' · 已不可用'}`,
    });
  }));

  mount(body, [
    el('div', { class: 'quick-kicker', text: `全球巅峰赛 · 第 ${m.roundIndex + 1}/${m.rounds.length} 轮` }),
    el('h1', { text: round?.label || '三轮已完' }),
    el('p', { class: 'arena-note', text: '三把不同的刀，每把只出场一次。赛前顺序锁定，每轮单刀完整结构挑战。' }),
    rounds,
    el('div', { class: 'section-title', text: available.length ? '选择本轮出场的刀' : '没有可用的刀' }),
    list,
    el('p', { class: 'arena-note', text: '刀况与强化仅作用于本轮，收藏刀具保留。' }),
  ]);
}

function renderApexReport() {
  const m = Game.apexMatch;
  const r = m?.result;
  if (!r) { mount(body, [el('p', { class: 'arena-note', text: '没有可显示的战报。' })]); return; }
  body.className = 'arena-body arena-view-quick-report';
  const rows = (r.roundsDetail || []).map((x) => el('div', { class: 'report-line' }, [
    el('span', { text: x.label }),
    el('span', { class: x.win ? 'chip chip--accent' : 'chip', text: x.win === null ? '未进行' : x.win ? '胜' : '负' }),
    el('span', { class: 'mono', text: x.composite === null ? '—' : `${x.composite}` }),
    el('span', { class: 'muted tiny', text: x.bladeId || '未派刀' }),
  ]));
  const saveFail = m.done && !m.settled;
  mount(body, [
    el('section', { class: `circuit-verdict ${r.win ? 'is-win' : 'is-lose'}` }, [
      el('div', { class: 'quick-kicker', text: 'GLOBAL APEX · 三刀巅峰赛' }),
      el('div', { class: 'circuit-verdict-title', text: r.report?.headline || (r.win ? '达标' : '未达标') }),
      el('div', { class: 'circuit-opponent-name', text: `完成 ${r.rounds}/${m.rounds.length} 轮 · 胜 ${r.wins} 轮 · 切割分 ${r.composite}` }),
    ]),
    el('div', { class: 'stack' }, [
      el('div', { class: 'section-title', text: '各轮成绩' }),
      ...rows,
      ...((r.report?.lines || []).map((line) => el('p', { class: 'arena-note', text: line }))),
      el('p', { class: 'arena-note', text: '本场仅消耗局内刀况，不影响永久藏刀；三刀按赛前顺序出战，通关或确认退出后写入荣誉记录。' }),
    ]),
    saveFail ? el('p', { class: 'arena-note', text: '本届成绩尚未领奖；可按固定顺序和种子补考，历史最佳成绩不降低。' }) : null,
    el('div', { class: 'quick-report-actions' }, [
      
      ...(!m.settled ? m.rounds.map((round,i)=>el('button',{
        class:'btn',text:'补考第 '+(i+1)+' 轮（保留最佳合法成绩）',
        onclick:()=>{const x=Game.retryApexRound(i);if(!x?.ok)toast(x?.reason||'无法补考','warn');render();}
      })) : []),
      !m.settled ? el('button',{class:'btn btn--primary',text:'确认本届成绩并领奖',
        onclick:()=>{const x=Game.finishApexCareer();if(!x?.ok)toast(x?.reason||'保存失败','warn');render();}}):null,
      m.settled ? el('button', { class: 'btn btn--primary', text: '再来一场', onclick: () => { Game.clearApexMatch(); render(); } }) : null,
      m.settled ? el('button', { class: 'btn', text: '回首页', onclick: () => { Game.clearApexMatch(); router.go('home'); } }) : null,
    ].filter(Boolean)),
  ]);
}

/* ══ 全国大赛（rework T09） ══════════════════════════ */

/**
 * 全国大赛：五轮多项目测试。
 * ★ 代表刀整届锁定；一败即淘汰；普通淘汰**不**断刀。
 * ★ 每轮用 composite 三项真实测试，不是重复同一套切割目标分。
 */
function renderNationalMatch() {
  const m = Game.nationalMatch;
  body.className = 'arena-body arena-view-team arena-view-national';
  const round = Core.arenaFormal.nationalCurrentRound(m);

  /* 当前轮已派发 → 复用同一套测试舞台，提交转发到 nationalSubmitRound */
  if (round?.status === 'active' && round.roundMatch) {
    const task = Core.arenaFormal.testTask(round.roundMatch);
    if (task?.kind === 'cutting') renderUnifiedFormalCut(round.roundMatch, task,
      payload => Game.nationalSubmitRound(payload),
      () => Game.nationalAbandonRound(),
      {tier:'national',round:m.roundIndex});
    else FormalTest.renderFormalTest(round.roundMatch, body, render, {
      submit: (payload) => Game.nationalSubmitRound(payload),
      taskOverride: task,
    });
    return;
  }

  const rounds = el('ol', { class: 'arena-team-rounds', 'aria-label': '全国赛五轮进度' }, m.rounds.map((r) => el('li', {
    class: r.status === 'complete' ? 'is-complete' : r.status === 'active' ? 'is-current' : r.status === 'not-run' || r.status === 'abandoned' ? 'is-skipped' : '',
    'aria-current': r.round === m.roundIndex ? 'step' : null,
    text: `${r.label}${r.status === 'complete' ? ' ✓' : r.status === 'abandoned' ? ' 已退出' : ''}`,
  })));

  mount(body, [
    el('div', { class: 'quick-kicker', text: `全国大赛 · 第 ${m.roundIndex + 1}/${m.rounds.length} 轮` }),
    el('h1', { text: round?.label || '本届已结束' }),
    el('p', { class: 'arena-note', text: `代表刀整届锁定：${m.blade.name}。每轮 90–110 秒结构拆解；每轮结果保存检查点，失败在本轮重试。` }),
    rounds,
    el('p', { class: 'arena-note', text: '失败可从当前轮以同种子重试；已通关轮次与收藏成刀完整保留。' }),
    el('p', { class: 'arena-note', text: '每轮重置临时刀况；未达标可再次挑战当前结构。' }),
    el('div', { class: 'quick-report-actions' }, [
      el('button', {
        class: 'btn btn--primary',
        text: `开始第 ${m.roundIndex + 1} 轮 · ${round?.label || ''}`,
        onclick: () => {
          const r = Game.nationalStartRound();
          if (!r?.ok) { toast(r?.reason || '无法开始本轮', 'warn'); return; }
          render();
        },
      }),
      el('button', {
        class: 'btn', text: '退出本届',
        onclick: () => {
          const r = Game.nationalAbandonRound();
          if (!r?.ok) { toast(r?.reason || '退出失败', 'warn'); return; }
          render();
        },
      }),
    ]),
  ]);
}

function renderNationalReport() {
  const m = Game.nationalMatch;
  const r = m?.result;
  if (!r) { mount(body, [el('p', { class: 'arena-note', text: '没有可显示的战报。' })]); return; }
  body.className = 'arena-body arena-view-quick-report';
  const rows = (r.roundsDetail || []).map((x) => el('div', { class: 'report-line' }, [
    el('span', { text: x.label }),
    el('span', { class: x.win ? 'chip chip--accent' : 'chip', text: x.win === null ? (x.status === 'abandoned' ? '已退出' : '未进行') : x.win ? '胜' : '负' }),
    el('span', { class: 'mono', text: x.composite === null ? '—' : `${x.composite} / ${x.target}` }),
  ]));
  const saveFail = m.done && !m.settled;
  mount(body, [
    el('section', { class: `circuit-verdict ${r.champion ? 'is-win' : 'is-lose'}` }, [
      el('div', { class: 'quick-kicker', text: 'NATIONAL · 全国大赛' }),
      el('div', { class: 'circuit-verdict-title', text: r.report?.headline || (r.champion ? '全国冠军' : '本届结束') }),
      el('div', { class: 'circuit-opponent-name', text: `代表刀 ${r.bladeName} · 完成 ${r.rounds}/${m.rounds.length} 轮 · 胜 ${r.wins} 轮` }),
    ]),
    el('div', { class: 'stack' }, [
      el('div', { class: 'section-title', text: '各轮成绩' }),
      ...rows,
      ...((r.report?.lines || []).map((line) => el('p', { class: 'arena-note', text: line }))),
      el('p', { class: 'arena-note', text: '普通淘汰不等于断刀：成刀、外观配方与全部履历都保留，可以再战一届。' }),
      el('p', { class: 'arena-note', text: '正式断刀概率、跨项目受损与退出细则仍待定（FORMAL_RISK_TBD）。临时损伤不影响永久属性。' }),
    ]),
    saveFail ? el('p', { class: 'arena-note', text: '本届记录尚未保存。' }) : null,
    el('div', { class: 'quick-report-actions' }, [
      saveFail ? el('button', { class: 'btn btn--primary', text: '重试保存', onclick: () => { const x = Game.retryNationalSave(); if (!x?.ok) toast(x?.reason || '保存仍然失败', 'warn'); render(); } }) : null,
      el('button', { class: 'btn btn--primary', text: '再战一届', onclick: () => { Game.clearNationalMatch(); render(); } }),
      el('button', { class: 'btn', text: '去藏刀阁', onclick: () => { Game.clearNationalMatch(); router.go('workshop'); } }),
      el('button', { class: 'btn', text: '回首页', onclick: () => { Game.clearNationalMatch(); router.go('home'); } }),
    ].filter(Boolean)),
  ]);
}

function renderTeam() {
  body.className = 'arena-body arena-view-team';
  const team = teamView().team;
  if (!team) return renderTeamSetup();
  if (team.status === 'round' && team.activeMatch) {
    if (team.activeMatch.done) return renderTeamRoundReport();
    renderMatch();
    if (body.classList.contains('arena-view-event')) {
      body.classList.add('arena-team-event');
      body.prepend(el('div', { class: 'arena-team-rounds', text: `组刀赛 · 第 ${team.rounds.length + 1}/${team.policy.roundCount} 轮 · 当前刀名额已消耗` }));
    }
    return;
  }
  if (team.status === 'complete' || team.status === 'settled') return renderTeamReport();
  renderTeamDispatch();
}
function renderTeamSetup() {
  const blades = Core.progress.collection();
  teamSelection = teamSelection.filter(id => blades.some(b => b.id === id));
  if (!teamSelection.length) teamSelection = blades.slice(0, 3).map(b => b.id);
  mount(body, [modeSwitch(), teamHeading('GLOBAL APEX · 暂定组刀赛', '组成你的三刀队伍', '三把不同作品，逐轮手动派出；同刀本场仅一次。')]);
  const selectedBlades = teamSelection.map(id => blades.find(b => b.id === id));
  const qualification = Core.arenaTeam.validateRoster(selectedBlades);
  const list = el('div', { class: 'arena-team-list' });
  for (let i = 0; i < 3; i++) {
    const blade = blades.find(b => b.id === teamSelection[i]);
    const replace = () => {
      const options = el('div', { class: 'arena-view-team arena-team-sheet' }, blades.map(candidate => teamBladeCard(candidate, {
        badge: teamSelection.includes(candidate.id) ? '已在队伍' : '资格由赛事校验',
        label: '选入', disabled: teamSelection.includes(candidate.id) && candidate.id !== teamSelection[i],
        action: () => { teamSelection[i] = candidate.id; handle.close(); render(); },
      })));
      const handle = sheet({ title: `替换第 ${i + 1} 把作品`, body: options });
    };
    list.append(blade ? teamBladeCard(blade, { badge: qualification.ok ? '队伍资格校验通过' : '待校验 · 请检查阵容', label: '替换', action: replace }) : el('button', { class: 'btn arena-team-card', text: `选择第 ${i + 1} 把刀`, onclick: replace }));
  }
  body.append(list);
  if (blades.length < 3) body.append(el('p', { class: 'arena-note', text: '需要三把不同的合格成刀。可先去锻造或藏刀阁准备，不要求刀型不同。' }));
  if (!THEMES.some(x => x.id === themeId)) themeId = THEMES[0]?.id || null;
  const select = el('select', { class: 'arena-team-theme', 'aria-label': '组刀赛事主题', onchange: event => { themeId = event.target.value; } }, THEMES.map(x => el('option', { value: x.id, text: x.name, selected: x.id === themeId })));
  if (!qualification.ok && teamSelection.length === 3) body.append(el('small', { text: qualification.reason }));
  body.append(select, teamFooter('三把刀各打一局 45 秒，各自构筑三次强化。', '确认队伍，开始派刀', () => {
    const r = Game.startSliceMatch({
      bladeIds: [...teamSelection], kind: 'team', tier: 'apex', styleId,
      theme: THEMES.find((x) => x.id === themeId),
    });
    if (!r?.ok) { toast(r?.reason || '无法开始组队赛', 'warn'); return; }
    render();
  }, teamSelection.length !== 3 || new Set(teamSelection).size !== 3 || !qualification.ok));
}
function teamRoundStrip(team) {
  return el('div', { class: 'arena-team-rounds', 'aria-label': '各轮战况' }, Array.from({ length: team.policy.roundCount }, (_, i) => {
    const round = team.rounds[i];
    return el('span', { text: `${i + 1} ${round ? (round.match.result?.unavailableBlade ? '缺席负' : round.match.result?.win ? '胜' : '负') : '待赛'}` });
  }));
}
function renderTeamDispatch() {
  const view = teamView(), team = view.team;
  mount(body, [teamHeading('GLOBAL APEX · 手动派刀', `第 ${team.rounds.length + 1}/${team.policy.roundCount} 轮，派谁出战？`, '派出成功即消耗本场名额，断刀后仍可派出其余作品。'), teamRoundStrip(team),
    el('section', { class: 'arena-team-target' }, [el('b', { text: team.theme?.name || '巅峰赛事当前主题' }), el('p', { text: team.theme?.desc || '对手与赛前事件以本轮赛事实际提供为准；派刀后揭晓。' })]),
  ]);
  const list = el('div', { class: 'arena-team-list' });
  const states = view.roster;
  for (const blade of team.roster) {
    const state = states.find(x => x.id === blade.id);
    const used = state.used;
    const canDispatch = state.canDispatch;
    const unavailable = state.reason === 'BLADE_ALREADY_FRACTURED';
    list.append(teamBladeCard(blade, {
      badge: state.reasonText || '可派出 · 名额未用',
      note: teamDispatchId === blade.id ? '已选中 · 确认后派出' : null,
      label: unavailable ? '缺席' : used ? '已用' : '选择', disabled: !canDispatch && !unavailable,
      selected: blade.id === teamDispatchId,
      action: unavailable ? () => confirmTeamAbsence(blade) : () => { teamDispatchId = blade.id; render(); },
    }));
  }
  body.append(list, teamFooter('不自动派刀，不补回已用名额；当前队伍已保存。', '确认派出当前刀', () => { const id = teamDispatchId; if (teamWrite(Game.dispatchTeamBlade(id))) teamDispatchId = null; }, !view.roster.some(x => x.id === teamDispatchId && x.canDispatch)));
}
function confirmTeamAbsence(blade) {
  const content = el('div', { class: 'arena-team-report' }, [el('p', { text: `「${blade.bladeName || blade.name}」已在断刀册。本次确认将消耗它的队伍名额，并将本轮记为缺席负；不会复活刀具，也不会伪造测试成绩。此操作不能撤回。` }),
    el('button', { class: 'btn btn--primary btn--block', text: '确认缺席，本轮计负', onclick: () => { const result = Game.teamForfeitUnavailableBlade(blade.id); if (result.ok) { handle.close(); teamDispatchId = null; render(); } else teamWrite(result, false); } }),
    el('button', { class: 'btn btn--block', text: '取消，保留当前队伍', onclick: () => handle.close() }),
  ]);
  const handle = sheet({ title: '确认断刀缺席', body: content });
}
function renderTeamRoundReport() {
  const team = teamView().team, m = team.activeMatch, r = m.result;
  mount(body, [teamHeading(`第 ${team.rounds.length + 1}/${team.policy.roundCount} 轮战报`, r.unavailableBlade ? '断刀缺席 · 本轮负' : r.bladeDestroyed ? '当前刀断裂 · 本轮结束' : r.win ? '本轮获胜' : '本轮落败', `${m.blade.name} · 本轮不发奖励，不提前结束整场。`),
    !r.unavailableBlade ? el('div', { class: 'arena-team-score', text: `我方 ${r.composite} : ${r.oppComposite} 对手` }) : null,
    r.bladeDestroyed ? el('p', { text: '确认本轮后，当前作品转入断刀册，保留锻造、外观和比赛履历；其他队员不受损，继续手动派刀。' }) : null,
    Formal.renderSuiteDiagnostics(m), teamFooter('确认本轮后保存赛果，再由你选择下一把刀。', '确认本轮，继续组刀赛', () => { teamDispatchId = null; teamWrite(Game.finishTeamRound()); }),
  ]);
}
function renderTeamReport() {
  const team = teamView().team, r = team.result;
  mount(body, [teamHeading('GLOBAL APEX · 整场战报', r?.win ? '队伍多数胜' : '队伍落败', `已完成 ${team.rounds.length}/${team.policy.roundCount} 轮 · 不合成三把刀评分。`),
    el('div', { class: 'arena-team-score', text: `${r?.wins ?? 0} 胜 : ${r?.losses ?? 0} 负` }), teamRoundStrip(team),
    el('div', { class: 'arena-team-list' }, team.rounds.map(round => el('section', { class: 'arena-team-target' }, [el('b', { text: `第${round.index}轮 · ${round.match.blade.name}` }), el('p', { text: round.match.result?.unavailableBlade ? '断刀缺席计负 · 未进行实测' : `${round.match.result?.win ? '获胜' : '落败'}${round.match.result?.bladeDestroyed ? ' · 已转入断刀册' : ''} · 本轮奖励 0 CR` })]))),
    team.status === 'settled' ? teamFooter(`整场已结算 +${team.settlement?.cr ?? 0} CR，不会重复领取。`, '返回赛事入口', () => { teamSelection = []; arenaMode = 'tournament'; render(); }) : teamFooter('只结算整场一次；原有成就奖励仍可能触发。', '确认整场结算', () => teamWrite(Game.finishTeamMatch())),
  ]);
}

function stopTeamStage(pause = false) { const cleanup = teamStageCleanup; teamStageCleanup = null; cleanup?.(pause); }
function renderTeamTest() {
  body.className = 'arena-body arena-view-team';
  let m = currentArenaMatch();
  if (!m.formalPerformance) {
    if (!teamUpdate(draft => Suite.createSuite(draft), false)) return;
    m = currentArenaMatch();
  }
  const suite = m.formalPerformance;
  const entry = Suite.currentSuiteTest(suite);
  mount(body, [teamHeading(`组刀赛 · 第 ${teamView().currentRound} 轮`, `${entry.name} · 正式实测`, '沿用原三项测试；不新增切割分、权重或断刀规则。'),
    el('div', { class: 'arena-team-rounds' }, suite.entries.map(x => el('span', { text: `${x.name}${x.status === 'complete' ? ' ✓' : x.status === 'not-run' ? ' 未进行' : ''}` }))),
  ]);
  if (!suite.started) {
    body.append(el('section', { class: 'arena-team-target' }, [el('p', { text: '切割：沿虚线划过靶具。精度：从刀尖拖到工件刻度。强度：按住加载区，在承压窗内松手。正式切割可能断刀；精度和强度只记原操作诊断。' })]),
      teamFooter('所有已保存的策略与实测进度均可刷新恢复。', '开始切割测试', () => teamUpdate(draft => ({ ok: Suite.startSuite(draft) }))));
    return;
  }
  if (entry.status === 'complete') {
    body.append(Formal.renderSuiteDiagnostics(m));
    if (entry.kind !== 'cutting') body.append(el('button', { class: 'btn', text: '重试本项', onclick: () => teamUpdate(draft => {
      Suite.startSuite(draft);
      draft.teamOperation = Performance.resetOperation(draft.teamOperation);
      draft.formalPerformance.operation = draft.teamOperation;
      const current = Suite.currentSuiteTest(draft.formalPerformance);
      current.status = 'pending'; current.result = null;
      return { ok: true };
    }) }));
    const last = suite.index === suite.entries.length - 1;
    body.append(teamFooter('本轮成绩提交后仍需确认轮次；此处不发 CR。', last ? '提交三项成绩，查看本轮战报' : `下一项：${suite.entries[suite.index + 1].name}`, () => teamUpdate(draft => {
      Suite.startSuite(draft);
      if (last) return Suite.submitSuite(draft);
      draft.teamOperation = null;
      return { ok: Suite.advanceSuite(draft.formalPerformance) };
    })));
    return;
  }
  if (!m.teamOperation) {
    const initialized = teamUpdate(draft => {
      if (entry.kind === 'cutting') {
        const seed = (draft.seed ^ 0x6f2a91d3 ^ [...String(draft.fieldTest.type)].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261)) >>> 0;
        const created = Challenge.createChallenge(draft.blade, { seed, mode: 'formal' });
        if (!created.ok) return created;
        draft.teamOperation = created.run;
      } else {
        const task = Core.arena.fieldTestTask(draft);
        draft.teamOperation = Performance.createPerformance(entry.kind, draft.blade.stats, { PROTOTYPE_INPUT: {
          precision: { target: { x: task.center, y: Performance.PROTOTYPE_INPUT.precision.target.y }, tolerance: task.width * .5 },
          strength: { loadWindow: { min: task.center - task.width * .5, max: task.center + task.width * .5 } },
        } });
      }
      return { ok: true };
    }, false);
    if (!initialized) return;
    m = currentArenaMatch();
  }
  if (entry.kind === 'cutting') return renderTeamCutStage();
  renderTeamOperationStage();
}
function teamTestStage(instructions) {
  const stage = el('section', { class: 'arena-team-stage arena-team-test' });
  const hud = el('div', { class: 'arena-team-hud', role: 'status', 'aria-live': 'off' });
  const canvas = el('canvas', { 'aria-label': instructions });
  const feedback = el('p', { class: 'arena-team-feedback', role: 'status', text: instructions });
  stage.append(hud, canvas, feedback); body.append(stage);
  const ctx = canvas.getContext('2d');
  const resize = () => { const r = canvas.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1); canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); ctx?.setTransform(dpr, 0, 0, dpr, 0, 0); return r; };
  const point = event => { const r = canvas.getBoundingClientRect(); return { x: (event.clientX - r.left) / r.width, y: (event.clientY - r.top) / r.height }; };
  return { stage, hud, canvas, feedback, ctx, resize, point };
}
function renderTeamCutStage() {
  const read = () => currentArenaMatch()?.teamOperation;
  const run = read();
  if (run.done) {
    teamUpdate(draft => {
      Suite.startSuite(draft);
      const captured = Suite.captureCut(draft.formalPerformance, draft.teamOperation.result);
      if (!captured) return { ok: false, reason: '切割成绩尚未保存，请重试' };
      if (Challenge.hasStructuralFailure(draft.teamOperation.result)) return Suite.submitSuite(draft);
      return { ok: true };
    });
    return;
  }
  if (run.phase.endsWith('-choice')) {
    const finale = run.phase === 'finale-choice';
    body.append(el('section', { class: 'arena-team-target' }, [el('b', { text: finale ? '选择压轴路线' : '选择切割赛道' }), el('p', { text: '计时已暂停；路线、材料和倍率沿用当前赛事提供的数据。' })]),
      el('div', { class: 'quick-choice-list arena-team-route-list' }, (finale ? Challenge.FINALES : Challenge.ROUTES).map(option => el('button', { class: 'quick-choice-card', onclick: () => teamUpdate(draft => finale ? Challenge.chooseFinale(draft.teamOperation, option.id) : Challenge.chooseRoute(draft.teamOperation, option.id)) }, [el('b', { text: option.name }), el('span', { text: option.tag }), el('small', { text: `×${option.bonus.toFixed(2)}` })]))));
    return;
  }
  const ui = teamTestStage('按住舞台，沿材料虚线从「起」点划过；正式切割可能断刀。');
  let pointer = null, stroke = null, frame = 0, last = 0, alive = true;
  const draw = () => {
    const current = read(); if (!current || !ui.canvas.isConnected) return;
    const r = ui.resize();
    if (ui.ctx) { drawArenaStage(ui.ctx, current, r.width, r.height, { trail: [], hitLabels: [], bursts: [], now: performance.now(), pointer, reducedMotion: motion.reduced() }); Formal.drawFormalCutGuides(ui.ctx, current, r.width, r.height); }
    const hudCopy = `${current.remaining.toFixed(1)}秒 · ${Math.floor(current.score)}分 · 刀况 ${Math.round(current.health)}%${current.paused ? ' · 已暂停' : ''}`;
    if (ui.hud.textContent !== hudCopy) ui.hud.textContent = hudCopy;
    if (current.risk?.status === 'warning' || current.risk?.status === 'failed') ui.feedback.textContent = current.risk.message;
  };
  const commit = fn => teamUpdate(draft => { Suite.startSuite(draft); const value = fn(draft.teamOperation, draft); return value?.ok === false ? value : { ok: true }; }, false);
  const finishStroke = (interrupted = false) => {
    if (stroke) { const recorded = stroke; commit((_, draft) => Formal.noteCutStroke(draft, recorded, interrupted)); }
    stroke = null; pointer = null;
  };
  const transition = () => {
    if (read()?.done || read()?.phase.endsWith('-choice')) { finishStroke(true); render(); return true; }
    return false;
  };
  ui.canvas.addEventListener('pointerdown', event => {
    if (pointer || read().paused || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); audio.unlock();
    if (!commit(current => Challenge.beginSwipe(current))) return;
    pointer = { ...ui.point(event), id: event.pointerId, time: performance.now() };
    stroke = { points: [{ ...pointer }], hits: [], distance: 0 };
    try { ui.canvas.setPointerCapture(event.pointerId); } catch {}
  });
  ui.canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer?.id || read().paused) return;
    event.preventDefault(); const next = ui.point(event), now = performance.now(), previous = { ...pointer };
    let hits = [];
    if (!commit(current => { hits = Challenge.swipe(current, previous, next, { duration: Math.max(.018, (now - previous.time) / 1000) }).hits; })) { finishStroke(true); return; }
    stroke.points.push(next); stroke.hits.push(...hits); stroke.distance += Math.hypot(next.x - previous.x, next.y - previous.y);
    pointer = { ...next, id: event.pointerId, time: now };
    if (!transition()) draw();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) ui.canvas.addEventListener(type, event => {
    if (event.pointerId !== pointer?.id) return;
    finishStroke(type !== 'pointerup'); draw();
  });
  const pause = () => { finishStroke(true); commit(current => Challenge.setPaused(current, true)); draw(); };
  const hidden = () => { if (document.hidden) pause(); };
  document.addEventListener('visibilitychange', hidden); window.addEventListener('blur', pause);
  body.append(teamFooter('暂停不重开；刷新恢复已保存的时间、刀况、赛道与成绩。', run.paused ? '继续切割测试' : '暂停切割测试', () => { finishStroke(true); if (commit(current => Challenge.setPaused(current, !current.paused))) render(); }));
  const skip = el('button', { class: 'btn', text: '收手，按原规则放弃本项', onclick: () => {
    const content = el('div', {}, [el('p', { text: '确认收手？沿用原放弃规则及已有受损，不恢复刀况；本轮仍需确认。' }), el('button', { class: 'btn btn--primary', text: '确认收手', onclick: () => {
      const result = Game.updateTeamRound(draft => {
        const performance = Challenge.finish(draft.teamOperation, 'abandon');
        const skipped = Core.arena.skipFieldTest(draft, performance); Suite.annotateAbandonedSuite(draft); return skipped;
      });
      if (result.ok) { handle.close(); render(); } else teamWrite(result, false);
    } })]);
    const handle = sheet({ title: '确认收手', body: content });
  } });
  ui.stage.append(skip);
  const tick = now => {
    if (!alive || !ui.canvas.isConnected) return;
    const dt = last ? Math.min(.05, (now - last) / 1000) : 0; last = now;
    if (!read().paused && dt && !commit(current => Challenge.tick(current, dt))) { alive = false; return; }
    if (transition()) return;
    draw(); frame = requestAnimationFrame(tick);
  };
  teamStageCleanup = shouldPause => { alive = false; cancelAnimationFrame(frame); if (shouldPause) pause(); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('blur', pause); };
  draw(); frame = requestAnimationFrame(tick);
}
function renderTeamOperationStage() {
  const read = () => currentArenaMatch()?.teamOperation;
  const precision = read().kind === 'precision';
  const instructions = precision ? '从「刀尖」圆环按下，拖到工件中心刻度，松手提交。' : '按住「加载区」，压力进入刻线承压窗口后松手。';
  const ui = teamTestStage(instructions);
  let pointerId = null, frame = 0, last = 0, alive = true;
  const change = fn => teamUpdate(draft => {
    Suite.startSuite(draft);
    draft.teamOperation = fn(draft.teamOperation);
    draft.formalPerformance.operation = draft.teamOperation;
    if (draft.teamOperation.done) return { ok: Suite.recordSuiteOperation(draft.formalPerformance, draft.teamOperation.result) };
    return { ok: true };
  }, false);
  const draw = () => {
    const state = read(); if (!state || !ui.canvas.isConnected) return;
    const r = ui.resize(), ctx = ui.ctx, w = r.width, h = r.height;
    if (!ctx) return;
    ctx.fillStyle = '#102735'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#e9d2a2'; ctx.font = '12px system-ui'; ctx.textAlign = 'center';
    if (precision) {
      const start = state.config.initialPoint, target = state.config.target;
      ctx.fillStyle = '#34566b'; ctx.fillRect(w * .1, h * .3, w * .8, h * .28);
      for (let i = 1; i <= 9; i++) { ctx.strokeStyle = '#8fa7af'; ctx.beginPath(); ctx.moveTo(w * i / 10, h * .3); ctx.lineTo(w * i / 10, h * .38); ctx.stroke(); }
      ctx.strokeStyle = '#e9d2a2'; ctx.beginPath(); ctx.ellipse(target.x * w, target.y * h, state.config.tolerance * w, state.config.tolerance * h, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#e9d2a2'; ctx.fillText('工件中心刻度', target.x * w, h * .24);
      ctx.beginPath(); ctx.arc(start.x * w, start.y * h, 13, 0, Math.PI * 2); ctx.stroke(); ctx.fillText('刀尖 · 从此按下', start.x * w, start.y * h + 30);
      const p = state.current || start; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(p.x * w - 10, p.y * h); ctx.lineTo(p.x * w + 10, p.y * h); ctx.moveTo(p.x * w, p.y * h - 10); ctx.lineTo(p.x * w, p.y * h + 10); ctx.stroke();
    } else {
      const window = state.config.window, max = window.max * 1.5, x = w * .12, y = h * .16, length = w * .76;
      ctx.fillStyle = '#34566b'; ctx.fillRect(x, y, length, 22); ctx.fillStyle = '#826b40'; ctx.fillRect(x + length * window.min / max, y - 4, length * (window.max - window.min) / max, 30);
      ctx.fillStyle = '#b5d7da'; ctx.fillRect(x, y + 7, length * Math.min(1, state.load / max), 8);
      const center = state.config.target; ctx.fillStyle = '#527082'; ctx.fillRect(w * .15, h * .4, w * .7, h * .26); ctx.strokeStyle = '#e9d2a2'; ctx.beginPath(); ctx.ellipse(center.x * w, center.y * h, state.config.zone.radius * w, state.config.zone.radius * h, 0, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#e9d2a2'; ctx.fillText('加载区 · 按住', center.x * w, h * .82);
    }
    ui.hud.textContent = precision ? `精度偏差 ${((state.result?.distance || 0) * 100).toFixed(1)}%${state.paused ? ' · 已暂停' : ''}` : `加载 ${state.load.toFixed(2)} · 承压窗 ${state.config.window.min.toFixed(2)}–${state.config.window.max.toFixed(2)}${state.paused ? ' · 已暂停' : ''}`;
    ui.feedback.textContent = state.paused ? '测试已暂停；请先点「继续操作」，再从标记处重新按下。' : state.result?.status === 'not_started' ? '未锁定起始区域，请从标记处按下。' : state.interruption ? '操作已中断，未提交；请重新按下。' : instructions;
  };
  const clearPointer = () => { const old = pointerId; pointerId = null; try { if (old != null && ui.canvas.hasPointerCapture(old)) ui.canvas.releasePointerCapture(old); } catch {} };
  const interrupt = (pause = false) => {
    if (pointerId != null || pause) change(state => Performance.pauseOperation(Performance.interruptOperation(state, 'stage-interrupted'), pause));
    clearPointer(); draw();
  };
  ui.canvas.addEventListener('pointerdown', event => {
    if (pointerId != null || read().paused || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); if (!change(state => Performance.beginOperation(state, ui.point(event)))) return;
    if (read().active) { pointerId = event.pointerId; try { ui.canvas.setPointerCapture(pointerId); } catch {} } draw();
  });
  ui.canvas.addEventListener('pointermove', event => { if (pointerId !== event.pointerId) return; event.preventDefault(); const p = ui.point(event); if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) interrupt(); else { change(state => Performance.moveOperation(state, p)); draw(); } });
  ui.canvas.addEventListener('pointerup', event => {
    if (pointerId !== event.pointerId) return;
    const p = ui.point(event); if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) { interrupt(); return; }
    if (change(state => Performance.endOperation(state, p))) { clearPointer(); render(); }
  });
  for (const type of ['pointercancel', 'lostpointercapture']) ui.canvas.addEventListener(type, event => { if (pointerId === event.pointerId) interrupt(); });
  const pause = () => interrupt(true), hidden = () => { if (document.hidden) pause(); };
  window.addEventListener('blur', pause); document.addEventListener('visibilitychange', hidden);
  const actions = el('div', { class: 'arena-team-score' }, [el('button', { class: 'btn', text: read().paused ? '继续操作' : '暂停操作', onclick: () => { if (change(state => Performance.pauseOperation(state, !state.paused))) { clearPointer(); render(); } } }), el('button', { class: 'btn', text: '重置本项操作', onclick: () => { if (change(state => Performance.resetOperation(state))) { clearPointer(); render(); } } })]);
  body.append(actions, el('p', { class: 'arena-note', text: '精度容差与承压窗复用本轮原现场测试参数；仅诊断，不新增刀损。松手后保存成绩。' }));
  const tick = now => {
    if (!alive || !ui.canvas.isConnected) return;
    const dt = last ? Math.min(.05, (now - last) / 1000) : 0; last = now;
    if (read().active && !read().paused && dt && !change(state => Performance.tickOperation(state, dt))) { alive = false; return; }
    draw(); frame = requestAnimationFrame(tick);
  };
  teamStageCleanup = shouldPause => { alive = false; cancelAnimationFrame(frame); if (shouldPause || pointerId != null) interrupt(shouldPause); window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', hidden); };
  draw(); frame = requestAnimationFrame(tick);
}

/* ══ 全国赛：独立会话，冻结视图只读；单场入口和结算保持原样 ══ */
const NATIONAL_LABELS = ['32强', '16强', '8强', '4强', '决赛'];
function freezeNationalSnapshot(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freezeNationalSnapshot(child);
    Object.freeze(value);
  }
  return value;
}
// Foreground target only: neither a clamp nor a crash-loss guarantee. Read on every attempt.
function nationalIntervalMs() {
  const value = Core.progress.NATIONAL_CHECKPOINT_POLICY?.intervalMs;
  return Number.isFinite(value) && value > 0 ? value : 250;
}
function nationalCheckpointAvailable() {
  return ['checkpointNationalRound', 'restoreNationalRound', 'flushNationalRound']
    .every(name => typeof Core.progress[name] === 'function');
}
function nationalCall(action) {
  try { return action(); }
  catch (error) { return { ok: false, code: 'NATIONAL_SAVE_EXCEPTION', reason: error?.message || '保存异常' }; }
}
function nationalSaveError(result) {
  nationalSave.state = 'error';
  nationalSave.error = result?.code || 'NATIONAL_SAVE_FAILED';
  nationalSave.reason = result?.reason || '当前进度尚未保存';
  nationalPaintSave();
}
function nationalReady() {
  if (nationalCheckpointAvailable()) return true;
  nationalSaveError({ code: 'CHECKPOINT_API_UNAVAILABLE', reason: '当前程序尚未提供全国赛检查点接口，暂不能安全开始或恢复操作。' });
  return false;
}
// Presentation only: a checkpoint receipt is not a receipt for the whole live operation.
function nationalSavePresentation() {
  const local = nationalLocal;
  const memory = nationalSave.durability === 'memory' || !env.hasLocalStorage;
  const failed = nationalSave.state === 'error';
  const operation = local?.operation || nationalSnapshot?.activeMatch?.nationalOperation;
  const paused = nationalSave.recovered && operation?.paused;
  const checkpointOnly = local && local.savedSeq > (nationalSnapshot?.activeMatch?.nationalCheckpoint?.appliedSeq ?? 0);
  let title, message;
  if (nationalPendingCommit) {
    title = '这次操作还没提交成功';
    message = '请点“重试提交”。恢复点不代表成绩已提交；成功前不会推进比赛或发放奖励。现在刷新或关闭，可能丢失尚未保存的进度。';
  } else if (failed) {
    title = '还有进度没保存好';
    message = '请点“重试保存”。现在刷新或关闭，可能丢失这段进度。';
  } else if (memory) {
    title = '仅保存在当前页面';
    message = '这次只保存在当前页面的内存中，刷新或关闭可能丢失。';
  } else if (local?.dirty || checkpointOnly) {
    title = nationalSave.savedAt ? '最近恢复点已保存' : '最新操作还没保存';
    message = '最新进度可能还没保存。现在刷新或关闭，可能回到稍早的进度。';
  } else if (nationalSave.state === 'saved' || nationalSnapshot) {
    title = '赛事已保存';
    message = '若接下来的操作还没来得及保存就刷新或关闭，可能会回到稍早的进度。';
  } else {
    title = '准备好再开始';
    message = '开始赛事后会保存进度；尚未保存的操作可能在刷新或关闭后丢失。';
  }
  const notices = [];
  if (memory && (failed || nationalPendingCommit)) notices.push('目前仅保存在当前页面的内存中，刷新或关闭可能丢失。');
  if (paused) {
    notices.push(nationalSave.checkpointStatus === 'discarded'
      ? '最近恢复点无法使用，已回到此前保存的赛事，部分进度可能已回退。'
      : nationalSave.checkpointStatus === 'restored' ? '已恢复最近保存的进度。' : '已读取此前保存的赛事；没有可用的操作恢复点，部分进度可能已回退。');
    notices.push(`比赛已暂停，请点“${operation.mode === 'formal' ? '继续切割测试' : '继续操作'}”再玩；离开期间不计时。`);
    if (!failed && !nationalPendingCommit && !memory && !local?.dirty) title = '进度已恢复 · 等你继续';
  }
  if (nationalSave.cleanupPending && !failed && !nationalPendingCommit && !local?.dirty) notices.push('本次保存已完成，无需重复提交或结算。');
  const time = nationalSave.savedAt ? new Date(nationalSave.savedAt).toLocaleTimeString() : '';
  const details = [nationalSave.error ? `错误码：${nationalSave.error}。${nationalSave.reason || ''}` : '',
    time ? `最近保存时间：${time}。` : '尚无已确认的操作恢复点写入时间。',
    local ? `恢复点序号：${local.savedSeq}；当前操作${local.dirty ? '有未保存变化' : '无待写入变化'}。` : '',
    nationalSave.cleanupPending ? '主存档写入成功，旧检查点待清理。' : '',
    `前台检查点目标间隔：${nationalIntervalMs()}ms，不是进度回退的上限。卡顿、后台限速、写入失败或浏览器强制关闭时，可能回到更早的保存进度；离页或关闭时的保存不保证触发。`].filter(Boolean).join(' ');
  return { title, message: [message, ...notices].join(' '), details,
    state: nationalPendingCommit || failed ? 'error' : memory || local?.dirty ? 'warning' : nationalSave.state };
}
function nationalPaintSave() {
  for (const node of body?.querySelectorAll('.national-save-status') || []) {
    const copy = nationalSavePresentation();
    node.dataset.state = copy.state;
    node.querySelector('b').textContent = copy.title;
    node.querySelector('small').textContent = copy.message;
    node.querySelector('.national-save-details p').textContent = copy.details;
    const retry = node.querySelector('button');
    retry.hidden = nationalSave.state !== 'error' && !nationalPendingCommit;
    retry.textContent = nationalPendingCommit ? '重试提交' : '重试保存';
    retry.disabled = !nationalCheckpointAvailable();
  }
}
function nationalSaveStatus() {
  const node = el('section', { class: 'national-save-status', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' }, [el('b'), el('small'), el('button', { class: 'btn', text: '重试保存', hidden: true, onclick: () => {
    if (nationalPendingCommit) {
      const pending = nationalPendingCommit;
      if (nationalSnapshot?.id !== pending.runId) { nationalSaveError({ code: 'STALE_NATIONAL_MATCH', reason: '待提交操作不属于当前赛事，不能提交。' }); return; }
      if (nationalCommitResult(pending.matchId, pending.mutator).ok) render();
    } else if (nationalFlush('retry')) render();
  } }), el('details', { class: 'national-save-details' }, [el('summary', { text: '保存说明与诊断' }), el('p')])]);
  // Paint once after mounting; subsequent updates do not rebuild the operation stage.
  return node;
}
function nationalWrite(result, mergedLocal = false) {
  if (result?.ok) {
    if (Object.hasOwn(result, 'run')) {
      const next = result.run, match = next?.activeMatch;
      const same = nationalLocal && next?.id === nationalLocal.runId && match?.id === nationalLocal.matchId && next.bladeId === nationalLocal.bladeId && match.nationalCheckpoint?.epoch === nationalLocal.epoch;
      if (nationalLocal && !same) {
        if (nationalLocal.dirty && !mergedLocal) { nationalSaveError({ code: 'UNSAVED_IDENTITY_CHANGE', reason: '仍有未保存操作，已阻止切换赛事身份；请先重试保存。' }); return false; }
        nationalLocal = null;
      }
      nationalSnapshot = freezeNationalSnapshot(next);
    }
    nationalSave.cleanupPending = result.cleanupPending === true;
    return true;
  }
  nationalSaveError(result);
  toast(result?.reason || '全国赛保存失败，当前进度未推进，请重试', 'warn');
  return false;
}
function nationalLocalOperation() {
  const run = nationalSnapshot, match = run?.activeMatch;
  if (!match?.nationalOperation || match.done || match.formalPerformance?.entries?.[match.formalPerformance.index]?.status !== 'pending') { nationalLocal = null; return null; }
  // Metadata is issued by the core; never invent an epoch from time or round index.
  const meta = match.nationalCheckpoint;
  const epoch = meta?.epoch;
  if (epoch == null || !Number.isSafeInteger(meta?.appliedSeq) || meta.appliedSeq < 0) {
    nationalSaveError({ code: 'CHECKPOINT_METADATA_UNAVAILABLE', reason: '本轮缺少核心提供的 epoch / appliedSeq，已停止操作以免覆盖存档。' });
    return null;
  }
  if (nationalLocal?.runId === run.id && nationalLocal.matchId === match.id && nationalLocal.bladeId === run.bladeId && nationalLocal.epoch === epoch) return nationalLocal.operation;
  nationalLocal = { runId: run.id, matchId: match.id, bladeId: run.bladeId, epoch,
    seq: meta.appliedSeq, savedSeq: meta.appliedSeq,
    operation: JSON.parse(JSON.stringify(match.nationalOperation)), dirty: false, lastAttempt: performance.now() };
  return nationalLocal.operation;
}
function nationalCheckpoint() {
  if (!nationalLocal) return null;
  const local = nationalLocal, run = nationalSnapshot, match = run?.activeMatch, meta = match?.nationalCheckpoint;
  if (run?.id !== local.runId || match?.id !== local.matchId || run.bladeId !== local.bladeId || meta?.epoch !== local.epoch || local.seq < meta.appliedSeq || !Number.isSafeInteger(local.seq) || local.seq >= Number.MAX_SAFE_INTEGER) {
    nationalSaveError({ code: 'STALE_CHECKPOINT', reason: '本地操作身份或序号已过期，已阻止写入另一轮；请恢复最近存档。' }); return false;
  }
  return { version: 1, mode: 'national', runId: local.runId, matchId: local.matchId,
    bladeId: local.bladeId, epoch: local.epoch, seq: ++local.seq, savedAt: Date.now(),
    operation: JSON.parse(JSON.stringify(local.operation)) };
}
function nationalMarkDirty() {
  if (!nationalLocal || nationalLocal.dirty) return;
  nationalLocal.dirty = true;
  nationalPaintSave();
}
function nationalCheckpointTick(now) {
  if (!nationalLocal?.dirty || now - nationalLocal.lastAttempt < nationalIntervalMs()) return;
  nationalLocal.lastAttempt = now;
  const started = performance.now();
  const checkpoint = nationalCheckpoint();
  if (!checkpoint) return;
  const result = nationalCall(() => Core.progress.checkpointNationalRound(checkpoint.runId, checkpoint.matchId, checkpoint));
  try { performance.measure?.('national-checkpoint', { start: started, end: performance.now() }); } catch {}
  if (!result?.ok) { nationalSaveError(result); return; }
  if (!Number.isSafeInteger(result.savedSeq) || result.savedSeq !== checkpoint.seq) { nationalSaveError({ code: 'CHECKPOINT_SEQUENCE_CONFLICT', reason: '检查点响应序号不符，当前操作仍未确认保存。' }); return; }
  nationalLocal.savedSeq = result.savedSeq;
  nationalLocal.dirty = false;
  Object.assign(nationalSave, { state: 'saved', error: null, reason: null, savedAt: result.savedAt, durability: result.durability });
  nationalPaintSave();
}
function nationalAdoptMain(result) {
  if (result?.ok && !result.run) { nationalSaveError({ code: 'INVALID_MAIN_SAVE_RESPONSE', reason: '主存档未返回完整赛事，保留本地操作等待重试。' }); return false; }
  if (!nationalWrite(result, true)) return false;
  nationalLocal = null;
  Object.assign(nationalSave, { state: 'saved', error: null, reason: null, savedSeq: 0,
    savedAt: result.savedAt || Date.now(), durability: result.durability || null });
  nationalLocalOperation(); nationalPaintSave();
  return true;
}
function nationalFlush(reason) {
  if (!nationalReady()) return false;
  const run = nationalSnapshot, match = run?.activeMatch;
  if (!match || match.done) return true;
  const checkpoint = nationalCheckpoint();
  if (checkpoint === false) return false;
  const flushReason = ['background', 'hidden'].includes(reason) ? 'hidden' : ['leave', 'pagehide'].includes(reason) ? 'leave' : reason === 'operation-complete' ? 'operation-complete' : 'pause';
  const result = nationalCall(() => Core.progress.flushNationalRound(run.id, match.id, checkpoint ? { checkpoint, reason: flushReason } : { reason: flushReason }));
  return nationalAdoptMain(result);
}
function nationalRestore(runId = null) {
  // Do not overwrite unsaved local input when revisiting an entry or after a failed leave flush.
  if (nationalLocal?.dirty && !nationalFlush('before-restore')) return { ok: false, reason: '仍有未保存操作，请先重试保存' };
  const resumed = nationalCall(() => Game.resumeNationalRun(runId));
  if (!resumed?.ok || !resumed.run?.activeMatch || resumed.run.activeMatch.done) {
    nationalWrite(resumed); nationalLocal = null; nationalSave.recovered = false; return resumed;
  }
  if (!nationalReady()) return { ok: false, reason: nationalSave.reason };
  const result = nationalCall(() => Core.progress.restoreNationalRound(resumed.run.id, resumed.run.activeMatch.id));
  if (!nationalWrite(result)) return result;
  nationalLocal = null;
  Object.assign(nationalSave, { state: 'saved', error: null, reason: null,
    recovered: true, savedSeq: result.savedSeq || 0, savedAt: result.savedAt, durability: result.durability,
    checkpointStatus: result.checkpointStatus });
  const operation = nationalLocalOperation();
  if (operation && !operation.done) {
    if (operation.mode === 'formal') { Challenge.setPaused(operation, true); operation.hitIds = []; operation.gestureKills = 0; }
    else {
      nationalLocal.operation = Performance.pauseOperation(Performance.interruptOperation(operation, 'restored'), true);
      nationalLocal.operation.pointer = null;
    }
    // The restored value is already paused/interrupted by the core. No archive mutation here.
  }
  if (result.checkpointStatus === 'discarded') {
    nationalSave.reason = '无效或过期检查点已丢弃；已回到主存档，可能有进度回退。';
  }
  return result;
}
function nationalCommitResult(matchId, mutator) {
  if (!nationalReady()) return { ok: false, reason: nationalSave.reason };
  const run = nationalSnapshot;
  if (!run || run.activeMatch?.id !== matchId) return { ok: false, code: 'STALE_NATIONAL_MATCH', reason: '本轮身份已变化，请恢复全国赛' };
  const checkpoint = nationalCheckpoint();
  if (checkpoint === false) return { ok: false, code: nationalSave.error, reason: nationalSave.reason };
  const result = nationalCall(() => Game.updateNationalRound(run.id, matchId, mutator, checkpoint ? { checkpoint } : {}));
  if (result?.ok) {
    if (!nationalAdoptMain(result)) return { ok: false, code: nationalSave.error, reason: nationalSave.reason };
    nationalPendingCommit = null; nationalPaintSave();
  }
  else {
    nationalPendingCommit = { runId: run.id, matchId, mutator };
    // Keep the previous successful slot and the unsaved local state. Never advance the UI.
    if (nationalLocal?.operation && !nationalLocal.operation.done) {
      if (nationalLocal.operation.mode === 'formal') Challenge.setPaused(nationalLocal.operation, true);
      else nationalLocal.operation = Performance.pauseOperation(nationalLocal.operation, true);
      nationalLocal.dirty = true;
    }
    nationalSaveError(result);
  }
  return result;
}
function nationalCommit(matchId, mutator, redraw = true) {
  const result = nationalCommitResult(matchId, mutator);
  if (!result?.ok) { nationalWrite(result); return false; }
  if (redraw) render();
  return true;
}
function nationalExit() { stopTeamStage(true); arenaMode = 'national-entry'; tier = 'national'; render(); }
function nationalStrip(run) {
  return el('ol', { class: 'national-progress', 'aria-label': '全国赛五轮晋级进度' }, NATIONAL_LABELS.map((label, i) => {
    const round = run?.rounds[i];
    const current = run && !['champion', 'eliminated'].includes(run.status) && i === run.roundIndex;
    return el('li', { class: round ? (round.win ? 'is-done' : 'is-lost') : current ? 'is-current' : '', 'aria-current': current ? 'step' : null }, [el('b', { text: label }), el('small', { text: `第${i + 1}轮${round ? (round.win ? ' · 胜' : ' · 负') : ''}` })]);
  }));
}
function nationalHeader(run) {
  const completed = run.rounds.filter(round => round.win).length;
  const index = ['champion', 'eliminated'].includes(run.status) ? (run.rounds.at(-1)?.index ?? 0) : Math.min(run.roundIndex, 4);
  return el('header', { class: 'national-header', 'data-national-run': run.id }, [
    el('div', { class: 'national-title' }, [el('b', { text: `全国赛 · 第${index + 1}/5轮 · ${NATIONAL_LABELS[index]}` }), el('button', { class: 'btn', text: '返回赛事入口', onclick: nationalExit })]),
    nationalSaveStatus(),
    el('p', { text: `参赛刀：${run.blade.bladeName || run.blade.name || run.bladeId} · 已胜 ${completed}/5 · ${ { ready: '待开始下一轮', round: run.activeMatch?.done ? '待确认本轮结算' : '本轮进行中', eliminated: '本届已淘汰', champion: '五轮完成 · 冠军' }[run.status] }` }), nationalStrip(run),
  ]);
}
function renderNationalEntry() {
  body.className = 'arena-body arena-view-team arena-view-national';
  const previous = Game.nationalRunView();
  // Returning to the entry queries the live run, never mistakes a viewed archive for a free slot.
  const resumed = Game.resumeNationalRun();
  if (!resumed?.ok) { nationalWrite(resumed); return; }
  // Never replace a checkpoint-restored snapshot with the less recent main-archive view.
  if ((!nationalSnapshot || nationalSnapshot.id !== resumed.run?.id) && !nationalLocal?.dirty) nationalWrite(resumed);
  const blades = Core.progress.collection().filter(b => b.canEnterArena !== false && !b.fractured);
  const run = nationalSnapshot || resumed.run || previous;
  const active = run && ['ready', 'round'].includes(run.status);
  mount(body, [modeSwitch(), el('div', { class: 'hub-tier-tabs' }, Object.values(TIERS).map(x => el('button', { class: 'hub-tier' + (tier === x.id ? ' is-active' : ''), text: x.name, onclick: () => { tier = x.id; arenaMode = x.id === 'national' ? 'national-entry' : 'tournament'; render(); } }))),
    teamHeading('NATIONAL · 暂定赛制', '全国晋级之路', '同一把成刀连续五轮，达到公开目标分即可晋级；得分不足或刀况耗尽结束本届。'), nationalStrip(active ? run : null),
  ]);
  body.append(nationalSaveStatus());
  if (!nationalCheckpointAvailable()) nationalReady();
  nationalPaintSave();
  if (active) {
    body.append(el('section', { class: 'national-summary' }, [el('b', { text: `已有赛事（旧赛制） · ${run.blade.bladeName || run.blade.name || run.bladeId}` }), el('p', { text: `第${run.roundIndex + 1}/5轮 · ${NATIONAL_LABELS[run.roundIndex]} · ${run.activeMatch ? '恢复同一场比赛' : '等待手动开轮'}。返回入口不会退赛，不能另开第二届。` }), el('p', { class: 'muted tiny', text: '这是旧赛制（三局切割）的进行中纪录。可选择恢复，或退出它改用新的五轮切割赛制。' })]),
      el('div', { class: 'quick-report-actions' }, [
        el('button', { class: 'btn btn--primary', text: '恢复旧赛制全国赛', onclick: () => { if (nationalWrite(nationalRestore(run.id))) { arenaMode = 'national'; render(); } } }),
        /* ★ rework T09：旧档退出路径。不伪造成绩、不扣已得奖励、不断刀。 */
        el('button', {
          class: 'btn', text: '退出旧赛制，改用新赛制',
          onclick: () => {
            const r = Core.progress.abandonNationalRun();
            if (!r?.ok) { toast(r?.reason || '退出失败', 'warn'); return; }
            nationalSnapshot = null; nationalLocal = null;
            toast('旧赛已归档，可以开始新赛制的全国大赛', 'good');
            render();
          },
        }),
      ]));
    return;
  }
  if (blades.length) {
    if (!blades.some(b => b.id === selectedBladeId)) selectedBladeId = blades[0].id;
    body.append(bladePicker(blades, blades.find(b => b.id === selectedBladeId)));
  } else body.append(el('p', { text: '没有可参赛成刀，请先锻造；断刀不会恢复参赛资格。' }));
  body.append(el('section', { class: 'national-summary' }, [el('p', { text: `本届基础奖励：夺冠 +${Core.economy.matchReward(1,true)} CR，未夺冠 +${Core.economy.matchReward(1,false)} CR；每日任务奖励另计。冠军与各轮表现写入赛事履历。` })]),
    teamFooter('五轮各为 45 秒切割，每轮独立选三次强化，代表刀整届锁定。一败即淘汰；普通淘汰不断刀。', run ? '开始新一届全国赛' : '开始全国赛', () => {
      /* ★ rework T09：切换到新链路（core/arenaFormal 五轮多项目），
         不再走 startSliceMatch({kind:'national'}) 的旧三局切割结构。 */
      const r = Game.startNationalMatch({ bladeId: selectedBladeId });
      if (!r?.ok) { toast(r?.reason || '无法开始全国赛', 'warn'); return; }
      render();
    }, !blades.length));
}
function renderNational() {
  const run = nationalSnapshot || Game.nationalRunView();
  if (!run) { arenaMode = 'tournament'; tier = 'national'; return renderNationalEntry(); }
  body.className = 'arena-body arena-view-team arena-view-national';
  if (run.activeMatch && !run.activeMatch.done) {
    renderMatch();
    body.classList.add('arena-view-national');
    if (!body.querySelector('.national-header')) body.prepend(nationalHeader(nationalSnapshot));
    return;
  }
  body.append(nationalHeader(run));
  if (run.activeMatch?.done) {
    const m = run.activeMatch, r = m.result;
    body.append(teamHeading('本轮战报 · 待结算', r.bladeDestroyed ? '结构失效 · 本届淘汰' : r.win ? '本轮获胜' : '本轮落败 · 本届淘汰', `${m.blade.name} 对阵 ${m.opponent.name}`), el('div', { class: 'national-summary', text: `综合分 ${r.composite} : ${r.oppComposite} · 确认后由赛事核心结算单场 CR` }), Formal.renderSuiteDiagnostics(m),
      teamFooter('仅确认本轮一次，不调用单刀结算，不发额外冠军奖。', '确认本轮结算', () => { if (nationalFlush('terminal-settlement') && nationalWrite(Game.finishNationalRound(m.id))) render(); }));
    return;
  }
  const terminal = ['champion', 'eliminated'].includes(run.status);
  if (run.rounds.length) {
    const last = run.rounds.at(-1);
    body.append(teamHeading('本轮已结算', run.status === 'champion' ? '全国赛冠军' : run.status === 'eliminated' ? (last.match.result.bladeDestroyed ? '断刀淘汰 · 本届结束' : '失利淘汰 · 本届结束') : '获胜晋级', `本轮 +${last.reward} CR · 本届累计 ${run.rounds.reduce((total, round) => total + round.reward, 0)} CR`),
      el('div', { class: 'national-summary', text: run.status === 'champion' ? '五连胜已归档；冠军额外奖励 0 CR，仅记冠军与刀具履历。' : last.match.result.bladeDestroyed ? '仅参赛刀移入断刀册，完整履历保留；其他收藏不受影响。' : terminal ? '普通失利不等于断刀，成刀保留；可以开始新一届。' : `下一轮：第${run.roundIndex + 1}轮 · ${NATIONAL_LABELS[run.roundIndex]}；参赛刀保持不变。` }));
  }
  body.append(teamFooter(terminal ? '本届已经归档；新一届需重新选刀并显式创建。' : '胜后才推进；开始本轮后会保存同刀、对手和操作进度。', terminal ? '返回入口，开始新一届' : `开始第${run.roundIndex + 1}轮 · ${NATIONAL_LABELS[run.roundIndex]}`, terminal ? nationalExit : () => { if (nationalReady() && nationalWrite(Game.beginNationalRound(run.roundIndex))) render(); }));
}
function renderNationalTest() {
  if (!nationalReady()) { body.append(nationalSaveStatus()); nationalPaintSave(); return; }
  const matchId = currentArenaMatch().id;
  const nationalUpdate = (fn, redraw = true) => nationalCommit(matchId, fn, redraw);
  body.className = 'arena-body arena-view-team arena-view-national';
  let m = currentArenaMatch();
  if (!m.formalPerformance) {
    if (!nationalUpdate(draft => Suite.createSuite(draft), false)) return;
    m = currentArenaMatch();
  }
  const suite = m.formalPerformance;
  const entry = Suite.currentSuiteTest(suite);
  mount(body, [teamHeading(`全国赛 · 第 ${nationalSnapshot.roundIndex + 1}/5 轮`, `${entry.name} · 正式实测`, '沿用原三项测试；不新增切割分、权重或断刀规则。'),
    el('div', { class: 'arena-team-rounds' }, suite.entries.map(x => el('span', { text: `${x.name}${x.status === 'complete' ? ' ✓' : x.status === 'not-run' ? ' 未进行' : ''}` }))),
  ]);
  if (!suite.started) {
    body.append(el('section', { class: 'arena-team-target' }, [el('p', { text: '切割：沿虚线划过靶具。精度：从刀尖拖到工件刻度。强度：按住加载区，在承压窗内松手。正式切割可能断刀；精度和强度只记原操作诊断。' })]),
      teamFooter('中断后会暂停；点继续再玩，尚未保存的操作可能回退。', '开始切割测试', () => nationalUpdate(draft => ({ ok: Suite.startSuite(draft) }))));
    return;
  }
  if (entry.status === 'complete') {
    body.append(Formal.renderSuiteDiagnostics(m));
    if (entry.kind !== 'cutting') body.append(el('button', { class: 'btn', text: '重试本项', onclick: () => nationalUpdate(draft => {
      Suite.startSuite(draft);
      draft.nationalOperation = Performance.resetOperation(draft.nationalOperation);
      draft.formalPerformance.operation = draft.nationalOperation;
      const current = Suite.currentSuiteTest(draft.formalPerformance);
      current.status = 'pending'; current.result = null;
      return { ok: true };
    }) }));
    const last = suite.index === suite.entries.length - 1;
    body.append(teamFooter('提交后查看本轮战报，再确认单场 CR 结算。', last ? '提交三项成绩，查看本轮战报' : `下一项：${suite.entries[suite.index + 1].name}`, () => nationalUpdate(draft => {
      Suite.startSuite(draft);
      if (last) return Suite.submitSuite(draft);
      draft.nationalOperation = null;
      return { ok: Suite.advanceSuite(draft.formalPerformance) };
    })));
    return;
  }
  if (!m.nationalOperation) {
    const initialized = nationalUpdate(draft => {
      if (entry.kind === 'cutting') {
        const seed = (draft.seed ^ 0x6f2a91d3 ^ [...String(draft.fieldTest.type)].reduce((a, c) => Math.imul(a ^ c.charCodeAt(0), 16777619), 2166136261)) >>> 0;
        const created = Challenge.createChallenge(draft.blade, { seed, mode: 'formal' });
        if (!created.ok) return created;
        draft.nationalOperation = created.run;
      } else {
        const task = Core.arena.fieldTestTask(draft);
        draft.nationalOperation = Performance.createPerformance(entry.kind, draft.blade.stats, { PROTOTYPE_INPUT: {
          precision: { target: { x: task.center, y: Performance.PROTOTYPE_INPUT.precision.target.y }, tolerance: task.width * .5 },
          strength: { loadWindow: { min: task.center - task.width * .5, max: task.center + task.width * .5 } },
        } });
      }
      return { ok: true };
    }, false);
    if (!initialized) return;
    m = currentArenaMatch();
  }
  if (entry.kind === 'cutting') return renderNationalCutStage();
  renderNationalOperationStage();
}
function nationalTestStage(instructions) {
  const stage = el('section', { class: 'arena-team-stage arena-team-test' });
  const hud = el('div', { class: 'arena-team-hud', role: 'status', 'aria-live': 'off' });
  const canvas = el('canvas', { 'aria-label': instructions });
  const feedback = el('p', { class: 'arena-team-feedback', role: 'status', text: instructions });
  stage.append(hud, canvas, feedback); body.append(stage);
  const ctx = canvas.getContext('2d');
  const resize = () => { const r = canvas.getBoundingClientRect(); const dpr = Math.min(2, devicePixelRatio || 1); const width = Math.round(r.width * dpr), height = Math.round(r.height * dpr); if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; } ctx?.setTransform(dpr, 0, 0, dpr, 0, 0); return r; };
  const point = event => { const r = canvas.getBoundingClientRect(); return { x: (event.clientX - r.left) / r.width, y: (event.clientY - r.top) / r.height }; };
  return { stage, hud, canvas, feedback, ctx, resize, point };
}
function renderNationalCutStage() {
  const matchId = currentArenaMatch().id;
  const nationalUpdate = (fn, redraw = true) => nationalCommit(matchId, fn, redraw);
  const read = () => nationalLocalOperation();
  const run = read();
  if (!run) { body.append(nationalSaveStatus()); nationalPaintSave(); return; }
  if (run.done) {
    nationalUpdate(draft => {
      Suite.startSuite(draft);
      const captured = Suite.captureCut(draft.formalPerformance, draft.nationalOperation.result);
      if (!captured) return { ok: false, reason: '切割成绩尚未保存，请重试' };
      if (Challenge.hasStructuralFailure(draft.nationalOperation.result)) return Suite.submitSuite(draft);
      return { ok: true };
    });
    return;
  }
  if (run.phase.endsWith('-choice')) {
    const finale = run.phase === 'finale-choice';
    body.append(el('section', { class: 'arena-team-target' }, [el('b', { text: finale ? '选择压轴路线' : '选择切割赛道' }), el('p', { text: '计时已暂停；路线、材料和倍率沿用当前赛事提供的数据。' })]),
      el('div', { class: 'quick-choice-list arena-team-route-list' }, (finale ? Challenge.FINALES : Challenge.ROUTES).map(option => el('button', { class: 'quick-choice-card', onclick: () => nationalUpdate(draft => finale ? Challenge.chooseFinale(draft.nationalOperation, option.id) : Challenge.chooseRoute(draft.nationalOperation, option.id)) }, [el('b', { text: option.name }), el('span', { text: option.tag }), el('small', { text: `×${option.bonus.toFixed(2)}` })]))));
    return;
  }
  const ui = nationalTestStage('按住舞台，沿材料虚线从「起」点划过；正式切割可能断刀。');
  let pointer = null, stroke = null, frame = 0, last = 0, alive = true;
  const draw = () => {
    const current = read(); if (!current || !ui.canvas.isConnected) return;
    const r = ui.resize();
    if (ui.ctx) { drawArenaStage(ui.ctx, current, r.width, r.height, { trail: [], hitLabels: [], bursts: [], now: performance.now(), pointer, reducedMotion: motion.reduced() }); Formal.drawFormalCutGuides(ui.ctx, current, r.width, r.height); }
    const hudCopy = `${current.remaining.toFixed(1)}秒 · ${Math.floor(current.score)}分 · 刀况 ${Math.round(current.health)}%${current.paused ? ' · 已暂停' : ''}`;
    if (ui.hud.textContent !== hudCopy) ui.hud.textContent = hudCopy;
    if (current.risk?.status === 'warning' || current.risk?.status === 'failed') ui.feedback.textContent = current.risk.message;
  };
  const commit = fn => {
    const current = read(); if (!current) return false;
    const value = fn(current);
    if (value?.ok === false || value === false) return false;
    nationalMarkDirty(); return true;
  };
  const finishStroke = (interrupted = false) => {
    const recorded = stroke, oldPointer = pointer;
    stroke = null; pointer = null;
    try { if (oldPointer && ui.canvas.hasPointerCapture(oldPointer.id)) ui.canvas.releasePointerCapture(oldPointer.id); } catch {}
    // A confirmed stroke adds diagnostics in the main archive, not in checkpoint-protected fields.
    if (recorded) return nationalUpdate(draft => { Formal.noteCutStroke(draft, recorded, interrupted); return { ok: true }; }, false);
    return true;
  };
  const transition = () => {
    if (read()?.done || read()?.phase.endsWith('-choice')) {
      if (!finishStroke(true)) return true;
      alive = false; cancelAnimationFrame(frame);
      if (read()?.done) render();
      else if (nationalUpdate(() => ({ ok: true }), false)) render();
      return true;
    }
    return false;
  };
  ui.canvas.addEventListener('pointerdown', event => {
    if (pointer || read().paused || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); audio.unlock();
    if (!commit(current => Challenge.beginSwipe(current))) return;
    pointer = { ...ui.point(event), id: event.pointerId, time: performance.now() };
    stroke = { points: [{ ...pointer }], hits: [], distance: 0 };
    try { ui.canvas.setPointerCapture(event.pointerId); } catch {}
  });
  ui.canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer?.id || read().paused) return;
    event.preventDefault(); const next = ui.point(event), now = performance.now(), previous = { ...pointer };
    let hits = [];
    if (!commit(current => { hits = Challenge.swipe(current, previous, next, { duration: Math.max(.018, (now - previous.time) / 1000) }).hits; })) { finishStroke(true); return; }
    stroke.points.push(next); stroke.hits.push(...hits); stroke.distance += Math.hypot(next.x - previous.x, next.y - previous.y);
    pointer = { ...next, id: event.pointerId, time: now };
    if (!transition()) draw();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) ui.canvas.addEventListener(type, event => {
    if (event.pointerId !== pointer?.id) return;
    if (finishStroke(type !== 'pointerup')) { if (!transition()) draw(); }
  });
  const pause = (reason = 'pause') => {
    last = 0;
    const recorded = stroke, oldPointer = pointer; stroke = null; pointer = null;
    try { if (oldPointer && ui.canvas.hasPointerCapture(oldPointer.id)) ui.canvas.releasePointerCapture(oldPointer.id); } catch {}
    commit(current => Challenge.setPaused(current, true));
    if (recorded && !nationalUpdate(draft => { Formal.noteCutStroke(draft, recorded, true); return { ok: true }; }, false)) { draw(); return; }
    nationalFlush(reason);
    const toggle = [...body.querySelectorAll('button')].find(button => ['暂停切割测试', '继续切割测试'].includes(button.textContent));
    if (toggle) toggle.textContent = '继续切割测试';
    draw();
  };
  const blur = () => pause('blur'), hidden = () => { if (document.hidden) pause('background'); }, pagehide = () => pause('pagehide');
  document.addEventListener('visibilitychange', hidden); window.addEventListener('blur', blur); window.addEventListener('pagehide', pagehide);
  body.append(teamFooter('从最近保存的进度接着玩；恢复后先暂停，点继续再玩。', run.paused ? '继续切割测试' : '暂停切割测试', () => {
    if (!read().paused) { pause('pause'); render(); return; }
    if (nationalUpdate(draft => { Challenge.setPaused(draft.nationalOperation, false); return { ok: true }; }, false)) {
      nationalSave.recovered = false; render();
    }
  }));
  const skip = el('button', { class: 'btn', text: '收手，按原规则放弃本项', onclick: () => {
    const content = el('div', {}, [el('p', { text: '确认收手？沿用原放弃规则及已有受损，不恢复刀况；本轮仍需确认。' }), el('button', { class: 'btn btn--primary', text: '确认收手', onclick: () => {
      const saved = nationalUpdate(draft => {
        const performance = Challenge.finish(draft.nationalOperation, 'abandon');
        Suite.annotateAbandonedSuite(draft);
        performance.tests = Suite.suiteSummary(draft.formalPerformance);
        return Core.arena.skipFieldTest(draft, performance);
      }, false);
      if (saved) { handle.close(); render(); }
    } })]);
    const handle = sheet({ title: '确认收手', body: content });
  } });
  ui.stage.append(skip);
  const tick = now => {
    if (!alive || !ui.canvas.isConnected) return;
    const dt = last ? Math.min(.05, (now - last) / 1000) : 0; last = now;
    if (!read().paused && dt) commit(current => { Challenge.tick(current, dt); });
    nationalCheckpointTick(now);
    if (transition()) return;
    draw(); frame = requestAnimationFrame(tick);
  };
  teamStageCleanup = shouldPause => { alive = false; cancelAnimationFrame(frame); if (shouldPause) pause('leave'); else if (pointer) pause('stage-interrupted'); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('blur', blur); window.removeEventListener('pagehide', pagehide); };
  draw(); frame = requestAnimationFrame(tick);
}
function renderNationalOperationStage() {
  const matchId = currentArenaMatch().id;
  const nationalUpdate = (fn, redraw = true) => nationalCommit(matchId, fn, redraw);
  const read = () => nationalLocalOperation();
  if (!read()) { body.append(nationalSaveStatus()); nationalPaintSave(); return; }
  if (read().done) {
    nationalUpdate(draft => ({ ok: Suite.recordSuiteOperation(draft.formalPerformance, draft.nationalOperation.result) }));
    return;
  }
  const precision = read().kind === 'precision';
  const instructions = precision ? '从「刀尖」圆环按下，拖到工件中心刻度，松手提交。' : '按住「加载区」，压力进入刻线承压窗口后松手。';
  const ui = nationalTestStage(instructions);
  let pointerId = null, frame = 0, last = 0, alive = true;
  const change = fn => {
    if (!read()) return false;
    nationalLocal.operation = fn(read());
    nationalMarkDirty(); return true;
  };
  const draw = () => {
    const state = read(); if (!state || !ui.canvas.isConnected) return;
    const r = ui.resize(), ctx = ui.ctx, w = r.width, h = r.height;
    if (!ctx) return;
    ctx.fillStyle = '#102735'; ctx.fillRect(0, 0, w, h); ctx.fillStyle = '#e9d2a2'; ctx.font = '12px system-ui'; ctx.textAlign = 'center';
    if (precision) {
      const start = state.config.initialPoint, target = state.config.target;
      ctx.fillStyle = '#34566b'; ctx.fillRect(w * .1, h * .3, w * .8, h * .28);
      for (let i = 1; i <= 9; i++) { ctx.strokeStyle = '#8fa7af'; ctx.beginPath(); ctx.moveTo(w * i / 10, h * .3); ctx.lineTo(w * i / 10, h * .38); ctx.stroke(); }
      ctx.strokeStyle = '#e9d2a2'; ctx.beginPath(); ctx.ellipse(target.x * w, target.y * h, state.config.tolerance * w, state.config.tolerance * h, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#e9d2a2'; ctx.fillText('工件中心刻度', target.x * w, h * .24);
      ctx.beginPath(); ctx.arc(start.x * w, start.y * h, 13, 0, Math.PI * 2); ctx.stroke(); ctx.fillText('刀尖 · 从此按下', start.x * w, start.y * h + 30);
      const p = state.current || start; ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.moveTo(p.x * w - 10, p.y * h); ctx.lineTo(p.x * w + 10, p.y * h); ctx.moveTo(p.x * w, p.y * h - 10); ctx.lineTo(p.x * w, p.y * h + 10); ctx.stroke();
    } else {
      const window = state.config.window, max = window.max * 1.5, x = w * .12, y = h * .16, length = w * .76;
      ctx.fillStyle = '#34566b'; ctx.fillRect(x, y, length, 22); ctx.fillStyle = '#826b40'; ctx.fillRect(x + length * window.min / max, y - 4, length * (window.max - window.min) / max, 30);
      ctx.fillStyle = '#b5d7da'; ctx.fillRect(x, y + 7, length * Math.min(1, state.load / max), 8);
      const center = state.config.target; ctx.fillStyle = '#527082'; ctx.fillRect(w * .15, h * .4, w * .7, h * .26); ctx.strokeStyle = '#e9d2a2'; ctx.beginPath(); ctx.ellipse(center.x * w, center.y * h, state.config.zone.radius * w, state.config.zone.radius * h, 0, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#e9d2a2'; ctx.fillText('加载区 · 按住', center.x * w, h * .82);
    }
    ui.hud.textContent = precision ? `精度偏差 ${((state.result?.distance || 0) * 100).toFixed(1)}%${state.paused ? ' · 已暂停' : ''}` : `加载 ${state.load.toFixed(2)} · 承压窗 ${state.config.window.min.toFixed(2)}–${state.config.window.max.toFixed(2)}${state.paused ? ' · 已暂停' : ''}`;
    ui.feedback.textContent = state.paused ? '测试已暂停；请先点「继续操作」，再从标记处重新按下。' : state.result?.status === 'not_started' ? '未锁定起始区域，请从标记处按下。' : state.interruption ? '操作已中断，未提交；请重新按下。' : instructions;
  };
  const clearPointer = () => { const old = pointerId; pointerId = null; try { if (old != null && ui.canvas.hasPointerCapture(old)) ui.canvas.releasePointerCapture(old); } catch {} };
  const interrupt = (pause = false, reason = 'stage-interrupted') => {
    last = 0;
    if (pointerId != null || pause) {
      change(state => Performance.pauseOperation(Performance.interruptOperation(state, reason), pause));
      clearPointer(); nationalFlush(reason);
      const toggle = [...body.querySelectorAll('button')].find(button => ['暂停操作', '继续操作'].includes(button.textContent));
      if (toggle && read().paused) toggle.textContent = '继续操作';
    } else clearPointer();
    draw();
  };
  ui.canvas.addEventListener('pointerdown', event => {
    if (pointerId != null || read().paused || event.isPrimary === false || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault(); if (!change(state => Performance.beginOperation(state, ui.point(event)))) return;
    if (read().active) { pointerId = event.pointerId; try { ui.canvas.setPointerCapture(pointerId); } catch {} } draw();
  });
  ui.canvas.addEventListener('pointermove', event => { if (pointerId !== event.pointerId) return; event.preventDefault(); const p = ui.point(event); if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) interrupt(); else { change(state => Performance.moveOperation(state, p)); draw(); } });
  ui.canvas.addEventListener('pointerup', event => {
    if (pointerId !== event.pointerId) return;
    const p = ui.point(event); if (p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) { interrupt(); return; }
    if (change(state => Performance.endOperation(state, p))) {
      clearPointer();
      if (nationalUpdate(draft => ({ ok: Suite.recordSuiteOperation(draft.formalPerformance, draft.nationalOperation.result) }), false)) render();
    }
  });
  for (const type of ['pointercancel', 'lostpointercapture']) ui.canvas.addEventListener(type, event => { if (pointerId === event.pointerId) interrupt(); });
  const pause = () => interrupt(true, 'blur'), hidden = () => { if (document.hidden) interrupt(true, 'background'); }, pagehide = () => interrupt(true, 'pagehide');
  window.addEventListener('blur', pause); document.addEventListener('visibilitychange', hidden); window.addEventListener('pagehide', pagehide);
  const actions = el('div', { class: 'arena-team-score' }, [el('button', { class: 'btn', text: read().paused ? '继续操作' : '暂停操作', onclick: () => {
    clearPointer();
    if (nationalUpdate(draft => { draft.nationalOperation = Performance.pauseOperation(draft.nationalOperation, !draft.nationalOperation.paused); draft.formalPerformance.operation = draft.nationalOperation; return { ok: true }; }, false)) { nationalSave.recovered = false; render(); }
  } }), el('button', { class: 'btn', text: '重置本项操作', onclick: () => {
    clearPointer();
    nationalUpdate(draft => { draft.nationalOperation = Performance.resetOperation(draft.nationalOperation); draft.formalPerformance.operation = draft.nationalOperation; return { ok: true }; });
  } })]);
  body.append(actions, el('p', { class: 'arena-note', text: '精度容差与承压窗复用本轮原现场测试参数；仅诊断，不新增刀损。松手后保存成绩。' }));
  const tick = now => {
    if (!alive || !ui.canvas.isConnected) return;
    const dt = last ? Math.min(.05, (now - last) / 1000) : 0; last = now;
    if (read().active && !read().paused && dt) change(state => Performance.tickOperation(state, dt));
    nationalCheckpointTick(now);
    draw(); frame = requestAnimationFrame(tick);
  };
  teamStageCleanup = shouldPause => { alive = false; cancelAnimationFrame(frame); if (shouldPause || pointerId != null) interrupt(shouldPause, shouldPause ? 'leave' : 'stage-interrupted'); window.removeEventListener('blur', pause); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('pagehide', pagehide); };
  draw(); frame = requestAnimationFrame(tick);
}
