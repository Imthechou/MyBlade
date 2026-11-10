/**
 * Forge card artwork — a small, deterministic "doodle sticker" language.
 *
 * Every card's illustration is derived from its NAME (primary and secondary
 * motifs) and stable id (layout/accent). No images, random, textures, shaders
 * or WebGL allocations. Only SVG vector shapes; the in-game model is untouched.
 *
 * Each motif uses the same hand-drawn rounded strokes and flat 3-color palette.
 */
import { knifeFormOf, paintS4Knife } from './forgeKnifeStickers.js';
const NS = 'http://www.w3.org/2000/svg';
// Ordered by position in a card's name; secondary matched semantics form a
// small supporting glyph. This is not an arbitrary palette swap by rarity.
const rules = Object.freeze([
  { id:'electric', re:/电|雷|闪|离子/g },
  { id:'void', re:/暗|影|玄|黑|静|夜|噬|蚀|灰|雾/g },
  { id:'echo', re:/共鸣|回响|灵|震|谐|振/g },
  { id:'star', re:/星|月|天|日|曜|辉|极光|光/g },
  { id:'frost', re:/冷|冰|寒|雪|霜|冻|零|蓝/g },
  { id:'flame', re:/热|焰|火|赤|灼|熔|炉|温/g },
  { id:'flow', re:/流|波|液|水|虹|彩|渐|染|云|幕/g },
  { id:'shard', re:/晶|玉|矿|钛|金|银|钢|铁|铜|砂|瓷|石/g },
  { id:'fracture', re:/断|裂|碎|残|破|战痕|错/g },
  { id:'weave', re:/层|叠|丝|织|纹|格|线|缠|密/g },
  { id:'mirror', re:/镜|净|面|白|亮|抛|透|偏|哑/g },
  { id:'strike', re:/锤|压|击|受力|冲|疾|速|快/g },
  { id:'edge', re:/刃|锋|刀|剑|脊|尖|刻|切|磨/g },
  { id:'grid', re:/六边|构|控|定|匀|准|轴|工|机|模块|制|衡/g },
  { id:'organic', re:/木|竹|皮|翡|琥珀|柔|兽|爪|蝶|胶|节/g },
]);
/**
 * Narrative colour direction, in priority order. The name is authoritative:
 * a crimson alloy must not become lime green just because its ID hash changes.
 * These are studio screen-print palettes, not physically shaded metal textures.
 */
const themes=Object.freeze([
  {key:'spectrum',match:/虹|幻彩|流光|彩|极光|偏振/,paper:'#F7F4FF',field:'#E8D8FF',main:'#7860E9',pop:'#FF9A73',ink:'#303054',label:'幻彩'},
  {key:'electric',match:/电|雷|等离子|电浆/,paper:'#F1F8FF',field:'#D5E8FF',main:'#5C70F8',pop:'#50D5E9',ink:'#26315B',label:'电光'},
  {key:'crimson',match:/赤|红|灼|焰|玄火|火|血/,paper:'#FFF7EF',field:'#FFE0C6',main:'#EC634E',pop:'#FFB654',ink:'#46304A',label:'赤焰'},
  {key:'violet',match:/紫|错相|紫晶/,paper:'#FAF5FF',field:'#E8D8FF',main:'#9362DA',pop:'#E89BD5',ink:'#342B58',label:'幽紫'},
  {key:'cobalt',match:/蓝|寒|冰|冷|冻|零|雪|霜|液氮/,paper:'#F4F9FF',field:'#CEE9FF',main:'#4D8FDE',pop:'#88DBEB',ink:'#243A5B',label:'霜蓝'},
  {key:'gold',match:/曙|金|辉|日|天工/,paper:'#FFFAF0',field:'#FFE8B9',main:'#DFA044',pop:'#F7CE6D',ink:'#44374B',label:'鎏金'},
  {key:'verdant',match:/翡|翠|绿|青|玉|苔/,paper:'#F2FCF6',field:'#CFF0DB',main:'#3BAE87',pop:'#ADD96E',ink:'#254B4A',label:'翡翠'},
  {key:'obsidian',match:/玄|噬|暗|蚀|夜|黑|影|幽|雾/,paper:'#F5F5FC',field:'#DCDDF5',main:'#6575AB',pop:'#AB97D5',ink:'#27334A',label:'深蚀'},
  {key:'pearl',match:/白|珠|镜|银|瓷|净|透|素面/,paper:'#F6FCFD',field:'#DCECF3',main:'#6BAEBB',pop:'#A6CADB',ink:'#34516B',label:'珠光'},
  {key:'timber',match:/木|竹|皮|琥珀|温|暖/,paper:'#FFF9EF',field:'#F8DFBF',main:'#C88F62',pop:'#DBB474',ink:'#59403F',label:'温木'},
  {key:'celestial',match:/星|月|神|灵|共鸣|天坠|陨/,paper:'#F6F6FF',field:'#DADCF7',main:'#777CE6',pop:'#F6C57E',ink:'#293458',label:'星辉'},
  {key:'forge',match:/熔|炉|热|锤|回火|淬/,paper:'#FFF8F3',field:'#F7D6C5',main:'#D77E5B',pop:'#F4BE7F',ink:'#513B4B',label:'熔火'},
  {key:'stream',match:/流|波|液|云|水|渐染|雾界/,paper:'#F2FCFC',field:'#D1F2EF',main:'#34ABAF',pop:'#92D7D2',ink:'#284B5C',label:'潮汐'},
  {key:'lattice',match:/晶|格|层|丝|纹|碳|织|铁|钢|刃|锋|刀|剑/,paper:'#F6F8FD',field:'#DAE2F6',main:'#778AB9',pop:'#E7B77A',ink:'#34405B',label:'锻纹'},
  {key:'balance',match:/.*/,paper:'#F8F7FF',field:'#E8E2FA',main:'#9B87CB',pop:'#E5BA8D',ink:'#3E3A5C',label:'工艺'},
]);
function paletteFor(name){
  const rule=themes.find(t=>t.match.test(name))||themes.at(-1);
  // Blended dual-colour phrasing gets a deliberately paired secondary pigment.
  const pop=/蓝紫|紫蓝/.test(name)?'#AC85EB'
    :/赤金|金赤/.test(name)?'#F4CB74'
    :/冷辉|冰光/.test(name)?'#C5DAFB'
    :rule.pop;
  return {theme:rule.key,palette:{paper:rule.paper,field:rule.field,main:rule.main,pop,ink:rule.ink},label:rule.label};
}
const motions=Object.freeze([
  {id:'scatter',re:/星屑|星尘|碎|砂|颗粒|微|屑|点/,label:'星屑散落'},
  {id:'fractured',re:/裂|断|残|错|破|战|剥/,label:'裂片冲突'},
  {id:'orbit',re:/星|月|天|神|灵|虹|幻|辉/,label:'环绕轨迹'},
  {id:'ribbon',re:/流|波|液|云|顺|渐|彩|熔/,label:'流线回旋'},
  {id:'crystal',re:/晶|格|矿|钛|石|玉|瓷|金|铁/,label:'晶面折线'},
  {id:'mirror',re:/镜|净|抛|光|白|亮|透|偏/,label:'对映亮斑'},
  {id:'stitch',re:/纹|丝|层|叠|织|编|线|缠/,label:'交错针脚'},
  {id:'slash',re:/刃|锋|刀|剑|磨|切|尖|脊/,label:'斜刃速线'},
  {id:'spark',re:/焰|火|电|雷|热|锤|冲|震/,label:'能量飞溅'},
  {id:'root',re:/木|竹|皮|翠|翡|生|柔/,label:'生长曲线'},
  {id:'stable',re:/匀|稳|控|定|校|准|衡|均/,label:'校准刻度'},
]);
function motionFor(name,primary,seed){
  const matches=motions.map((m,i)=>({m,i,hit:m.re.exec(name)}))
    .filter(x=>x.hit)
    .sort((a,b)=>a.hit.index-b.hit.index || b.hit[0].length-a.hit[0].length || a.i-b.i);
  const match=matches[0]?.m;
  // If a name has no secondary modifier, main glyph semantics still guide ink.
  const fallback={frost:'crystal',flame:'spark',flow:'ribbon',shard:'crystal',
    star:'orbit',void:'orbit',echo:'orbit',electric:'spark',fracture:'fractured',
    weave:'stitch',mirror:'mirror',strike:'spark',edge:'slash',grid:'stable',organic:'root'};
  return match || motions.find(m=>m.id===(fallback[primary]||'stable'))||motions[seed%motions.length];
}

const tagFallback = Object.freeze({
  cold:'frost',heat:'flame',flow:'flow',layer:'weave',edge:'edge',
  oxide:'mirror',precision:'grid',stable:'grid',mirror:'mirror',
  void:'void',spectral:'star',resonance:'echo',impact:'strike'
});
const hash = value => {
  let h=2166136261;
  for(const ch of String(value)) { h=Math.imul(h ^ ch.codePointAt(0),16777619); }
  return h >>> 0;
};

export function doodleSpec(card) {
  const name=String(card?.name || '');
  const key=String(card?.id || '')+'|'+name;
  const seed=hash(key);
  const hits=[];
  for(const [i,r] of rules.entries()){
    r.re.lastIndex=0;
    for(const m of name.matchAll(r.re)) hits.push({id:r.id,at:m.index,length:m[0].length,i});
  }
  hits.sort((a,b)=>a.at-b.at || b.length-a.length || a.i-b.i);
  const ordered=[...new Set(hits.map(h=>h.id))];
  const fromTag=(card?.tags || []).map(t=>tagFallback[t]).find(Boolean);
  const primary=ordered[0] || fromTag || 'grid';
  const secondary=ordered.find(id=>id!==primary) || fromTag && fromTag!==primary && fromTag
    || rules[(seed>>>9)%rules.length].id;
  // Deterministic by name/id: two identical names in different stages do not
  // accidentally clone one entire sticker; all 218 card IDs stay distinct.
  const knifeType=knifeFormOf(card);
  // S4 begins with the knife silhouette, not a generic "knife" semantic.
  // Glow-name variants retain their named light treatment (虹/辉/微光).
  const knifeBaseTheme={
    balisong:'verdant',bayonet:'cobalt',folding:'timber',gladius:'gold',
    karambit:'crimson',kris:'violet',machete:'forge',saber:'stream',
    skull:'obsidian',straight:'lattice',survival:'verdant',tangdao:'cobalt',
  }[knifeType];
  const defaultTheme=paletteFor(name);
  const base=knifeBaseTheme && !/流光|辉光|微光/.test(name)
    ? themes.find(t=>t.key===knifeBaseTheme) : null;
  const theme=base ? {theme:base.key,palette:{
    paper:base.paper,field:base.field,main:base.main,pop:base.pop,ink:base.ink
  },label:base.label} : defaultTheme;
  const motion=motionFor(name,primary,seed);
  return {
    primary,secondary,seed,palette:theme.palette,theme:theme.theme,colorName:theme.label,
    motion:motion.id,motionName:motion.label,
    tilt:(seed%23)-11,
    offset:(seed>>>15)%13-6,
    variant:(seed>>>22)%7,
    signature:primary+'-'+secondary+'-'+seed.toString(36),
  };
}

function e(parent,tag,attrs={}) {
  const node=document.createElementNS(NS,tag);
  for(const [k,v] of Object.entries(attrs)) node.setAttribute(k,String(v));
  parent.appendChild(node);
  return node;
}
const path=(g,d,props={})=>e(g,'path',{d,...props});
const stroke=(g,d,color,width=3)=>path(g,d,{fill:'none',stroke:color,'stroke-width':width,'stroke-linecap':'round','stroke-linejoin':'round'});
const poly=(g,points,fill,ink,width=2.4)=>e(g,'polygon',{points,fill,stroke:ink,'stroke-width':width,'stroke-linejoin':'round'});
const dot=(g,x,y,r,fill)=>e(g,'circle',{cx:x,cy:y,r,fill});
const oval=(g,x,y,rx,ry,fill,ink,width=2.5)=>e(g,'ellipse',{cx:x,cy:y,rx,ry,fill,stroke:ink,'stroke-width':width});

/** All glyphs are drawn around (0,0), sized ~46 square, in a single visual alphabet. */
function motif(g,id,p,v) {
  const ink=p.ink,fill=p.main,pop=p.pop,field=p.field;
  switch(id) {
    case 'frost':
      poly(g,'0,-24 8,-10 23,-3 10,7 1,23 -8,9 -24,1 -10,-8',field,ink);
      stroke(g,'M0 -19 L0 19 M-19 0 L19 0 M-13 -13 L13 13 M13 -13 L-13 13',pop,3);
      dot(g,0,0,4,fill);break;
    case 'flame':
      path(g,'M-13 21 C-29 4 -8 -6 -8 -23 C2 -18 5 -9 5 -5 C13 -16 16 -18 16 -22 C28 -1 25 11 12 21 Q0 29 -13 21Z',{fill,stroke:ink,'stroke-width':3,'stroke-linejoin':'round'});
      path(g,'M-4 20 Q-12 11 -1 1 Q4 8 10 4 Q15 19 6 21Z',{fill:field});
      stroke(g,'M-18 -20 l-4 -6 M21 14 l7 4',ink,2.2);break;
    case 'flow':
      stroke(g,'M-27 -12 C-8 -29 -6 7 14 -11 Q22 -17 27 -10',ink,5.3);
      stroke(g,'M-26 3 C-10 -13 -5 21 14 1 Q22 -4 27 2',fill,5.5);
      stroke(g,'M-26 17 C-13 2 -6 31 10 16 Q18 9 27 16',pop,4.5);
      dot(g,7,-17,3.7,fill);break;
    case 'shard':
      poly(g,'-24 -5 -4 -24 21 -16 26 10 6 24 -18 16',field,ink);
      poly(g,'-4 -24 7 -4 6 24 -9 10',fill,ink,2.1);
      stroke(g,'M-24 -5 L7 -4 L21 -16 M7 -4 L26 10 M-18 16 L-9 10',ink,2);
      dot(g,20,-19,3.8,pop);break;
    case 'star':
      poly(g,'0,-27 7,-9 25,-18 16,0 27,10 8,10 1,27 -7,12 -25,17 -15,0 -25,-14 -7,-10',pop,ink,3);
      stroke(g,'M0 -12 L0 12 M-13 0 L13 0',fill,3);
      dot(g,23,21,3,ink);break;
    case 'void':
      oval(g,0,0,24,24,ink,ink,1);
      path(g,'M10 -20 Q-16 -13 -13 6 Q-11 22 11 19 Q-1 28 -16 17 Q-29 0 -16 -16 Q-3 -29 10 -20Z',{fill:field});
      poly(g,'18 -20 21 -13 28 -10 21 -7 18 0 15 -7 8 -10 15 -13',pop,ink,1.3);break;
    case 'echo':
      dot(g,0,0,8,fill);
      stroke(g,'M-11 -12 Q-24 0 -11 12 M11 -12 Q24 0 11 12',ink,4.3);
      stroke(g,'M-21 -22 Q-41 0 -21 22 M21 -22 Q41 0 21 22',pop,4.6);
      dot(g,0,0,3,field);break;
    case 'electric':
      poly(g,'3 -28 -23 3 -4 3 -12 27 23 -8 5 -8 14 -27',pop,ink,3);
      stroke(g,'M-23 -17 l-8 -4 M23 14 l9 2',fill,3);break;
    case 'fracture':
      poly(g,'-23 -19 4 -25 -5 -5 -20 1',pop,ink);
      poly(g,'11 -21 26 -3 5 3',fill,ink);
      poly(g,'-18 10 -4 2 3 24 -17 21',field,ink);
      poly(g,'10 10 27 9 20 24 6 24',fill,ink);
      stroke(g,'M-8 -27 l2 -7 M7 27 l3 6',ink,2);break;
    case 'weave':
      for(let i=-1;i<=1;i++) stroke(g,'M'+(-24+i*10)+' -24 Q'+(5+i*9)+' -6 '+(-22+i*11)+' 23',i===0?pop:ink,4.5);
      for(let j=-1;j<=1;j++) stroke(g,'M-26 '+(j*12-1)+' Q0 '+(j*12+14)+' 26 '+(j*12-1),j===0?fill:field,4.2);
      break;
    case 'mirror':
      oval(g,0,0,26,19,field,ink,3.5);
      oval(g,0,0,11,18,pop,ink,2.5);
      oval(g,0,0,4,8,fill,ink,1.8);
      stroke(g,'M-22 -24 l-4 -5 M21 22 l5 4',ink,2);break;
    case 'strike':
      poly(g,'-25 -5 -12 -11 -15 -25 -1 -14 13 -26 12 -10 27 -4 15 7 23 22 4 17 -7 27 -11 12 -27 11 -17 1',fill,ink,3);
      stroke(g,'M-4 -7 L6 7 M5 -8 L-6 7',field,3.7);break;
    case 'edge':
      path(g,'M-23 15 Q-1 -13 23 -24 Q16 3 -7 22Z',{fill:field,stroke:ink,'stroke-width':3,'stroke-linejoin':'round'});
      stroke(g,'M-15 10 Q5 -10 20 -21',pop,4.2);
      stroke(g,'M-26 -13 l-8 -4 M19 14 l8 5',fill,3);break;
    case 'grid':
      poly(g,'-20 -20 20 -20 27 18 -13 25 -26 -6',field,ink);
      for(let i=-1;i<=1;i++) stroke(g,'M'+(i*11)+' -17 L'+(i*11+4)+' 21',i===0?pop:ink,2.5);
      for(let j=-1;j<=1;j++) stroke(g,'M-20 '+(j*11)+' L23 '+(j*11-4),j===0?fill:ink,2.2);
      break;
    case 'organic':
      stroke(g,'M-20 23 Q-10 -13 18 -24',ink,4.1);
      path(g,'M-4 -7 Q-28 -32 -29 -6 Q-23 8 -4 -7Z',{fill,stroke:ink,'stroke-width':2.5});
      path(g,'M7 -16 Q29 -24 25 1 Q16 8 7 -16Z',{fill:field,stroke:ink,'stroke-width':2.5});
      path(g,'M-10 8 Q-28 1 -26 22 Q-15 25 -10 8Z',{fill:pop,stroke:ink,'stroke-width':2.5});
      break;
    default:
      oval(g,0,0,22,20,fill,ink);
  }
  // A second, restrained pen-stroke ties families together. Its position
  // varies but never obscure the main glyph.
  if(v%3===0) stroke(g,'M-25 27 Q-9 31 4 27',ink,1.7);
}

/**
 * Name-derived line treatment. These are not generic sparkles: a cracked
 * mineral gets splintering hatch-marks, liquid gets sweeping ink, a blade gets
 * an oblique cut, and calibrated work gets technical registration ticks.
 * All marks live outside the central glyph, at readable mobile-card scale.
 */
function addNameMarks(svg,s,p) {
  const g=e(svg,'g',{'aria-hidden':'true'});
  const thin=(d,c=p.ink,w=2.3)=>stroke(g,d,c,w);
  const x=s.offset/2;
  switch(s.motion){
    case 'scatter':
      [[14,13,3],[29,37,2.4],[36,10,2],[112,12,2.5],[142,48,3.2],[153,22,1.7]]
        .forEach(([cx,cy,r],i)=>dot(g,cx+x,cy,r,i%2?p.main:p.pop));
      thin('M22 45 l7 -7 M134 10 l8 -5',p.ink,1.8);break;
    case 'fractured':
      thin('M6 18 l20 -8 -5 12 18 -6 M124 45 l9 -16 12 8 9 -13',p.ink,2.8);
      poly(g,'27,36 40,30 34,50',p.pop,p.ink,1.3);
      thin('M140 57 l9 -7',p.main,3);break;
    case 'orbit':
      thin('M10 39 C18 5 45 2 55 4 M105 55 C133 56 148 43 152 20',p.pop,3.1);
      dot(g,14+x,14,2.8,p.main);dot(g,145-x,20,2.2,p.ink);
      thin('M119 13 l5 -7 M124 20 l8 -1',p.ink,1.7);break;
    case 'ribbon':
      thin('M-4 48 C21 27 25 49 48 28',p.pop,4);
      thin('M105 18 C126 -6 132 18 164 2',p.main,4.4);
      thin('M133 53 Q145 43 160 49',p.ink,1.8);break;
    case 'crystal':
      poly(g,'9,19 21,4 33,20 23,34',p.field,p.ink,1.8);
      thin('M21 4 l2 30 M9 19 l24 1 M134 6 l14 18 -16 5',p.pop,2.5);
      dot(g,149,42,3,p.main);break;
    case 'mirror':
      thin('M8 11 l22 0 M9 17 l14 0 M124 49 l28 0 M136 44 l17 0',p.ink,1.9);
      poly(g,'27,8 32,1 35,8 43,12 35,15 31,23 28,15 19,11',p.pop,p.ink,1.3);
      dot(g,129,12,3,p.main);break;
    case 'stitch':
      for(let i=0;i<4;i++){
        thin('M'+(9+i*7)+' 6 l5 8',i%2?p.main:p.ink,2);
        thin('M'+(123+i*7)+' 47 l-4 9',i%2?p.pop:p.ink,2);
      }
      thin('M8 23 Q25 32 44 25 M115 39 Q139 32 156 39',p.pop,2.5);break;
    case 'slash':
      thin('M6 56 L43 3',p.ink,3.6);
      thin('M15 54 L45 14 M110 56 L152 12',p.pop,2.8);
      thin('M122 55 l7 -3',p.main,3);break;
    case 'spark':
      thin('M17 2 l9 9 M5 26 l11 3 M39 4 l-2 11',p.ink,2.3);
      poly(g,'139,4 133,20 146,20 137,38 158,16 146,15 152,2',p.pop,p.ink,1.8);
      dot(g,22,50,3,p.main);break;
    case 'root':
      thin('M11 56 Q2 28 31 16 Q43 9 47 3',p.ink,2.9);
      path(g,'M16 37 Q4 16 4 11 Q24 16 24 27Z',{fill:p.pop,stroke:p.ink,'stroke-width':1.7});
      path(g,'M119 41 Q133 22 153 29 Q145 44 119 41Z',{fill:p.field,stroke:p.ink,'stroke-width':1.7});
      break;
    case 'stable':
    default:
      thin('M15 9 V21 M8 15 H22 M137 43 V56 M130 50 H144',p.ink,2.4);
      thin('M24 6 H44 M117 58 H136',p.pop,3);
      dot(g,150,15,2.5,p.main);break;
  }
  // Stable variations of pen structure — never random frame-to-frame effects.
  if(s.variant%2===0) thin('M'+(17+s.variant)+' 57 q9 -5 15 -1',p.pop,1.6);
  if(s.variant%3===1) dot(g,149,54,2.4,p.main);
}

/**
 * Compose one 160×64 editorial sticker; no external graphic assets.
 * On narrow cards this remains recognisable as one bold glyph + one mini glyph.
 */
export function cardDoodle(card) {
  const s=doodleSpec(card),p=s.palette;
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('viewBox','0 0 160 64');
  svg.setAttribute('preserveAspectRatio','xMidYMid slice');
  svg.setAttribute('class','dcard-doodle');
  svg.setAttribute('aria-hidden','true');
  svg.setAttribute('focusable','false');
  // S4 gets genuinely distinct drawn knife geometry (12 forms × base/glow),
  // while S1-S3/S5-S9 keep the established semantic doodle family.
  if(paintS4Knife(svg,s,card)) {
    // Unlike abstract decals, a knife's complete point + handle must fit
    // even in 110px phone cards. Don't crop them with xMidYMid slice.
    svg.setAttribute('preserveAspectRatio','none');
    return svg;
  }
  // A translucent color wash lets the surrounding glass card remain visible.
  e(svg,'rect',{x:0,y:0,width:160,height:64,fill:p.paper,opacity:'.26'});
  const brush=s.motion==='ribbon'
    ? 'M-5 25 Q30 -20 70 15 T165 8 L166 37 Q107 57 64 37 Q20 13 -5 55Z'
    : s.motion==='fractured'
      ? 'M-5 14 L35 0 52 24 84 1 112 30 167 12 167 47 115 55 74 39 31 62 -5 38Z'
      : s.motion==='orbit'
        ? 'M-5 42 Q20 -4 77 1 T166 28 L166 50 Q116 62 71 44 Q23 18 -5 63Z'
        : s.variant%2===0
          ? 'M-6 10 Q34 -13 72 10 Q95 22 167 -7 L167 31 Q115 18 80 48 Q35 74 -6 43Z'
          : 'M-5 37 Q28 2 78 11 T166 15 L166 46 Q104 63 64 47 Q23 39 -5 68Z';
  path(svg,brush,{fill:p.field,opacity:'.57'});
  addNameMarks(svg,s,p);
  // Decal backing: hand-cut capsule shape, flat screen-print look.
  const x=59+s.offset+(s.motion==='slash'?5:s.motion==='orbit'?-3:0);
  const back=e(svg,'g',{transform:'translate('+x+' 33) rotate('+s.tilt+')'});
  const halo=s.motion==='crystal'
    ? 'M-29 -7 L-8 -27 25 -19 32 13 8 29 -28 17Z'
    : s.motion==='fractured'
      ? 'M-28 -24 L0 -16 23 -28 31 3 15 28 -26 17Z'
      : 'M-30 -17 Q-19 -31 6 -25 Q31 -23 33 -5 Q37 13 13 27 Q-14 33 -30 13 Q-37 -5 -30 -17Z';
  path(back,halo,{fill:p.main,opacity:'.16'});
  const scale=s.motion==='slash'?'.87':s.motion==='stitch'?'.75':'.82';
  const main=e(svg,'g',{transform:'translate('+x+' 32) rotate('+s.tilt+') scale('+scale+')'});
  motif(main,s.primary,p,s.variant);
  const smallX=s.motion==='fractured'?126:s.motion==='ribbon'?131:123;
  const mini=e(svg,'g',{transform:'translate('+(smallX-s.offset/2)+' '+(31+(s.variant%3-1)*3)+') rotate('+(-s.tilt*1.3)+') scale(.44)'});
  // Mini glyph has its own hue hierarchy while sharing the same motif grammar.
  motif(mini,s.secondary,{...p,main:p.pop,pop:p.main},s.variant+2);
  // Small hand-drawn noise marks: intentional and cheap, not random particles.
  const marks=e(svg,'g',{stroke:p.ink,'stroke-width':2.3,'stroke-linecap':'round',fill:'none'});
  stroke(marks,'M'+(10+s.variant)+' 16 l6 -4 M'+(18+s.variant)+' 11 l2 -6',p.ink,2);
  stroke(marks,'M143 49 l5 3 M144 55 l-2 4',p.ink,1.8);
  dot(svg,17+s.variant*2,49,2.1,p.pop);
  dot(svg,151,13+s.variant,2.7,p.main);
  return svg;
}
