/**
 * Generated WebP atlas loader for the arena.
 * 6 columns x 5 rows, 256px cells. One HTTP request, lazy decoded.
 * Rendering is completely optional: arenaStage falls back to proven Canvas art
 * if sprites cannot be loaded, and never blocks pointer input / the game timer.
 */
export const TYPES=Object.freeze(['foam','rope','wood','plastic','ice','metal']);
export const STATES=Object.freeze(['whole','top','bottom','chips','flash']);
export const CELL=256;
const url=new URL('../../assets/arena/targets.webp?v=2',import.meta.url).href;
let image=null;
let status='idle';
let error=null;
let loading=null;
const fractures=new Map();
const FRACTURE_LIMIT=12; // 12 pairs x 2 x 256^2 RGBA = at most 6 MiB.
let fractureBuilds=0;

export function spriteStatus() { return {status,error,url,width:image?.naturalWidth||0,height:image?.naturalHeight||0,
  fractures:fractures.size,fractureBuilds,fractureLimit:FRACTURE_LIMIT}; }
export function prepareArenaSprites() {
  if(status==='ready')return Promise.resolve(true);
  if(status==='failed')return Promise.resolve(false);
  if(loading)return loading;
  if(typeof Image==='undefined'){status='unavailable';return Promise.resolve(false);}
  status='loading';
  const candidate=new Image();
  candidate.decoding='async';
  loading=new Promise(resolve=>{
    candidate.onload=()=>{
      if(candidate.naturalWidth!==CELL*6||candidate.naturalHeight!==CELL*5) {
        status='failed';error='atlas-size-mismatch';resolve(false);return;
      }
      image=candidate;status='ready';resolve(true);
    };
    candidate.onerror=()=>{status='failed';error='asset-unavailable';resolve(false);};
    candidate.src=url;
  });
  return loading;
}
export function spriteReady() {
  if(status==='idle')void prepareArenaSprites();
  return status==='ready'&&!!image;
}
function cell(ctx,type,row,x,y,w,h) {
  if(!spriteReady())return false;
  const index=TYPES.indexOf(type);
  if(index<0 || !Number.isFinite(w) || !Number.isFinite(h))return false;
  ctx.drawImage(image,index*CELL,row*CELL,CELL,CELL,x,y,w,h);
  return true;
}
/** Whole intact prop, aligned with existing target's physical collision center. */
export function drawWholeSprite(ctx,type,x,y,bodyW,bodyH) {
  return cell(ctx,type,0,x-bodyW*.75,y-bodyH*.665,bodyW*1.5,bodyH*1.33);
}
/** One of two transparent, pre-fractured pieces, still centered on original mass. */
export function drawSplitSprite(ctx,type,side,bodyW,bodyH,angle=0) {
  if(!spriteReady())return false;
  const pair=fracturePair(type,angle);
  if(!pair)return cell(ctx,type,side<0?1:2,-bodyW*.75,-bodyH*.665,bodyW*1.5,bodyH*1.33);
  ctx.drawImage(pair[side<0?0:1],-bodyW*.75,-bodyH*.665,bodyW*1.5,bodyH*1.33);
  return true;
}

const CUT_FACE={foam:['#a9d5c4','#4b827e'],rope:['#e5c78c','#96713e'],
  wood:['#e9be81','#aa7541'],plastic:['#def0ed','#7eabb7'],
  ice:['#efffff','#80cfe0'],metal:['#eef5f5','#879fae']};
function fracturePair(type,angle) {
  const index=TYPES.indexOf(type);if(index<0)return null;
  const turn=Math.PI/90;
  const bucket=Math.round((((Number(angle)||0)%(Math.PI*2))+Math.PI*2)%(Math.PI*2)/turn);
  const key=type+':'+bucket;
  if(fractures.has(key)){
    const hit=fractures.get(key);fractures.delete(key);fractures.set(key,hit);return hit;
  }
  const a=bucket*turn;
  const pair=[];
  for(const side of [-1,1]){
    const canvas=typeof OffscreenCanvas==='function'?new OffscreenCanvas(CELL,CELL)
      :typeof document!=='undefined'?Object.assign(document.createElement('canvas'),{width:CELL,height:CELL}):null;
    const c=canvas?.getContext('2d');if(!c)return null;
    c.translate(CELL/2,CELL/2);c.rotate(a);
    c.beginPath();c.moveTo(-CELL,0);c.lineTo(CELL,0);
    c.lineTo(CELL,CELL*side);c.lineTo(-CELL,CELL*side);c.closePath();c.clip();
    c.rotate(-a);
    c.drawImage(image,index*CELL,0,CELL,CELL,-CELL/2,-CELL/2,CELL,CELL);
    // Source-atop keeps every exposed face inside the prop's alpha silhouette.
    c.globalCompositeOperation='source-atop';c.rotate(a);
    const depth=type==='rope'?13:type==='wood'?11:type==='metal'?7:9;
    const colors=CUT_FACE[type]||CUT_FACE.wood;
    const g=c.createLinearGradient(0,0,0,depth*side);
    g.addColorStop(0,colors[0]);g.addColorStop(.30,colors[0]);g.addColorStop(1,colors[1]);
    c.fillStyle=g;c.fillRect(-CELL,side<0?-depth:0,CELL*2,depth);
    c.lineWidth=.8;c.strokeStyle=type==='metal'?'rgba(255,255,255,.48)':'rgba(76,51,27,.24)';
    if(type==='wood'){
      for(let r=15;r<115;r+=15){c.beginPath();c.ellipse(-13,side*5,r,3.2,0,0,Math.PI*2);c.stroke();}
    }else{
      for(let x=-114;x<115;x+=type==='rope'?5:9){
        c.beginPath();c.moveTo(x,side*1.5);c.lineTo(x+(type==='metal'?5:2),side*(depth-1));c.stroke();
        if(type==='foam'){c.fillStyle='rgba(26,79,77,.25)';c.beginPath();c.arc(x,side*5,1.1,0,Math.PI*2);c.fill();}
      }
    }
    pair.push(canvas);
  }
  fractureBuilds++;fractures.set(key,pair);
  while(fractures.size>FRACTURE_LIMIT)fractures.delete(fractures.keys().next().value);
  return pair;
}
/** 4 unique fragment glyphs per material, each a 128x128 atlas sub-cell. */
export function drawShardSprite(ctx,type,variant,x,y,size,rotation=0) {
  if(!spriteReady())return false;
  const index=TYPES.indexOf(type);
  if(index<0)return false;
  const sub=((variant%4)+4)%4;
  ctx.save();
  ctx.translate(x,y);ctx.rotate(rotation);
  ctx.drawImage(image,index*CELL+(sub%2)*CELL/2,3*CELL+Math.floor(sub/2)*CELL/2,
    CELL/2,CELL/2,-size/2,-size/2,size,size);
  ctx.restore();
  return true;
}
/** Material-specific generated flare: ice blue, wood chips, metal sparks, foam fragments... */
export function drawFlashSprite(ctx,type,x,y,size,alpha=1,angle=0) {
  if(!spriteReady())return false;
  ctx.save();
  ctx.globalAlpha*=Math.max(0,Math.min(1,alpha));
  ctx.translate(x,y);ctx.rotate(angle);
  const ok=cell(ctx,type,4,-size/2,-size/2,size,size);
  ctx.restore();
  return ok;
}

if(typeof window!=='undefined') {
  window.__FORGE_SPRITES={status:spriteStatus,preload:prepareArenaSprites};
}
