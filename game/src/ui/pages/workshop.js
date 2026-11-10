/** 工坊：藏刀阁、成就、锻造加成与图鉴；保留长期玩法与完整检视信息。 */
import { el, $, clear, mount, toast, sheet } from '../dom.js';
import { icon } from '../icons.js';
import { ICONS, rarityBadge, statRail } from '../components.js';
import { bladeCardModel, bladeCard, bladeCardDetail, compareModels } from '../bladeCard.js';
import * as Core from '../../core/index.js';
import { ACHIEVEMENTS, ACHIEVEMENT_GROUPS } from '../../data/achievements.js';
import { COMBOS } from '../../data/combos.js';
import { KNIFE_TYPES, resolveModelId } from '../../data/knifeTypes.js';
import { tagName } from '../../data/tags.js';
import { getTrait } from '../../data/traits.js';
import { Game } from '../../app/game.js';
import { BladeStage } from '../../render/index.js';
import { mountCollectionPreview, disconnectCollectionPreviews, releaseCollectionPreviewStage, applyCollectionLighting } from '../../render/collectionPreview.js';
import * as CodexCatalog from '../../data/codexCatalog.js';
import router from '../router.js';
import { bladeMastery, hasLiveFurnace, openFurnace } from '../../core/v19Progress.js';
import { LEGACY_MODE as legacy } from '../../platform/env.js';
import { FITS, LOOKS, REFINEMENT_RESULTS, STAT_CAP, fittingPrice, oreMaterialOf, signaturePerk } from '../../v19/forge.js';
import { workshopPerks } from '../../v19/workshop.js';

const canResumeForge = () => legacy ? Game.run && !Game.run.finished : hasLiveFurnace();
const bonusDescriptions = {
  extra_reroll: '装配时免费刷新一次配件',
  specialty_press: '从第十一锤起，降低断裂概率',
  specialty_edge: '刃侧有效落锤增加鉴定时的锋利',
  specialty_precise: '精炼质量为选定属性提供加成',
  specialty_quench: '增加指定色系表面膜的出现权重',
  specialty_composite: '两类刀面达到 II 档后，有机会把变化提升为强化',
  specialty_overload: '首次通过 10% 断率检查后，有机会触发暴发',
};

const TABS = [
  { id: 'collection', name: '藏刀阁', icon: 'collection' },
  { id: 'achievements', name: '成就', icon: 'arena' },
  { id: 'bonuses', name: '锻造加成', icon: 'forge' },
  { id: 'codex', name: '图鉴', icon: 'workshop' },
];

let root = null;
let body = null;
let tabHost = null;
let tab = legacy ? 'collection' : null;
let detailSequence = 0;

/* ★ rework T13.4：收藏的筛选/排序/比较多刀。
   与 tab 一样是模块态，跨 render 保留；不写存档。 */
const SORTS = [
  { id: 'score', name: '评分' },
  { id: 'recent', name: '最新' },
  { id: 'arena', name: '赛事经历' },
  { id: 'name', name: '名称' },
];
const FILTERS = [
  { id: 'all', name: '全部' },
  { id: 'arena', name: '有赛事经历' },
  { id: 'trait', name: legacy ? '有高阶特性' : '签名 / III 档' },
];
let collectionSort = 'score';
let collectionFilter = 'all';
// A very large archive must not instantiate hundreds of PBR card models,
// observers and DOM nodes at once. Keep sorting/filtering across ALL blades.
const COLLECTION_PAGE_SIZE = 24;
let collectionPage = 0;
/** 比较选择（最多 2 把） */
let compareIds = [];

/* ★ rework T12：图鉴的搜索与筛选状态（模块态，跨 render 保留）。
   图鉴有 460 项，没有搜索就只能一页页翻。 */
let codexQuery = '';
let codexOnlyMissing = false;

export function create() {
  root = $('.page[data-page="workshop"]');
  if (!root) return;
  clear(root);
  tabHost = el('div', legacy ? { class: 'pill-tabs ws-tabhost', role: 'tablist', 'aria-label': '工坊分类' } : { class: 'ws-local-head' });
  body = el('div', { class: 'ws-body', role: legacy ? 'tabpanel' : null, id: 'workshopPanel', tabindex: '0' });
  root.append(tabHost, body);
}

export function leave() {
  releaseCollectionPreviewStage();
  if (!legacy) tab = null;
}

export function render() {
  if (!root) create();
  if (!body) return;
  if (legacy) mount(tabHost, TABS.map((item) => el('button', {
    class: 'pill-tab' + (item.id === tab ? ' is-on' : ''),
    type: 'button', role: 'tab',
    'aria-selected': String(item.id === tab), 'aria-controls': 'workshopPanel', id: `workshopTab-${item.id}`, tabindex: item.id === tab ? '0' : '-1',
    onkeydown: event => {
      if (!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
      event.preventDefault();
      const index = TABS.findIndex(entry => entry.id === tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? TABS.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + TABS.length) % TABS.length;
      tab = TABS[next].id; root.scrollTop = 0; render(); tabHost.querySelector('[aria-selected="true"]')?.focus();
    },
    text: item.name,
    onclick: () => { tab = item.id; root.scrollTop = 0; render(); tabHost.querySelector('[aria-selected="true"]')?.focus({ preventScroll: true }); },
  })));
  if (legacy) body.setAttribute('aria-labelledby', `workshopTab-${tab}`);
  else {
    const current = TABS.find(item => item.id === tab);
    mount(tabHost, current ? [
      el('button', { class: 'btn btn--icon ws-return', type: 'button', 'aria-label': '返回工坊', onclick: () => openTab(null) }, [icon('back')]),
      el('h1', { text: current.name, tabindex: '-1' }),
    ] : []);
    tabHost.hidden = !current;
  }
  disconnectCollectionPreviews();
  // Switching away from the archive inside Workshop also frees its idle GPU
  // renderer; leaving the route is handled by leave().
  if (tab !== 'collection') releaseCollectionPreviewStage();
  clear(body);
  if (!tab) {
    mount(body, el('nav', { class: 'ws-destinations', 'aria-label': '工坊分类' }, TABS.map(item => el('button', {
      class: 'ws-destination', type: 'button', onclick: () => openTab(item.id),
    }, [ICONS[item.icon](false), el('span', { text: item.name }), icon('next')]))));
    return;
  }
  ({ collection: renderCollection, achievements: renderAchievements, bonuses: renderBonuses, codex: renderCodex })[tab]();
}

/** 首页快捷导航可直接进入指定工坊分类。 */
export function openTab(id) {
  if ((!legacy && id === null) || TABS.some((item) => item.id === id)) {
    if (tab !== id && root) root.scrollTop = 0;
    tab = id;
  }
  router.go('workshop');
}

/* ── 藏刀阁 ───────────────────────────────────────────── */
function renderCollection() {
  const list = Core.progress.collection();
  const fractures = Core.progress.fracturedList();
  body.appendChild(el('div',{class:'ws-collection-head'},[
    el('span',{class:'muted tiny',text:`成刀 ${list.length} 把`}),
    el('button',{
      class:'ws-fracture-entry',type:'button','aria-haspopup':'dialog',
      'aria-label':`断刀册，${fractures.length} 把，查看断裂记录`,onclick:openFractures,
    },[el('span',{text:`断刀册 · ${fractures.length}`}),icon('next')]),
  ]));
  if (!list.length) {
    body.appendChild(emptyCollection());
    return;
  }

  /* ★ rework T13.4：筛选与排序控件 */
  body.appendChild(el('div', { class: 'ws-collection-controls' }, [
    el('div', { class: 'ws-control-row', role: 'group', 'aria-label': '排序' }, [
      el('span', { class: 'muted tiny', text: '排序' }),
      ...SORTS.map((s) => el('button', {
        class: 'chip' + (collectionSort === s.id ? ' chip--accent' : ''),
        type: 'button', 'aria-pressed': String(collectionSort === s.id), text: s.name,
        onclick: () => { collectionSort = s.id; collectionPage = 0; render(); },
      })),
    ]),
    el('div', { class: 'ws-control-row', role: 'group', 'aria-label': '筛选' }, [
      el('span', { class: 'muted tiny', text: '筛选' }),
      ...FILTERS.map((f) => el('button', {
        class: 'chip' + (collectionFilter === f.id ? ' chip--accent' : ''),
        type: 'button', 'aria-pressed': String(collectionFilter === f.id), text: f.name,
        onclick: () => { collectionFilter = f.id; collectionPage = 0; render(); },
      })),
    ]),
    compareIds.length ? el('div', { class: 'ws-control-row' }, [
      el('span', { class: 'muted tiny', text: `已选 ${compareIds.length}/2 把` }),
      el('button', {
        class: 'btn btn--primary', type: 'button', text: '比较这两把',
        disabled: compareIds.length < 2,
        onclick: () => openCompare(),
      }),
      el('button', { class: 'btn btn--icon', type: 'button', 'aria-label':'取消选择', title:'取消选择', onclick: () => { compareIds = []; render(); } }, [icon('close')]),
    ]) : null,
  ].filter(Boolean)));

  /* 筛选 → 排序（只影响展示顺序，不改存档） */
  let shown = list.slice();
  if (collectionFilter === 'arena') shown = shown.filter((b) => (b.arenaHistory || []).length > 0);
  else if (collectionFilter === 'trait') {
    shown = shown.filter((b) => b.v19Visual ? signaturePerk(b.combos?.[0]) ||
      Object.values(b.v19Visual.skin?.levels || {}).some(tier => tier === 3) :
      (b.tagTiers || []).some((t) => (t.effectiveLayers ?? t.layers ?? 0) >= 6)
      || (b.traits || []).some((id) => getTrait(id)?.kind === 'SPECIAL_TAG'));
  }
  shown.sort((a, b) => {
    if (collectionSort === 'recent') return (b.createdAt || 0) - (a.createdAt || 0);
    if (collectionSort === 'name') return String(a.bladeName || a.id).localeCompare(String(b.bladeName || b.id), 'zh');
    if (collectionSort === 'arena') return (b.arenaHistory || []).length - (a.arenaHistory || []).length;
    return (b.score || 0) - (a.score || 0);
  });

  if (!shown.length) {
    body.appendChild(el('div', { class: 'card ws-empty' }, [icon('help'), el('b', {text:'还没有符合条件的刀'}), el('p', {class:'muted',text:'换个筛选条件，看看其他收藏。'}), el('button',{class:'btn',text:'查看全部',onclick:()=>{collectionFilter='all';collectionPage=0;render();}})]));
    return;
  }

  const pageCount = Math.ceil(shown.length / COLLECTION_PAGE_SIZE);
  collectionPage = Math.max(0, Math.min(collectionPage, pageCount - 1));
  const start = collectionPage * COLLECTION_PAGE_SIZE;
  const onPage = shown.slice(start, start + COLLECTION_PAGE_SIZE);
  const grid = el('div', { class: 'ws-collection-grid' });
  body.appendChild(grid);
  for (const blade of onPage) {
    /* ★ rework T13.1：用**共用**展示模型与卡片，不在这里另拼一套。
       3D 缩略图仍由 mountCollectionPreview 挂到卡面主视觉位。 */
    const model = bladeCardModel(blade, { kind: 'collection' });
    const art = el('div', { class: 'blade-thumb', 'aria-hidden': 'true' });
    if (blade.v19Visual) {
      const { skin, ore } = blade.v19Visual;
      const finish = LOOKS.film[skin.film] || LOOKS.pattern[skin.pattern] || LOOKS.metal[skin.metal];
      art.classList.add('v19-collection-art');
      art.style.setProperty('--mineral-color', oreMaterialOf(ore).steel);
      art.append(icon('forge'), el('span', { text: finish }));
    } else {
      const visual = Game.resolveVisualState(blade, {}, { modelId: model.modelId, viewPreset: 'forge' });
      mountCollectionPreview(art, blade, visual);
    }

    const picked = compareIds.includes(blade.id);
    const card = bladeCard(model, { art, onOpen: () => inspect(blade) });
    card.appendChild(el('div', { class: 'bcv-top bcv-compare-row', style: { gap: '6px' } }, [
      el('button', {
        /* ★ 移动端：卡片内的“加入比较”也是可点控件。
           移动审计（audit-mobile.mjs）在 4 个视口都报它只有 66×24。
           加专门类名，由 CSS 顶到 ≥44px（桌面仍可紧凑）。 */
        class: 'chip bcv-compare-btn' + (picked ? ' chip--accent' : ''), type: 'button',
        'aria-pressed': String(picked),
        text: picked ? '✓ 待比较' : '加入比较',
        onclick: (e) => {
          e.stopPropagation();
          const i = compareIds.indexOf(blade.id);
          if (i >= 0) compareIds.splice(i, 1);
          else if (compareIds.length < 2) compareIds.push(blade.id);
          else { toast('最多比较两把刀', 'warn'); return; }
          render();
        },
      }),
    ]));
    grid.appendChild(card);
  }
  if (pageCount > 1) {
    const paginate = (next) => {
      if (next < 0 || next >= pageCount || next === collectionPage) return;
      collectionPage = next;
      root.scrollTop = 0;
      render();
    };
    body.appendChild(el('nav', {
      class: 'ws-collection-pagination', 'aria-label': '藏刀阁分页',
    }, [
      el('span', { class: 'muted tiny', text: `第 ${collectionPage + 1} / ${pageCount} 页 · 当前 ${start + 1}–${start + onPage.length} / ${shown.length} 把` }),
      el('div', { class: 'ws-collection-page-actions' }, [
        el('button', { class: 'chip', text: '首页', disabled: collectionPage === 0,
          onclick: () => paginate(0) }),
        el('button', { class: 'chip', text: '上一页', disabled: collectionPage === 0,
          onclick: () => paginate(collectionPage - 1) }),
        el('button', { class: 'chip', text: '下一页', disabled: collectionPage >= pageCount - 1,
          onclick: () => paginate(collectionPage + 1) }),
        el('button', { class: 'chip', text: '末页', disabled: collectionPage >= pageCount - 1,
          onclick: () => paginate(pageCount - 1) }),
      ]),
    ]));
  }
}

/** 两刀比较（T13.4：突出项目专长、特性与纪录，不只按总分判优） */
function openCompare() {
  const models = compareIds
    .map((id) => Core.progress.bladeById(id))
    .filter(Boolean)
    .map((b) => bladeCardModel(b, { kind: 'collection' }));
  if (models.length < 2) return;
  const { rows, labels } = compareModels(models);
  const table = el('div', { class: 'ws-compare' }, [
    el('div', { class: 'ws-compare-row is-head' }, [
      el('span', { text: '' }),
      ...labels.map((l) => el('b', { text: l })),
    ]),
    ...rows.map((row) => el('div', { class: 'ws-compare-row' }, [
      el('span', { class: 'muted tiny', text: row.label }),
      ...row.values.map((v, i) => el('span', {
        class: row.best === i ? 'is-best' : '',
        text: v,
      })),
    ])),
  ]);
  sheet({ title: '比较成刀', body: el('div', { class: 'stack' }, [
    table,
    el('p', { class: 'muted tiny', text: '高亮表示该项更优；相同则不标。评分高不等于所有项目都更强 —— 请结合刀型与特性看项目专长。' }),
  ]) });
}

/** 断刀档案只读展示；不依赖完整成刀，也不提供参赛或收藏操作。 */
function openFractures() {
  const content = el('div', { class: 'stack ws-fracture-content' });
  const archive = sheet({ title: '断刀册', body: content });
  archive.panel.classList.add('ws-fracture-sheet');
  const scroll = archive.panel.querySelector('.sheet-body');
  const title = archive.panel.querySelector('.sheet-title');
  const line = (label, value) => el('div', { class: 'report-line', text: `${label}：${value ?? '未记录'}` });
  let listScroll = 0;
  function showList(focusIndex) {
    title.textContent = '断刀册';
    const records = Core.progress.fracturedList();
    mount(content, el('div', { class: 'muted tiny', text: `断刀 ${records.length} 把 · 仅供查看记录` }));
    if (!records.length) content.appendChild(el('div', {
      class: 'card ws-empty', text: '暂无断刀记录。断裂记录会保留在这里，可返回工坊继续查看其他档案。',
    }));
    records.forEach((blade, index) => content.appendChild(el('button', {
      class: 'card ws-fracture-item', type: 'button',
      'aria-label': `查看断刀详情：${blade.bladeName || blade.id || `断刀 ${index + 1}`}`,
      onclick: () => { listScroll = scroll.scrollTop; showDetail(blade, index); },
    }, [
      el('b', { text: blade.bladeName || blade.id || `断刀 ${index + 1}` }),
      el('span', { text: `断裂于 ${blade.fractureInfo?.stageName || blade.fractureInfo?.stageId || '未记录阶段'}` }),
      el('span', { class: 'muted tiny', text: `风险：${blade.fractureInfo?.risk ?? '未记录'} · 查看详情 ›` }),
    ])));
    scroll.scrollTop = listScroll;
    if (focusIndex != null) content.querySelectorAll('.ws-fracture-item')[focusIndex]?.focus({ preventScroll: true });
  }
  function showDetail(blade, index) {
    const info = blade.fractureInfo || {};
    const type = KNIFE_TYPES.find(item => item.id === blade.knifeTypeId);
    title.textContent = '断刀详情';
    const back = el('button', { class: 'btn ws-fracture-back', type: 'button', text: '返回断刀列表', onclick: () => showList(index) });
    mount(content, back,
      el('h3', { class: 'ws-fracture-name', text: blade.bladeName || blade.id || `断刀 ${index + 1}` }),
      el('div', { class: 'muted tiny', text: '断刀档案仅供回顾，不可作为完整成刀参赛。' }),
      el('div', { class: 'card stack' }, [
        line('档案编号', blade.id), line('刀型', type?.name || blade.knifeTypeId),
        line('来源', info.source === 'arena' ? '赛事断裂' : info.source || '锻造断裂'),
        line('断裂阶段', info.stageName || info.stageId), line('原因', info.cause || info.reason),
        line('风险', info.risk), line('峰值风险', info.peakRisk ?? blade.riskPeak),
        line('断裂概率', Number.isFinite(info.chance) ? `${Number((info.chance * 100).toFixed(2))}%` : null),
        ...(info.matchId ? [line('赛事编号', info.matchId)] : []),
      ]),
      el('div', { class: 'section-title', text: '六维属性' }), statRail(blade.stats || {}, null, true, blade.v19Visual ? STAT_CAP : undefined),
      line('评分', blade.score), line('品质', blade.qualityName),
      ...(blade.v19Visual ? [] : [
        line('永久特性', (blade.traits || []).map(id => getTrait(id)?.name || id).join('、') || '无'),
        line('隐藏连携', (blade.combos || []).map(id => COMBOS.find(item => item.id === id)?.name || id).join('、') || '无'),
        line('工艺路线', (blade.history || []).join(' → ') || '未记录'),
      ]),
      ...(info.evidence ? [el('details', { class: 'ws-fracture-evidence' }, [
        el('summary', { text: '结构失效记录' }),
        el('pre', { text: JSON.stringify(info.evidence, null, 2) }),
      ])] : []),
    );
    scroll.scrollTop = 0;
    back.focus({ preventScroll: true });
  }
  showList();
}

function inspect(blade) {
  const recipe = blade.v19Visual;
  const modelId = resolveModelId(blade, blade.knifeTypeId);
  const visual = recipe ? null : Game.resolveVisualState(blade, {}, { modelId, viewPreset: 'forge' });
  const previewHost = el('div', { class: 'blade-detail-stage', role: recipe ? 'group' : 'img', 'aria-label': `${blade.bladeName || '成刀'}三维档案外观` });
  const previewStatus = el('div', { class: 'blade-detail-stage-status', text: BladeStage.supported ? '正在载入档案外观…' : '此设备不支持 WebGL，档案外观不可预览' });
  /* ★ rework T13.1：详情也读**同一份**展示模型（含赛事经历、工艺、风险）。
     改造前这里另拼了一套 trait/六维/履历，与卡面、赛报各说一套。 */
  const model = bladeCardModel(blade, { kind: 'collection' });
  const mastery = legacy ? null : bladeMastery(blade);
  const details = el('div', { class: 'stack' }, [
    el('div', { class: 'blade-detail-hero' }, [previewHost, previewStatus]),
    el('div', { class: 'blade-detail-head' }, [
      rarityBadge(blade.rarity, blade.rarityName),
      el('span', { class: 'chip', text: `品质 ${blade.qualityName || '未记录'}` }),
      el('span', { class: 'chip', text: `评分 ${blade.score ?? '—'}` }),
      model.arenaWins > 0 ? el('span', { class: 'chip chip--accent', text: `${model.arenaWins} 胜` }) : null,
    ].filter(Boolean)),
    /* 卡背：六维、特性（标注赛场职责）、连携、赛事经历、工艺与档案 */
    ...(recipe ? [v19CraftDetails(recipe, signaturePerk(blade.combos?.[0]))] : []),
    ...(mastery ? [el('div', { class: 'report-line',
      text: `${mastery.level} · ${mastery.project}专长 +${Math.round(mastery.bonus * 100)}% · 有效 ${mastery.matches} 场` })] : []),
    bladeCardDetail(model),
    el('div', { class: 'blade-detail-actions' }, [
      el('button',{class:'btn btn--primary',text:'12秒短试刀',disabled:blade.canEnterArena === false,onclick:async()=>{
        if (legacy) {
          const Arena = await import('./arena.js');
          const result = Arena.openCollectionSample(blade.id);
          if (!result?.ok) return toast(result?.reason || '当前无法试刀', 'warn');
          detailSheet.close();
        } else {
          const { openTournament } = await import('./v19Arena.js');
          detailSheet.close();
          openTournament({ bladeId: blade.id, mode: 'practice' });
        }
      }}),
      el('button', {
        class: 'btn', text: '设为代表作',
        onclick: () => { if (Core.progress.setShowcase(blade.id)) toast('已设为代表作', 'good'); },
      }),
      el('button', {
        class: 'btn', text: '重命名',
        onclick: () => {
          const input=el('input',{class:'name-input',type:'text',value:blade.bladeName||'',maxlength:'24','aria-label':'新的刀名',autocomplete:'off'});
          const submit=el('button',{class:'btn btn--primary btn--block',type:'submit',text:'保存刀名'});
          const form=el('form',{class:'stack',onsubmit:event=>{
            event.preventDefault();
            const nextName=input.value.trim();
            if(!nextName){input.focus();return;}
            if(!Core.progress.renameBlade(blade.id,nextName)){toast('保存失败，请重试','warn');return;}
            const currentName=Core.progress.bladeById(blade.id)?.bladeName||nextName;
            detailSheet.panel.querySelector('.sheet-title').textContent=currentName;
            detailSheet.panel.setAttribute('aria-label',currentName);
            previewHost.setAttribute('aria-label',`${currentName}三维档案外观`);
            rename.close();toast('已重命名','good');render();
          }},[el('label',{class:'muted tiny',text:'给这把刀一个名字，最多 24 个字符。'}),input,submit]);
          const rename=sheet({title:'重命名',body:form});
          requestAnimationFrame(()=>{input.focus();input.select();});
        },
      }),
    ]),
  ]);
  const sequence = ++detailSequence;
  let detailStage = null;
  let v19Preview;
  const detailSheet = sheet({
    title: blade.bladeName || blade.id,
    body: details,
    onClose: () => {
      if (detailSequence === sequence) detailSequence++;
      v19Preview?.close();
      if (detailStage) detailStage._seq++;
      detailStage?.dispose();
      detailStage = null;
    },
  });
  detailSheet.panel.classList.add('blade-detail-sheet');
  // 仅调整 UI 层级：操作区离开滚动正文，原按钮及其行为保持不变。
  detailSheet.panel.appendChild(details.querySelector('.blade-detail-actions'));
  if (recipe) {
    import('../../v19/sharedStage.js').then(({ showForgedBlade }) => {
      if (detailSequence !== sequence || !previewHost.isConnected) return;
      v19Preview = showForgedBlade(previewHost, recipe);
      return v19Preview.ready.then(ready => {
        if (detailSequence !== sequence) return;
        if (ready) previewStatus.remove();
        else previewStatus.textContent = '档案外观暂不可预览';
      });
    }).catch(() => { if (detailSequence === sequence) previewStatus.textContent = '档案外观暂不可预览'; });
    return;
  }
  if (!modelId || !visual?.skin) {
    previewStatus.textContent = '档案缺少刀型或视觉数据，无法预览';
    return;
  }
  if (!BladeStage.supported) return;
  detailStage = new BladeStage();
  (async () => {
    const stage = detailStage;
    const mounted = await stage.mount(previewHost);
    if (detailSequence !== sequence || !previewHost.isConnected) { stage.dispose(); return; }
    if (!mounted?.ok) {
      previewStatus.textContent = '档案外观暂不可预览';
      stage.dispose();
      if (detailStage === stage) detailStage = null;
      return;
    }
    applyCollectionLighting(stage);
    const environment = await stage.loadEnvironment();
    if (detailSequence !== sequence || !previewHost.isConnected) { stage.dispose(); return; }
    const shown = await stage.show(modelId, { viewPreset: visual.viewPreset || 'forge' });
    if (detailSequence !== sequence || !previewHost.isConnected) { stage.dispose(); return; }
    if (!shown?.ok) {
      previewStatus.textContent = '档案外观暂不可预览';
      stage.dispose();
      if (detailStage === stage) detailStage = null;
      return;
    }
    stage.applySkin(visual.skin, { coverAll: !visual.handle?.explicit });
    stage.applyHandle(visual.handle?.explicit ? visual.handle : null, visual.skin);
    stage.applyGlow(visual.glowCardId || null);
    try { await stage.viewer?._compilePromise; } catch (_) { /* 仍保留可用的 GLB 外形 */ }
    if (detailSequence !== sequence || !previewHost.isConnected) { stage.dispose(); return; }
    if (environment?.ok) previewStatus.remove();
    else previewStatus.textContent = '环境反射不可用，当前档案外观为降级预览';
  })().catch(() => {
    if (detailSequence === sequence) previewStatus.textContent = '档案外观暂不可预览';
  });
}

/* ── 成就 ─────────────────────────────────────────────── */
function v19CraftDetails(recipe, perk) {
  const looks = Object.entries(LOOKS).map(([slot, names]) => {
    const name = names[recipe.skin[slot]];
    return name ? `${name} ${['', 'I', 'II', 'III'][recipe.skin.levels[slot]] || ''}` : '';
  }).filter(Boolean);
  const fit = FITS.find(item => item.id === recipe.fit);
  const refined = REFINEMENT_RESULTS[recipe.refinement?.result];
  return el('div', { class: 'card stack' }, [
    el('b', { text: '刀面与装配' }),
    el('div', { class: 'report-line', text: looks.join(' · ') }),
    perk && el('div', { class: 'report-line', text: `${perk.name} · ${perk.desc}` }),
    el('div', { class: 'muted tiny', text: [
      oreMaterialOf(recipe.ore).name, refined && `${refined.label} ${recipe.refinement.quality}`,
      fit?.name, `${recipe.hits} 锤`,
    ].filter(Boolean).join(' · ') }),
  ]);
}

function renderAchievements() {
  const state = Core.progress.get();
  for (const group of ACHIEVEMENT_GROUPS) {
    const items = ACHIEVEMENTS.filter((achievement) => achievement.group === group.id);
    if (!items.length) continue;
    body.appendChild(el('div', { class: 'section-title', text: group.name }));
    for (const achievement of items) {
      const done = !!state.achievements[achievement.id];
      body.appendChild(el('div', { class: 'ach-item' + (done ? ' is-done' : '') }, [
        el('span', { class: 'ach-check', text: done ? '✓' : '○', 'aria-hidden': 'true' }),
        el('div', {}, [
          el('div', { class: 'trait-name', text: achievement.name }),
          el('div', { class: 'trait-desc', text: achievement.desc }),
          el('div', { class: 'tiny muted', text: achievement.reward?.cr ? `奖励 ${achievement.reward.cr} CR` : '' }),
        ]),
      ]));
    }
  }
}

/* ── 锻造加成（rework T11） ───────────────────────────── */
async function enterForge() {
  if (!legacy) {
    const result = openFurnace({ restart: true });
    if (!result.ok) return toast(result.error, 'warn');
    router.go('forge');
    return;
  }
  if (!canResumeForge()) Game.startForge({mode:'normal'});
  try { await Game.prewarmCandidates(); router.go('forge'); }
  catch (_) { toast('工艺准备未完成，请重试','warn'); }
}

function emptyCollection() {
  return el('section', {class:'card ws-empty'}, [
    icon('spark'), el('b',{text:'为第一把刀留个位置'}),
    el('p',{class:'muted',text:'鉴定完成后，作品与工艺会自动保存在这里。'}),
    el('button',{class:'btn btn--primary',text:canResumeForge() ? '继续锻刀' : '开始锻刀',onclick:enterForge}),
  ]);
}

function renderBonuses() {
  const state = Core.progress.get();
  const view = Core.progress.forgeBonusView();
  const growth = Core.arenaV41Growth.workshopSnapshot(state);
  const perks = workshopPerks(growth.level);
  body.appendChild(el('section',{class:'card stack', 'aria-label':'工坊等级'},[
    el('div',{class:'row row--between'},[
      el('b',{text:'工坊 · Lv.'+growth.level}),
      el('span',{class:'chip',text:growth.nextXp===null?'已满级':growth.xp+' / '+growth.nextXp+' XP'}),
    ]),
    el('div',{class:'report-line',text:legacy ? '付费刷新优惠 '+Math.round(growth.discount*100)+'%' :
      '配件付费刷新 '+fittingPrice({ workshopLevel: growth.level })+' CR · 稀质矿芯概率 +'+perks.rareBonus+' 个百分点'}),
    el('div',{class:'muted tiny',text:'单锤断裂概率相对降低 '+Math.round(growth.riskReduction*100)+'% · 新炉生效'}),
  ]));
  body.appendChild(el('header',{class:'ws-heading'},[
    el('span',{class:'ws-eyebrow',text:'开锻准备'}),
    el('h2',{text:'让下一把刀，更多一种可能'}),
    el('p',{text:legacy ? '选择一项加成，下一次普通锻造生效。永久解锁，每局可用一次。' :
      '选一项已解锁的加成。下一炉开工时锁定，触发条件见下方。'}),
  ]));
  body.appendChild(el('div',{class:'ws-bonus-list'},view.list.map(b=>{
    const equipped = view.equippedId === b.id;
    return el('button',{
      class:'ws-bonus'+(equipped?' is-equipped':''), type:'button',
      disabled:!b.unlocked, 'aria-pressed':String(equipped),
      'aria-label':b.name+(equipped?'，已装备，点击卸下':b.unlocked?'，点击装备':'，未解锁'),
      onclick:()=>{
        const result=Core.progress.equipForgeBonus(equipped?null:b.id);
        if(!result?.ok){toast(result?.reason||'装备失败','warn');return;}
        toast(equipped?'已卸下加成':`已装备：${b.name}`,'good');render();
      },
    },[
      el('span',{class:'ws-bonus-icon'},[icon(b.id==='extra_reroll'?'refresh':'spark')]),
      el('span',{class:'ws-bonus-copy'},[
        el('b',{text:b.name}),el('span',{text:legacy ? b.desc.replace('开锻前装备：','') : bonusDescriptions[b.id]}),
        el('small',{text:b.unlocked?'已解锁 · 新炉生效':`解锁条件：${b.unlockText}`}),
      ]),
      el('span',{class:'ws-bonus-check','aria-hidden':'true'},[equipped?icon('check'):icon('next')]),
    ]);
  })));
  // Only parameters for the one equipped discipline are editable. They will
  // freeze into the forge run upon starting S1.
  const specialty = view.specialty;
  if (specialty) {
    const id=specialty.bonusId,opts=specialty.options;
    const update=patch=>{
      const result=Core.progress.setSpecialtyOptions(id,patch);
      if(!result?.ok){toast(result?.reason||'专精配置保存失败','warn');return;}
      render();
    };
    const optionSelect=(title,value,choices,onchange)=>el('label',{class:'stack'},[
      el('span',{class:'tiny muted',text:title}),
      el('select',{class:'input',value,onchange:event=>onchange(event.target.value)},
        choices.map(([v,t])=>el('option',{value:v,text:t,selected:v===value}))),
    ]);
    const settings=[];
    if(specialty.id==='precise') {
      const attributes=[['strength','强度'],['toughness','韧性'],['sharpness','锋利'],['craft','工艺'],['design','设计'],['spirit','灵性']];
      settings.push(optionSelect('定向属性',opts.stat,attributes,v=>update({stat:v,stages:[]})));
      const valid=Core.arenaV41Specialties.validStatStages(opts.stat).map(x=>[x,x]);
      for(let i=0;legacy && i<2;i++)settings.push(optionSelect('有效阶段 '+(i+1),opts.stages[i],valid,v=>{
        const stages=[...opts.stages];stages[i]=v;update({stages});
      }));
    }
    if(specialty.id==='quench')settings.push(optionSelect('表面工艺倾向',opts.inclination,
      [['cold','冷相'],['heat','热相'],['oxide','氧化']],v=>update({inclination:v})));
    if(legacy && specialty.id==='composite'){
      settings.push(optionSelect('基础标签',opts.tag,
        [['precision','精密'],['stable','稳态'],['flow','流动'],['layer','层叠'],
          ['edge','刃线'],['heat','热相'],['cold','冷相'],['oxide','氧化']],v=>update({tag:v})));
      settings.push(optionSelect('追求层数',String(opts.tier),
        [['2','2 层'],['4','4 层'],['6','6 层']],v=>update({tier:Number(v)})));
    }
    body.appendChild(el('section',{class:'card stack','aria-label':'专精配置'},[
      el('b',{text:'已装备 '+(view.equipped?.name||'专精')+' · Lv.'+specialty.level}),
      el('p',{class:'muted tiny',text:!legacy ? bonusDescriptions[id] : '本局效果：'+(specialty.id==='edge'?'第二次描线 ×'+specialty.boost:
        ['precise','quench','composite','overload'].includes(specialty.id)
          ?'条件匹配额外 '+Math.round(specialty.boost*100)+'% 权重':
            '第十一锤起额外相对减险 '+Math.round(specialty.boost*100)+'%')}),
      ...settings,
      el('small',{class:'muted',text:'专精随新炉次锁定。'}),
    ]));
  }
  body.appendChild(el('div',{class:'card ws-bonus-summary'},[
    el('b',{text:view.equipped?`已装备 · ${view.equipped.name}`:'本次未装备加成'}),
    el('p',{text:'已开始的炉次沿用开局加成。'}),
    el('button',{class:'btn btn--primary btn--block',text:canResumeForge()?'继续当前锻造':'开始锻刀',onclick:enterForge}),
  ]));
  body.appendChild(el('details',{class:'codex-group'},[
    el('summary',{text:'已解锁内容'}),
    el('div',{class:'ws-unlocks'},[
      legacy && el('div',{class:'report-line',text:`永久解锁卡牌 ${(state.unlockedCardIds||[]).length} 张`}),
      el('div',{class:'report-line',text:`称号 ${(state.unlockedTitles||[]).join('、')||'暂未获得'}`}),
      legacy && el('div',{class:'report-line',text:`刃线外观 ${(state.unlockedEdgeSkins||[]).join('、')||'暂未获得'}`}),
    ]),
  ]));
}

/* ── 图鉴（rework T12）──────────────────────────────── */
/**
 * 图鉴：按**统一目录**展示全部 10 个分类。
 *
 * ★ 改造前只展示刀型 / 隐藏连携 / 工艺标签 三类，
 *   而分母却把材料、纹理、工艺、卡牌、特性、赛事全算进去 ——
 *   玩家既看不到它们，也永远开不满进度。
 *
 * ★ 现在每个分类都有真实分母，未发现给**线索**（不直接给答案），
 *   已发现给实际条件/效果/来源。
 */
function renderCodex() {
  const state = Core.progress.get();
  const view = CodexCatalog.codexProgressView(state.codex);

  body.appendChild(el('div', { class: 'card' }, [
    el('div', { class: 'row row--between' }, [
      el('span', { text: '图鉴完成度' }),
      el('b', { text: `${view.percent}%` }),
    ]),
    el('div', { class: 'bar', style: { marginTop: '8px' } }, [el('i', { style: { width: view.percent + '%' } })]),
    el('div', { class: 'muted tiny', style: { marginTop: '6px' },
      text: `已发现 ${view.found} / ${view.total} 项 · 断刀记录单独保存` }),
  ]));

  /* ★ rework T12：搜索 + 「只看未发现」。
     搜索只匹配**已发现**的名称/描述；未发现项只按线索匹配，
     不会因为搜索而泄露答案（未发现项名字仍为「???」）。 */
  const searchInput = el('input', {
    class: 'codex-search', type: 'search',
    placeholder: '搜索已发现内容 / 线索',
    'aria-label': '搜索图鉴',
    value: codexQuery,
    oninput: (e) => { codexQuery = e.target.value; clearSearch.hidden = !codexQuery && !codexOnlyMissing; renderCodexList(); },
  });
  const clearSearch=el('button',{class:'chip codex-clear',type:'button','aria-label':'清除搜索与筛选',title:'清除搜索与筛选',hidden:!codexQuery&&!codexOnlyMissing,onclick:()=>{codexQuery='';codexOnlyMissing=false;render();body.querySelector('.codex-search')?.focus();}},[icon('close')]);
  body.appendChild(el('div', { class: 'ws-collection-controls' }, [
    searchInput,
    el('div', { class: 'ws-control-row', role: 'group', 'aria-label': '筛选' }, [
      el('button', {
        class: 'chip' + (codexOnlyMissing ? ' chip--accent' : ''), type: 'button',
        'aria-pressed': String(codexOnlyMissing), text: '只看未发现',
        onclick: () => { codexOnlyMissing = !codexOnlyMissing; render(); },
      }),
      clearSearch,
    ].filter(Boolean)),
  ]));

  /* 目录容器：搜索时局部重绘，不重建输入框（保持光标与输入焦点） */
  const listHost = el('div', { class: 'codex-host' });
  body.appendChild(listHost);

  function renderCodexList() {
    clear(listHost);
    const q = codexQuery.trim().toLowerCase();
    let shownGroups = 0;
    for (const group of view.groups) {
      let entries = group.entries;
      if (codexOnlyMissing) entries = entries.filter((e) => !e.found);
      if (q) {
        entries = entries.filter((e) => {
          const hay = [e.name || '', e.desc || '', e.hint || '', e.group || '', group.name]
            .join(' ').toLowerCase();
          return hay.includes(q);
        });
      }
      if ((q || codexOnlyMissing) && !entries.length) continue;
      shownGroups++;

      const ratio = group.total ? `${group.found}/${group.total}` : `${group.found} 条`;
      const summary = el('summary', {}, [
        el('b', { text: group.name }),
        el('span', { class: 'muted tiny', text: ` ${ratio}` }),
      ]);
      const list = el('div', { class: 'codex-list' }, entries.length
        ? entries.map((entry) => el('div', { class: 'codex-item' + (entry.found ? '' : ' is-locked') }, [
          el('div', {}, [
            el('div', { class: 'trait-name', text: entry.found ? entry.name : '???' }),
            el('div', { class: 'trait-desc', text: entry.found
              ? (entry.desc || entry.group || '已发现')
              : entry.hint }),
          ]),
        ]))
        : [el('div', { class: 'muted tiny', text: group.eventOnly
          ? '还没有断刀记录。断裂的刀会连身份与履历一起保存在断刀册。'
          : '这一类暂无内容。' })]);
      /* 搜索/筛选时强制展开，方便直接看到结果 */
      const forceOpen = !!(q || codexOnlyMissing);
      listHost.appendChild(el('details', {
        class: 'codex-group',
        open: forceOpen || (group.found > 0 && group.total <= 30),
      }, [summary, list]));
    }
    if (!shownGroups) {
      listHost.appendChild(el('div', { class: 'card ws-empty',
        text: q ? `没有匹配「${codexQuery}」的条目。` : '没有符合条件的条目。' }));
    }
  }

  renderCodexList();
}

export default { create, render };
