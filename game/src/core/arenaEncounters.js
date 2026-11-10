/** 45 秒出场计划：赛级与流派仅改变阵型、材料配比和自然投放节奏。
 * quota 是节奏预算；击破补位可超过预算，材料本体始终固定。
 */
export const MATERIAL_ORDER = Object.freeze(['foam','rope','wood','plastic','ice','metal']);
export const PHASES = Object.freeze(['warmup','route','speed','finale']);
export const PHASE_DURATION = Object.freeze({warmup:8,route:15,speed:7,finale:15});
const clamp = (x,lo,hi) => Math.min(hi,Math.max(lo,x));
const LEVEL = Object.freeze({
  school: Object.freeze([
    {caps:[2,3,3,4],counts:[6,12,6,12],min:0,limit:3},
    {caps:[2,3,4,5],counts:[6,13,7,13],min:0,limit:3},
    {caps:[3,4,5,6],counts:[7,14,7,14],min:0,limit:4},
    {caps:[3,5,5,6],counts:[8,15,8,15],min:0,limit:4},
    {caps:[4,5,6,6],counts:[8,16,9,16],min:0,limit:5},
  ]),
  national: Object.freeze([
    {caps:[4,5,6,6],counts:[8,17,9,18],min:1,limit:5},
    {caps:[4,5,6,6],counts:[8,18,9,19],min:1,limit:5},
    {caps:[4,5,6,6],counts:[9,19,10,20],min:1,limit:5},
    {caps:[4,6,6,6],counts:[9,20,11,21],min:1,limit:6},
    {caps:[5,6,6,6],counts:[10,21,11,22],min:2,limit:6},
  ]),
  apex: Object.freeze([
    {caps:[5,6,6,6],counts:[10,22,12,23],min:2,limit:6},
    {caps:[5,6,6,6],counts:[11,23,12,24],min:2,limit:6},
    {caps:[6,6,6,6],counts:[11,24,13,25],min:3,limit:6},
  ]),
});
export function createEncounter({tier='school',gradient=0,round=0,styleId='composite',styleIds=null}={}) {
  const event = LEVEL[tier] ? tier : 'school';
  const step = clamp(event==='school'?gradient:round,0,LEVEL[event].length-1)|0;
  const config=LEVEL[event][step];
  const ranks={school:0,national:5,apex:10};
  const stages=Object.fromEntries(PHASES.map((phase,i)=>[phase,{
    quota:config.counts[i], poolCap:config.caps[i], duration:PHASE_DURATION[phase],
  }]));
  return {
    styleId,styleIds,tier:event,gradient:event==='school'?step:0,round:event==='school'?0:step,
    rank:ranks[event]+step,
    label: event==='school'?`流派试炼 · ${['学徒','能手','专家','大师','传奇'][step]}`
      : event==='national'?`全国赛 · ${['32强','16强','8强','半决赛','决赛'][step]}`
      : `全球巅峰赛 · 第${step+1}轮`,
    minIndex:0,maxAlive:Math.max(3,config.limit),stages,
  };
}
export function encounterPhase(run) {
  return run?.phase==='warmup'||run?.phase==='route'||run?.phase==='speed'||run?.phase==='finale'
    ? run.phase : null;
}
/** 纯配置，不读刀具属性。soft/hard 与 safe/rush 只改变材料组合，不改变单靶强度。 */
export function phaseMaterialPool(encounter, phase, routeId=null, finaleId=null) {
  const config=encounter?.stages?.[phase];
  if(!config)return [];
  const end=clamp(config.poolCap,2,6),from=0;
  let available=MATERIAL_ORDER.slice(from,end);
  if (phase==='route') {
    if(routeId==='soft') available=available.slice(0,Math.max(2,Math.ceil(available.length*.62)));
    else if(routeId==='hard') available=available.slice(Math.max(0,Math.floor(available.length*.38)));
  }
  if (phase==='finale') {
    if(finaleId==='safe') available=available.slice(0,Math.max(2,Math.ceil(available.length*.7)));
    else if(finaleId==='rush') available=available.slice(Math.max(0,Math.floor(available.length*.32)));
  }
  if(!available.includes('foam'))available.unshift('foam');
  return available;
}
/** 加权只决定“是哪一种材料”；高档更常见当前阶段解锁的高阶材料。 */
export function selectEncounterMaterial(encounter,phase,routeId,finaleId,roll) {
  const pool=phaseMaterialPool(encounter,phase,routeId,finaleId);
  if(!pool.length)return 'rope';
  const tilt=0.30+encounter.rank*.12+(phase==='speed'?.16:phase==='finale'?.28:0);
  const bias={
    press:{foam:.5,rope:.6,wood:2,plastic:2,metal:2.5},
    edge:{foam:2.5,rope:2.5,wood:1.2,metal:.6},
    precise:{foam:1.5,rope:1.2,plastic:1.7},
    quench:{ice:3,plastic:2,wood:.7},
    overload:{foam:.6,metal:2.5,ice:1.6,plastic:1.5},
  }[(encounter.styleIds?.length ? encounter.styleIds[Math.floor((PHASES.indexOf(phase))/2)] : encounter.styleId)] || {};
  const weights=pool.map(type=>(1+tilt*MATERIAL_ORDER.indexOf(type)/5)*(bias[type] || 1));
  const total=weights.reduce((a,b)=>a+b,0);
  let needle=clamp(Number(roll)||0,0,.999999)*total;
  for(let i=0;i<pool.length;i++){needle-=weights[i];if(needle<0)return pool[i];}
  return pool.at(-1);
}
export function phaseQuota(encounter,phase) {return encounter?.stages?.[phase]?.quota??Infinity;}
export function stageSpawnInterval(encounter,phase,prefill=0) {
  const stage=encounter?.stages?.[phase];
  if(!stage)return .6;
  // 首批靶具立即上场，其余均匀铺满这个阶段，不在开局几秒刷光。
  return stage.duration/Math.max(1,stage.quota-prefill);
}
