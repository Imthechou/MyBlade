/**
 * V4.1 forge specialties. Unlocks follow verified school milestones; each
 * forge snapshots one equipped specialty and its options before S1.
 */
import { BY_STAGE } from '../data/cards.js';
import { BASE_TAGS } from '../data/tags.js';
export const SPECIALTIES=Object.freeze([
  {id:'press',bonusId:'specialty_press',branch:'press',name:'锻压·稳锤',benefits:[.05,.08,.12],kind:'hammer-risk'},
  {id:'edge',bonusId:'specialty_edge',branch:'edge',name:'锋刃·精研',benefits:[1.08,1.10,1.12],kind:'edge-second'},
  {id:'precise',bonusId:'specialty_precise',branch:'precise',name:'精密·定向',benefits:[.10,.15,.20],kind:'stat-card'},
  {id:'quench',bonusId:'specialty_quench',branch:'quench',name:'淬彩·调色',benefits:[.15,.25,.35],kind:'finish-card'},
  {id:'composite',bonusId:'specialty_composite',branch:'composite',name:'复合·共鸣',benefits:[.15,.25,.30],kind:'tag-card'},
  {id:'overload',bonusId:'specialty_overload',branch:'overload',name:'过载·豪赌',benefits:[.10,.20,.30],kind:'risk-rarity'},
]);
export const BY_BONUS=Object.freeze(Object.fromEntries(SPECIALTIES.map(x=>[x.bonusId,x])));
const TAGS=new Set(BASE_TAGS.map(t=>t.id));
const attrs=new Set(['strength','toughness','sharpness','craft','design','spirit']);
const phases=new Set(['S1','S2','S3','S4','S5','S6','S7','S8','S9']);
const safe=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:{};
/** Level 1, 2 and 3 correspond to wins at 能手, 专家 and 传奇. */
export function specialtyLevel(save,id) {
  const spec=BY_BONUS[id]||SPECIALTIES.find(s=>s.id===id);
  if(!spec)return 0;
  const cleared=new Set(Array.isArray(save?.arena?.school?.[spec.branch]?.cleared)?
    save.arena.school[spec.branch].cleared:[]);
  return [1,2,4].filter(x=>cleared.has(x)).length;
}
export function validStatStages(stat) {
  if(!attrs.has(stat))return [];
  return [...phases].filter(stage=>((BY_STAGE[stage]||[]).some(c=>Number(c.statDelta?.[stat])>0)));
}
export function normalizeSpecialtyOptions(id,options={}) {
  const spec=BY_BONUS[id];const o=safe(options);
  if(spec?.id==='precise'){
    const stat=attrs.has(o.stat)?o.stat:'craft';
    const viable=validStatStages(stat);
    const stages=[...new Set((Array.isArray(o.stages)?o.stages:[]).filter(s=>viable.includes(s)))].slice(0,2);
    for(const stage of viable)if(stages.length<2&&!stages.includes(stage))stages.push(stage);
    return {stat,stages};
  }
  if(spec?.id==='quench')return {inclination:['cold','heat','oxide'].includes(o.inclination)?o.inclination:'cold'};
  if(spec?.id==='composite')return {tag:TAGS.has(o.tag)?o.tag:'precision',tier:[2,4,6].includes(o.tier)?o.tier:4};
  return {};
}
export function specialtySnapshot(save,bonusId) {
  const spec=BY_BONUS[bonusId];if(!spec)return null;
  const level=specialtyLevel(save,bonusId);if(level<1)return null;
  return {id:spec.id,bonusId,level,kind:spec.kind,boost:spec.benefits[level-1],
    options:normalizeSpecialtyOptions(bonusId,save?.forgeBonus?.specialtyOptions?.[bonusId]),
    remaining:spec.id==='composite'?level:0,ready:false,triggered:false,consumed:false};
}
export function matchSpecialtyCard(run,card) {
  const sp=run?.specialist;if(!sp||!card)return false;
  const stage=run.stageId;
  if(sp.id==='precise')return sp.options.stages.includes(stage)
    && Number(card.statDelta?.[sp.options.stat])>0;
  if(sp.id==='quench')return ['S5','S6'].includes(stage)
    && (card.tags||[]).includes(sp.options.inclination);
  if(sp.id==='composite') {
    if(!phases.has(stage)||Number(stage.slice(1))<5||sp.remaining<=0)return false;
    const owned=(run.ledger?.entries||[])
      .filter(e=>(e.tags||[]).includes(sp.options.tag)).length;
    if(owned===0||owned>=sp.options.tier)return false;
    return (card.tags||[]).includes(sp.options.tag);
  }
  return false;
}
/** Only consume a one-roll benefit after actually generating eligible choices. */
export function activeRollSpecialty(run,bag) {
  const sp=run?.specialist;
  if(!sp)return {boost:0,rarityBoost:0,active:false};
  if(['precise','quench','composite'].includes(sp.id)) {
    const any=(bag||[]).some(card=>matchSpecialtyCard(run,card));
    const all=(bag||[]).length>0&&(bag||[]).every(card=>matchSpecialtyCard(run,card));
    return {boost:any&&!all?sp.boost:0,rarityBoost:0,active:any&&!all,
      consume:sp.id==='composite'};
  }
  if(sp.id==='overload'&&sp.ready&&!sp.consumed)
    return {boost:0,rarityBoost:sp.boost,active:true,consume:true};
  return {boost:0,rarityBoost:0,active:false};
}
export function noteSafeRisk(run,finalChance) {
  const sp=run?.specialist;
  if(sp?.id!=='overload'||sp.triggered||sp.consumed||!(finalChance>=.1))return false;
  sp.triggered=true;sp.ready=true;return true;
}
export const specialtyTierExplanation=(id,level)=> {
  const spec=BY_BONUS[id];return spec&&level>=1?spec.name+' Lv.'+level:'';
};
