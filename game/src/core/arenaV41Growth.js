/**
 * V4.1 permanent workshop growth. Only affects a new forge run; it does not
 * change a collectible blade, card admission, or the underlying PBR recipe.
 */
export const XP_THRESHOLDS = Object.freeze([0,80,220,450,800,1250,1850,2600,3500,4600]);
export const WORKSHOP_TIERS = Object.freeze([
  {level:1,discount:0,riskReduction:0,rarity:'none'},
  {level:2,discount:.05,riskReduction:0,rarity:'none'},
  {level:3,discount:.05,riskReduction:0,rarity:'A'},
  {level:4,discount:.05,riskReduction:.04,rarity:'A'},
  {level:5,discount:.10,riskReduction:.04,rarity:'A'},
  {level:6,discount:.10,riskReduction:.04,rarity:'B'},
  {level:7,discount:.10,riskReduction:.08,rarity:'B'},
  {level:8,discount:.15,riskReduction:.08,rarity:'B'},
  {level:9,discount:.15,riskReduction:.08,rarity:'C'},
  {level:10,discount:.15,riskReduction:.10,rarity:'C'},
].map(x=>Object.freeze(x)));
const RARITY_BASE=Object.freeze({common:100,fine:62,rare:30,epic:14,legend:6,mythic:2});
const RARITY_WEIGHT=Object.freeze({
  none:{common:100,fine:62,rare:30,epic:14,legend:6,mythic:2},
  A:{common:100,fine:62,rare:31.5,epic:15.4,legend:6.9,mythic:2.4},
  B:{common:100,fine:62,rare:33,epic:16.8,legend:7.8,mythic:2.8},
  C:{common:100,fine:62,rare:34.5,epic:18.2,legend:8.7,mythic:3.2},
});
const count=v=>Number.isFinite(Number(v))?Math.max(0,Math.floor(Number(v))):0;
export function workshopLevel(xp=0) {
  const n=count(xp);
  for(let i=XP_THRESHOLDS.length-1;i>=0;i--)if(n>=XP_THRESHOLDS[i])return i+1;
  return 1;
}
export function workshopSnapshot(save) {
  const xp=count(save?.workshopV41?.xp);
  const data=WORKSHOP_TIERS[workshopLevel(xp)-1];
  return {...data,xp, nextXp:XP_THRESHOLDS[data.level]??null};
}
export function makeWorkshopV41() {
  return {version:1,xp:0,receipts:{}};
}
export function normalizeWorkshopV41(raw) {
  return {version:1,xp:count(raw?.xp),receipts:raw?.receipts&&typeof raw.receipts==='object'&&!Array.isArray(raw.receipts)?{...raw.receipts}:{}};
}
/** Same event may be opened/replayed more than once; only the first credit counts. */
export function awardWorkshopXp(save,points,receipt) {
  if(!save || !receipt || typeof receipt!=='string')return {credited:0,level:workshopLevel(save?.workshopV41?.xp)};
  save.workshopV41=normalizeWorkshopV41(save.workshopV41);
  if(save.workshopV41.receipts[receipt])return {credited:0,level:workshopLevel(save.workshopV41.xp),duplicate:true};
  const credited=count(points);
  if(!credited)return {credited:0,level:workshopLevel(save.workshopV41.xp)};
  const fromLevel=workshopLevel(save.workshopV41.xp);
  save.workshopV41.xp+=credited;
  save.workshopV41.receipts[receipt]=credited;
  return {credited,level:workshopLevel(save.workshopV41.xp),leveled:workshopLevel(save.workshopV41.xp)>fromLevel};
}
export function rarityMultiplier(workshop,rarity) {
  const tier=RARITY_WEIGHT[workshop?.rarity]||RARITY_WEIGHT.none;
  return (tier[rarity]||1)/(RARITY_BASE[rarity]||1);
}
export function discountedRerollCost(cost,workshop) {
  const value=Math.max(0,Math.ceil(Number(cost)||0));
  return value===0?0:Math.max(1,Math.ceil(value*(1-(workshop?.discount||0))));
}
export function effectiveRiskScale(workshop,specialistReduction=0,challengeScale=1) {
  const a=Math.max(0,Math.min(.20,workshop?.riskReduction||0));
  const b=Math.max(0,Math.min(.20,specialistReduction||0));
  const reduced=Math.min(.20,1-(1-a)*(1-b));
  return (Number.isFinite(challengeScale)?Math.max(0,challengeScale):1)*(1-reduced);
}

/**
 * One-time verified legacy migration. XP is backfilled for known persisted
 * forge count and actual school victories; an absent record grants nothing.
 * CR is not retroactively minted. Already-cleared milestones are marked so
 * replaying a new V4.1 cup cannot falsely claim its "first" milestone.
 */
export function migrateVerifiedLegacyGrowth(growth,legacy) {
  const out=normalizeWorkshopV41(growth);
  if(out.migration?.applied)return out;
  const source=legacy&&typeof legacy==='object'?legacy:{};
  const forge=Math.min(500,Math.max(0,Math.floor(Number(source.stats?.forgeCount)||0)));
  let recovered=forge*10;
  const receipts={...out.receipts};
  const school=source.arena?.school||{};
  const verified=[];
  for(const [style,info] of Object.entries(school)){
    const cleared=Array.isArray(info?.cleared)?info.cleared:[];
    for(const grade of new Set(cleared)){
      if(!Number.isInteger(grade)||grade<0||grade>4)continue;
      const key='first:school:'+style+':'+grade;
      if(receipts[key])continue;
      const value=[50,75,110,160,220][grade];
      recovered+=value;receipts[key]=value;verified.push(key);
    }
  }
  const history=Array.isArray(source.arena?.history)?source.arena.history:[];
  if(history.some(entry=>entry?.tier==='national'&&
     (entry?.result?.champion===true||entry?.champion===true))){
    receipts['first:national:champion'] ||= 200;
    recovered+=200;
    verified.push('first:national:champion');
  }
  if(history.some(entry=>entry?.tier==='apex'&&entry?.result?.win===true)){
    receipts['first:apex:champion'] ||= 300;
    recovered+=300;
    verified.push('first:apex:champion');
  }
  return {...out,xp:out.xp+recovered,receipts,
    migration:{applied:true,version:1,forgeCount:forge,verifiedMilestones:verified,backfilledXp:recovered}};
}
