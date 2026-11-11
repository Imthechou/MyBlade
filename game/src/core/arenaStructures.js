/**
 * V4.1 authored 2.5D specimen structures.
 * Data and hit locations share a single mutable graph: there are no screen
 * overlays that fake damage or hidden branch difficulty multipliers.
 */
const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number.isFinite(n)?n:0));
export const STRUCTURE_VERSION='arena-structure-v4';
const MATERIAL_ARMOR=Object.freeze({foam:0,rope:0,wood:.16,plastic:.26,ice:.11,metal:.40});
// Each school has its own authored silhouette, physical join graph and two
// playable dismantling routes. These coordinates ARE hit-test coordinates,
// not decorative overlays. Composite preserves its established training rig.
const make=(id,name,materials,kind,layout,joins,routes,protectedAt=[.50,.53])=>Object.freeze({
 id,name,kind,protectedAt,
 parts:layout.map(([key,x,y,role],i)=>[key,materials[i],x,y,role]),
 joins,routes,
});
export const STRUCTURE_TEMPLATES=Object.freeze({
  edge:make('tension-rig','双向高张力绳索架',
    ['rope','rope','foam','wood','rope','foam'],'tension',
    [['a',.22,.29,'coupling'],['b',.78,.29,'coupling'],['c',.30,.48,'support'],['d',.70,.48,'support'],['e',.23,.71,'joint'],['f',.77,.71,'joint']],
    [['a','b'],['a','c'],['b','d'],['c','d'],['c','e'],['d','f']],
    [['a','c','e'],['b','d','f']]),
  press:make('load-bearing','木质复合承重架',
    ['wood','wood','metal','wood','plastic','wood'],'frame',
    [['a',.36,.27,'coupling'],['b',.65,.27,'coupling'],['c',.23,.51,'support'],['d',.78,.51,'support'],['e',.35,.74,'joint'],['f',.66,.74,'joint']],
    [['a','b'],['a','c'],['b','d'],['c','d'],['c','e'],['d','f'],['a','d'],['b','c'],['e','f']],
    [['a','c','e'],['b','d','f']]),
  precise:make('protected-plate','内置标牌的精切架',
    ['plastic','metal','wood','plastic','foam','rope'],'protected',
    [['a',.25,.29,'coupling'],['b',.75,.29,'coupling'],['c',.23,.50,'support'],['d',.77,.51,'support'],['e',.32,.73,'joint'],['f',.68,.73,'joint']],
    [['a','c'],['a','d'],['b','d'],['b','c'],['c','e'],['d','f'],['e','f']],
    [['a','c','e'],['b','d','f']],[.50,.51]),
  quench:make('crystal-cluster','分段冰晶连结阵',
    ['ice','ice','ice','plastic','ice','metal'],'crystal',
    [['a',.48,.25,'coupling'],['b',.21,.39,'coupling'],['c',.79,.39,'support'],['d',.32,.62,'support'],['e',.68,.62,'joint'],['f',.51,.77,'joint']],
    [['a','b'],['a','c'],['b','d'],['c','e'],['d','f'],['e','f'],['b','e']],
    [['b','d','f'],['a','c','e']],[.50,.53]),
  composite:make('composite-frame','多材料复合试刀架',
    ['metal','plastic','wood','wood','rope','ice'],'frame',
    [['a',.27,.30,'coupling'],['b',.73,.30,'coupling'],['c',.33,.51,'support'],['d',.67,.51,'support'],['e',.38,.73,'joint'],['f',.62,.73,'joint']],
    [['a','b'],['a','c'],['b','d'],['c','d'],['c','e'],['d','f'],['e','f']],
    [['a','c','e'],['b','d','f']],[.50,.53]),
  overload:make('alloy-frame','高负载合金锁扣架',
    ['metal','metal','wood','plastic','metal','rope'],'alloy',
    [['a',.23,.32,'coupling'],['b',.77,.32,'coupling'],['c',.39,.49,'support'],['d',.65,.51,'support'],['e',.24,.73,'joint'],['f',.78,.73,'joint']],
    [['a','c'],['b','d'],['c','d'],['c','e'],['d','f'],['a','e'],['b','f'],['e','f']],
    [['a','c','e'],['b','d','f']],[.50,.77]),
});
const id=key=>'struct-'+key;
export function createStructure(seed=1,styleId='composite',gradient=0){
 const spec=STRUCTURE_TEMPLATES[styleId]||STRUCTURE_TEMPLATES.composite;
 const tier=clamp(Math.floor(Number(gradient)||0),0,4);
 // Low rank teaches two distinct routes. High ranks preserve materials but
 // require deeper, observable connector disassembly rather than hidden HP x2.
 const parts=spec.parts.map(([key,type,x,y,role],i)=>({
   id:id(key),key,type,role,x,y,baseX:x,baseY:y,
   slot:i%3,row:Math.floor(i/3),layout:'structure',
   alive:true,progress:0,cuts:[],lastAngle:null,
   createdAt:0,difficulty:1,armorLeft:MATERIAL_ARMOR[type],
   layer:0,variation:0,weakX:0,weakY:0,attached:true,
   // Protectors are physical connectors: open them first for more efficient
   // cutting; a very strong knife can instead force the direct route.
   // Apprentice teaches free access; higher tiers reveal guards first.
   coveredBy:tier>=1&&key==='c'?'a':tier>=1&&key==='d'?'b':
     tier>=2&&key==='e'?'c':tier>=2&&key==='f'?'d':null,
 }));
 const protective=['precise','composite','overload'].includes(styleId)||tier>=2;
 if(protective)parts.push({
   id:id('p'),key:'p',type:'plastic',role:'protected',isProtected:true,
   x:spec.protectedAt[0],y:spec.protectedAt[1],baseX:spec.protectedAt[0],baseY:spec.protectedAt[1],slot:1,row:1,layout:'structure',
   alive:true,progress:0,cuts:[],lastAngle:null,createdAt:0,
   difficulty:1,armorLeft:.2,layer:0,variation:0,weakX:0,weakY:0,
 });
 // Master requires a visible cross-brace dismantle. Legendary also
 // requires a central support, not more invisible HP. Both preserve routes.
 const routes=spec.routes.map((path,index)=>{
   const keys=[...path];
   // Crystal school has a different left/right ordering; derive the
   // reinforcements from the *other* authored route, never duplicate a node.
   const alternative=spec.routes[1-index].filter(key=>!keys.includes(key));
   if(tier>=3)keys.push(alternative.at(-1));
   if(tier>=4)keys.push(alternative.at(-2));
   return [...new Set(keys)].map(id);
 });
 const extra=tier>=3?[['c','f'],['d','e']]:[];
 if(tier>=4)extra.push(['a','d'],['b','c']);
 const joined=[...spec.joins,...extra];
 const seen=new Set();
 const joins=joined.filter(pair=>{
   const key=[...pair].sort().join(':');
   if(seen.has(key))return false;
   seen.add(key);return true;
 }).map(pair=>pair.map(id));
 return {
   version:STRUCTURE_VERSION,id:spec.id,name:spec.name,kind:spec.kind,styleId,
   seed,gradient:tier,parts,routes,joins,
   protectedId:protective?id('p'):null,
   completedIds:[],failedJoins:[],routeComplete:null,
   primary:0,quality:0,completed:false,score:0,
   partialCuts:0,perfectCuts:0,cleanCuts:0,
 };
}
export function updateStructure(structure,targets){
 if(!structure)return null;
 const parts=targets||structure.parts,byId=new Map(parts.map(t=>[t.id,t]));
 const done=new Set(parts.filter(p=>!p.alive||p.progress>=1).map(p=>p.id));
 structure.completedIds=[...done];
 structure.failedJoins=structure.joins.filter(([a,b])=>done.has(a)||done.has(b));
 const normalized=structure.routes.map(route=>route.reduce((n,key)=>
   n+clamp(byId.get(key)?.progress??(done.has(key)?1:0)),0)/route.length);
 structure.primary=Math.max(0,...normalized);
 const winning=structure.routes.findIndex(route=>route.every(k=>done.has(k)));
 if(winning>=0){structure.completed=true;structure.routeComplete=winning;}
 // Once the coupling breaks, real anchor points drift to their resting
 // position. Logic and canvas reuse those coordinates, keeping touch aligned.
 const a=done.has(id('a')),b=done.has(id('b'));
 for(const part of parts){
   if(part.isProtected)continue;
   const left=['c','e'].includes(part.key),right=['d','f'].includes(part.key);
   const offset = left && a ? -.018 : right && b ? .018 : 0;
   const drop = part.key==='e' && done.has(id('c')) ? .027 :
      part.key==='f' && done.has(id('d')) ? .027 : 0;
   part.x=part.baseX+offset;part.y=part.baseY+drop;
 }
 const damaged=parts.find(p=>p.isProtected);
 const safe=damaged?1-clamp(damaged.progress):1;
 const cuts=parts.filter(p=>!p.isProtected).flatMap(p=>p.cuts||[]);
 const quality=cuts.length?cuts.reduce((n,c)=>n+(c.quality==='PERFECT'?1:c.quality==='CLEAN'?.65:.25),0)/cuts.length:0;
 structure.partialCuts=cuts.length;
 structure.perfectCuts=cuts.filter(c=>c.quality==='PERFECT').length;
 structure.cleanCuts=cuts.filter(c=>c.quality==='CLEAN').length;
 // Technique is earned by actual contacts, not by a pristine sign at t=0.
 structure.quality=structure.completed?clamp(safe*.55+quality*.45):0;
 return structure;
}
export function structureScore(structure,elapsed,limit,health,maxHealth){
 if(!structure)return 0;
 const p=clamp(structure.primary),q=clamp(structure.quality);
 const excellent=Math.min(limit*.65,Math.max(14,18+structure.gradient*5));
 const t=clamp((limit-elapsed)/Math.max(1,limit-excellent));
 const h=clamp(health/Math.max(1,maxHealth));
 return Math.round(700*p+200*q+p*(50*t+50*h));
}
export function structureSnapshot(s){
 if(!s)return null;
 return {version:s.version,id:s.id,name:s.name,styleId:s.styleId,
   completed:s.completed,routeComplete:s.routeComplete,
   primary:s.primary,quality:s.quality,protectedId:s.protectedId,
   protectedDamage:s.parts.find(p=>p.isProtected)?.progress||0,
   perfectCuts:s.perfectCuts,partialCuts:s.partialCuts,
   completedIds:[...s.completedIds],failedJoins:s.failedJoins.map(x=>[...x])};
}
