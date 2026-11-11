/**
 * V4.1 economy. All amounts are based on documented actual structural
 * milestones, not on raw arcade score, knife appraisal, or rarity.
 * Call from a single save transaction; receipt IDs dedupe first-time income.
 */
export const SCHOOL_CR=Object.freeze([22,28,36,45,55]);
export const SCHOOL_XP=Object.freeze([18,24,32,40,48]);
export const SCHOOL_FIRST_CR=Object.freeze([20,30,45,65,90]);
export const SCHOOL_FIRST_XP=Object.freeze([50,75,110,160,220]);
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,Number(v)||0));
export function isV41Match(record){
 return record?.version==='formal-v4.1'||record?.result?.version==='formal-v4.1';
}
export function effectivePrimary(record){
 const cut=record?.result?.cut||record?.cut||record?.detail||{};
 return clamp(cut?.structure?.primary??record?.structure?.primary??0);
}
export function careerRewardPlan(tier,win,gradient,record,matchId,styleId=null){
 const base={cr:0,xp:0,first:[],reason:'not-v41'};
 if(!isV41Match(record) && record?.version !== 'cut-v19')return base;
 const events=[];
 if(tier==='school'){
   const i=clamp(Math.floor(gradient),0,4);
   const p=effectivePrimary(record);
   events.push({key:'match:'+matchId,cr:win?SCHOOL_CR[i]:Math.floor(SCHOOL_CR[i]*.35*p),
     xp:win?SCHOOL_XP[i]:Math.floor(SCHOOL_XP[i]*.35*p)});
   if(win)events.push({key:'first:school:'+(styleId||record?.styleId||'')+':'+i,
     cr:SCHOOL_FIRST_CR[i],xp:SCHOOL_FIRST_XP[i],first:true});
 }else if(['national','apex'].includes(tier)){
   const rounds=Array.isArray(record?.rounds)?record.rounds:[];
   for(const r of rounds){
     const idx=Number.isInteger(r.round)?r.round:rounds.indexOf(r);
     const p=clamp(r.primary??r.cut?.structure?.primary??(r.win?1:0));
     const valid= r.primaryCompleted===true||(tier==='national'&&r.win===true);
     const crBase=tier==='national'?60:85,xpBase=tier==='national'?48:70;
     events.push({key:'round:'+matchId+':'+idx,cr:valid?crBase:Math.floor(crBase*.35*p),
       xp:valid?xpBase:Math.floor(xpBase*.35*p)});
     if(valid){
       events.push({key:'first:'+tier+':round:'+idx,first:true,
         cr:tier==='national'?100:120,xp:tier==='national'?100:150});
     }
   }
   if(win){
     events.push({key:'first:'+tier+':champion',first:true,
       cr:tier==='national'?160:240,xp:tier==='national'?200:300});
   }
 }
 return {events,reason:'v4.1'};
}
