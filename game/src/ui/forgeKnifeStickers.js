/**
 * S4 knife cards: 12 editorial, hand-drawn silhouette families.
 * A shape is selected by actual forge form (visual.assetRef) rather than the
 * generic words "glow", "knife" or the random card seed. 12 base + 12 variants
 * share silhouette identity but use independent glow-ink ornaments.
 * Only tiny SVG path data; no models, images, filters or new GPU programs.
 */
const NS='http://www.w3.org/2000/svg';
const NAMES={
  balisong:'蝴蝶刀',bayonet:'刺刀',folding:'折叠刀',gladius:'罗马短剑',
  karambit:'爪子刀',kris:'马来剑',machete:'开山刀',saber:'弯刀',
  skull:'骷髅匕首',straight:'直刀',survival:'生存刀',tangdao:'唐刀',
};
const FORMS=Object.keys(NAMES);
const aliases=[
  ['balisong',/蝴蝶/],['bayonet',/刺刀/],['folding',/折|折刀/],
  ['gladius',/罗马|短剑/],['karambit',/爪/],['kris',/马来/],
  ['machete',/开山/],['saber',/弯刀/],['skull',/骷髅/],
  ['straight',/直刀/],['survival',/生存/],['tangdao',/唐刀/],
];
export function knifeFormOf(card){
  if(card?.stage!=='S4') return null;
  const ref=String(card?.visual?.assetRef||'').toLowerCase();
  if(FORMS.includes(ref)) return ref;
  const name=String(card?.name||'');
  return aliases.find(([,regex])=>regex.test(name))?.[0]||null;
}
export function isKnifeGlow(card){
  return /流光|辉光|微光/.test(card?.name||'')
    || /effect\(glow\)/.test(String(card?.visual?.write?.knifeType||''));
}
function element(g,tag,a={}){
  const node=document.createElementNS(NS,tag);
  for(const [key,value] of Object.entries(a))node.setAttribute(key,String(value));
  g.appendChild(node);return node;
}
function line(g,d,color,width=2.5){
  return element(g,'path',{d,fill:'none',stroke:color,'stroke-width':width,
    'stroke-linecap':'round','stroke-linejoin':'round'});
}
function fill(g,d,color,ink,width=2.4){
  return element(g,'path',{d,fill:color,stroke:ink,'stroke-width':width,'stroke-linejoin':'round'});
}
function dot(g,x,y,r,color){element(g,'circle',{cx:x,cy:y,r,fill:color});}
const SHAPES={
  balisong:{
    blade:'M66 28 L104 21 Q120 19 144 32 L104 39 L66 35Z',
    seam:'M72 31 L129 31',
    grip:'M18 23 L62 26 L67 31 L63 34 L19 33Z M18 38 L63 37 L67 32 L61 33 L18 48Z',
    spine:'M23 26 L52 28 M23 43 L52 40',
    accent:'M30 30 L49 30 M30 42 L49 40',
  },
  bayonet:{
    blade:'M58 29 L132 24 L149 31 L132 38 L58 35Z',
    seam:'M69 32 L139 31',
    grip:'M10 27 L57 27 L63 29 L63 35 L10 35 Q5 31 10 27Z',
    spine:'M58 23 L60 39 M14 31 L46 31',
    accent:'M137 25 L145 31 L137 37',
  },
  folding:{
    blade:'M61 29 Q96 14 141 21 Q137 38 103 41 L60 35Z',
    seam:'M73 31 Q106 24 132 23',
    grip:'M16 27 Q26 23 57 28 Q66 32 62 38 Q34 45 17 37Z',
    spine:'M22 33 Q40 27 55 33',
    accent:'M58 31 L67 29',
  },
  gladius:{
    blade:'M61 30 Q93 10 115 17 L147 31 L115 45 Q93 52 61 34Z',
    seam:'M69 32 L142 31',
    grip:'M15 27 L48 27 L48 36 L15 36Z M5 28 L14 28 L14 36 L5 36Z',
    spine:'M51 17 L59 17 L61 46 L51 46Z',
    accent:'M100 20 L111 31 L100 41',
  },
  karambit:{
    blade:'M65 27 Q92 8 145 14 Q135 43 100 48 Q124 32 118 23 Q88 29 65 40Z',
    seam:'M75 31 Q109 16 135 17',
    grip:'M22 26 Q40 25 62 30 L65 38 Q45 43 25 39Z',
    spine:'M18 23 A13 13 0 1 0 18 50 A13 13 0 1 0 18 23Z',
    accent:'M12 35 A7 7 0 1 0 12 36',
  },
  kris:{
    blade:'M63 28 Q77 15 88 24 Q99 9 111 22 Q124 11 148 31 Q125 50 112 38 Q99 53 88 39 Q77 48 63 36Z',
    seam:'M71 31 Q82 25 92 31 Q104 24 114 31 L141 31',
    grip:'M16 27 L58 27 L62 37 L17 37Z',
    spine:'M57 19 L62 43',
    accent:'M29 29 L48 35',
  },
  machete:{
    blade:'M57 27 L88 24 Q111 18 140 12 L150 40 Q134 53 103 43 L57 37Z',
    seam:'M66 33 L117 32 L142 26',
    grip:'M9 29 L57 28 L63 38 L10 39Z',
    spine:'M20 28 L28 40 M39 28 L45 40',
    accent:'M132 20 L144 37',
  },
  saber:{
    blade:'M57 25 Q95 4 145 12 Q127 44 79 46 L56 36 Q109 40 145 12 Q88 26 57 25Z',
    seam:'M67 28 Q102 18 128 17',
    grip:'M12 26 L53 28 L58 37 L15 36Z',
    spine:'M55 19 Q68 36 52 46 M17 32 L47 32',
    accent:'M121 17 Q132 16 143 13',
  },
  skull:{
    blade:'M65 29 L115 17 L148 31 L115 45 L65 35Z',
    seam:'M77 31 L143 31',
    grip:'M16 26 L52 27 L65 30 L65 36 L51 37 L16 36Z',
    spine:'M20 14 A13 11 0 1 1 19 14Z M17 36 L17 46 M25 36 L25 46',
    accent:'M13 25 L16 25 M26 25 L29 25',
  },
  straight:{
    blade:'M58 26 L120 19 L148 19 L148 34 L134 41 L58 37Z',
    seam:'M66 31 L136 32',
    grip:'M13 27 L56 27 L62 32 L57 38 L15 38Z',
    spine:'M57 22 L57 43 M22 29 L50 35',
    accent:'M134 20 L134 40',
  },
  survival:{
    blade:'M59 25 L68 22 L73 16 L81 23 L88 16 L96 23 L104 17 L116 21 L147 28 L127 43 L59 38Z',
    seam:'M69 31 L129 31',
    grip:'M10 28 L56 26 L63 37 L10 39Z',
    spine:'M20 28 L23 39 M31 27 L34 39 M42 27 L45 38',
    accent:'M118 22 L139 28',
  },
  tangdao:{
    blade:'M60 26 Q105 20 151 15 L138 29 Q114 39 60 35Z',
    seam:'M68 29 Q109 26 140 19',
    grip:'M15 27 L56 28 L62 34 L14 35Z',
    spine:'M54 20 L61 21 L64 40 L57 40Z M16 24 L10 19 M18 39 L12 47',
    accent:'M19 29 L48 30',
  },
};
export const KNIFE_FORM_COUNT=FORMS.length;

export function paintS4Knife(svg,spec,card){
  const id=knifeFormOf(card);
  if(!id)return false;
  const p=spec.palette,glowing=isKnifeGlow(card),shape=SHAPES[id];
  svg.setAttribute('data-knife-form',id);
  svg.setAttribute('data-knife-glow',String(glowing));
  // Flat editorial paper + hand-drawn registration; same visual grammar as S1-S9.
  element(svg,'rect',{width:160,height:64,fill:p.paper,opacity:'.26'});
  fill(svg,'M5 10 Q38 2 77 14 Q113 0 158 14 L156 50 Q119 63 80 50 Q43 64 7 49Z',p.field,'none',0).setAttribute('opacity','.62');
  const group=element(svg,'g',{transform:'translate(0 -1)'});
  if(glowing){
    // Variant-only energy traces follow the actual knife contour, not generic stars.
    line(group,'M65 17 Q109 6 149 9',p.pop,4.6);
    line(group,'M72 47 Q121 52 148 37',p.main,3.4);
    dot(group,150,10,3,p.main);
  }
  fill(group,shape.blade,p.main,p.ink,2.7);
  line(group,shape.seam,p.paper,2.6);
  // Ink edge and functional grip are always distinct color blocks.
  fill(group,shape.grip,p.ink,p.ink,2);
  line(group,shape.spine,p.pop,3.4);
  line(group,shape.accent,p.paper,1.7);
  // Geometry-specific end marks (same system, varied tiny runes).
  if(id==='karambit'){
    element(group,'circle',{cx:18,cy:36,r:7,fill:p.paper,stroke:p.pop,'stroke-width':2.1});
  }else if(id==='skull'){
    dot(group,17,23,2,p.paper);dot(group,27,23,2,p.paper);
    line(group,'M20 30 L25 30',p.pop,2.1);
  }else if(id==='balisong'){
    dot(group,60,30,2.5,p.paper);dot(group,60,40,2.5,p.paper);
  }else if(id==='gladius'){
    line(group,'M50 18 L50 46',p.pop,3.5);
  }else if(id==='kris'){
    line(group,'M88 25 L92 34 L103 28',p.pop,2.1);
  }else if(id==='machete'){
    line(group,'M138 20 L144 37',p.pop,2.2);
  }else if(id==='tangdao'){
    line(group,'M14 39 Q4 46 8 55',p.pop,2);
  }
  // Keep the selected knife legible at 110px card width: few, large marks.
  line(svg,'M10 10 l6 -3 M147 51 l5 3',p.ink,1.6);
  if(glowing)line(svg,'M35 8 l8 -4 M146 48 l7 -5',p.pop,2);
  return true;
}
