import { MATERIALS } from '../core/arenaChallenge.js';
import { impactMotion, targetPose } from './arenaImpact.js';
import { drawWholeSprite, drawSplitSprite, spriteReady } from './arenaSprites.js';
import { drawTargetHandmark } from './arenaDoodle.js';

const TAU = Math.PI * 2;
const TRAIL_LIFE = 195;
const LABEL_LIFE = 860;
const BURST_LIFE = 420;
const DEBRIS_LIFE = 720;
const MAX_COUNTS = { trail: 64, hitLabels: 14, bursts: 20, debris: 12 };
const MATERIAL_NAMES = {
  rope: '绳束', foam: '泡棉', wood: '木桩', plastic: '塑板', ice: '冰块', metal: '金属块',
};
const QUALITY_NAMES = { PERFECT: '完美', CLEAN: '利落', ANGLE: '弹刃', MISS: '未命中', CHAIN:'连锁' };
const backdropCaches = new WeakMap();
const COLORS = {
  rope: ['#d8ad64', '#83bdc0', '#c68a91', '#81a98f', '#a894bd'],
  foam: ['#7bc4a9', '#d49a86', '#82b5d0', '#d4c175', '#aa99c7'],
  wood: '#b98150', plastic: '#c6d5d9', ice: '#8bd9e9', metal: '#b8c6cc',
};
/** 材料 → 断口截面主色（碎块内侧那一条） */
const CORE_COLORS = {
  rope: 'rgba(238,214,168,.92)', foam: 'rgba(246,250,244,.85)', wood: 'rgba(238,205,150,.92)',
  plastic: 'rgba(232,245,248,.85)', ice: 'rgba(228,252,255,.95)', metal: 'rgba(255,236,196,.95)',
};

/**
 * Draws the arena only. It reads run/effects and never changes them or invokes gameplay.
 * All target/effect positions are normalized; target centers stay exactly at (t.x*w,t.y*h).
 *
 * 2026-10-23 视觉重做（只改绘制，不改判定）：
 *   · 场景：墙面拉丝面板 + 顶部聚光锥 + 三道夹具导轨 + 台沿 + 暗角；
 *           靶具被清空后夹座不消失，整排空槽给"下一波倒计时"，不再是纯黑等待；
 *   · 切割：靶具真的断成两半（沿刀口法线分离、自旋下落、断口亮边）；
 *           未断时给"深缝 + 单侧高温边 + 两端碎屑"的刀口，而不是一根亮线；
 *           刀光改成三层锥形缎带；命中点有闪光与火花；硬靶轻微震屏；
 *   · 文字：得分贴命中点上方、未命中贴边缩小，两者分道不再互相压住；连斩有居中脉冲。
 */
export function drawArenaStage(ctx, run, w, h, effects = {}) {
  if (!ctx || !run || !(w > 0) || !(h > 0)) return;
  const now = Number.isFinite(effects.now) ? effects.now : 0;
  const reduced = !!effects.reducedMotion;
  const trail = effects.trail || EMPTY;
  const labels = effects.hitLabels || EMPTY;
  const bursts = effects.bursts || EMPTY;
  const debris = effects.debris || EMPTY;

  pruneInPlace(trail, now, TRAIL_LIFE, MAX_COUNTS.trail);
  pruneInPlace(labels, now, LABEL_LIFE, MAX_COUNTS.hitLabels);
  pruneInPlace(bursts, now, BURST_LIFE, MAX_COUNTS.bursts);
  pruneInPlace(debris, now, DEBRIS_LIFE, MAX_COUNTS.debris);

  drawBackdrop(ctx, w, h, (run.targets || []).some((t) => t && t.layout === 'stream'));
  if (run.structure) drawStructureAssembly(ctx, run.structure, run.targets, w, h);
  drawGuideHeader(ctx, run.guide, w, h);

  const targets = run.targets || EMPTY;
  const shake = reduced ? null : shakeOffset(bursts, now);
  ctx.save();
  if (shake && (shake.x || shake.y)) ctx.translate(shake.x, shake.y);

  drawRoute(ctx, run, targets, w, h);
  if (!run.structure) drawEmptySlots(ctx, run, targets, now, w, h, reduced);
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    if (!t || !t.alive) continue;
    const d = MATERIALS[t.type];
    if (!d) continue;
    drawTarget(ctx, t, d, i, t.x * w, t.y * h, w, h, isGuideTarget(run.guide, t), now, bursts, reduced,
      Math.max(0,(Number(run.elapsed)||0)-(Number(t.createdAt)||0)));
    if (run.structure && t.isProtected) {
      ctx.save();
      // A protected component is a distinct recognizable object, not a
      // tinted damage target. Crosshair is deliberately absent.
      ctx.lineWidth=1.8;
      ctx.strokeStyle='#324F76';
      ctx.fillStyle='rgba(251,253,255,.94)';
      const tagX=t.x*w,tagY=t.y*h-Math.min(26,w*.06);
      ctx.beginPath();
      ctx.roundRect(tagX-25,tagY-12,50,23,6);
      ctx.fill();ctx.stroke();
      ctx.font='bold 11px system-ui';ctx.textAlign='center';
      ctx.fillStyle='#324F76';ctx.fillText('保留标牌',tagX,tagY+3);
      ctx.restore();
    }
    if(run.version==='arena-3') {
      const x=(t.x+(t.weakX||0))*w,y=(t.y+(t.weakY||0))*h;
      const marked=t.markedUntil>=run.elapsed;
      ctx.save();ctx.strokeStyle=marked?'#ffd275':'rgba(230,249,255,.72)';ctx.lineWidth=1.2;
      ctx.setLineDash([3,4]);ctx.beginPath();
      const angle=d.angle,dx=Math.cos(angle)*w*.055,dy=Math.sin(angle)*h*.055;
      ctx.moveTo(x-dx,y-dy);ctx.lineTo(x+dx,y+dy);ctx.stroke();ctx.setLineDash([]);
      ctx.fillStyle=marked?'#ffd275':'#e7fdff';ctx.beginPath();ctx.arc(x,y,marked?4:2.7,0,TAU);ctx.fill();
      if(marked){ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.fillText('悬赏',x,y-15);}
      ctx.restore();
    }
  }

  drawDebris(ctx, debris, now, w, h);
  drawTrail(ctx, trail, now, w, h, reduced);
  drawBursts(ctx, bursts, now, w, h, reduced);
  drawComboBanner(ctx, run, w, h, reduced);
  drawLabels(ctx, labels, now, w, h, reduced);
  if (effects.pointer) drawPointer(ctx, effects.pointer, w, h, reduced);
  ctx.restore();

  drawVignette(ctx, w, h);
}

const EMPTY = Object.freeze([]);

function pruneInPlace(list, now, life, limit) {
  if (!Array.isArray(list) || Object.isFrozen(list)) return;
  let write = 0;
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (item && Number.isFinite(item.at) && now - item.at <= life && now >= item.at - 100) {
      list[write++] = item;
    }
  }
  list.splice(write);
  if (list.length > limit) list.splice(0, list.length - limit);
}

/**
 * Structural stage assembled from the same data that controls hit detection.
 * Fractured links stay broken on subsequent frames; the visual effect queue can
 * expire without restoring the original structure.
 */
function drawStructureAssembly(ctx, structure, targets, w, h) {
  const byId=new Map((targets||[]).map(t=>[t.id,t]));
  const severed=new Set((structure.failedJoins||[]).map(([a,b])=>[a,b].sort().join(':')));
  const size=Math.min(w,h);
  ctx.save();
  // A grounded specimen fixture with quiet depth rather than sci-fi ornaments.
  const railTop=h*.215,railBottom=h*.875;
  const tray=ctx.createLinearGradient(0,railTop,0,railBottom);
  tray.addColorStop(0,'rgba(251,253,254,.58)');
  tray.addColorStop(.55,'rgba(223,232,240,.29)');
  tray.addColorStop(1,'rgba(188,204,214,.22)');
  ctx.fillStyle=tray;
  ctx.strokeStyle='rgba(114,137,154,.24)';
  ctx.lineWidth=1;
  roundedRect(ctx,w*.12,railTop,w*.76,railBottom-railTop,size*.06);
  ctx.fill();ctx.stroke();
  // The two routes are embodied as a physical assembly, not a UI list of HP.
  for(const [left,right] of structure.joins) {
    const a=byId.get(left),b=byId.get(right);
    if(!a||!b)continue;
    const ax=a.x*w,ay=a.y*h,bx=b.x*w,by=b.y*h;
    const broken=severed.has([left,right].sort().join(':'));
    const dx=bx-ax,dy=by-ay,len=Math.hypot(dx,dy)||1;
    const nx=-dy/len,ny=dx/len;
    ctx.lineCap='round';
    ctx.beginPath();
    if (broken) {
      // Two exposed stubs and a permanent daylight gap at the failed joint.
      for(const [u,v] of [[.12,.40],[.60,.88]]) {
        ctx.moveTo(ax+dx*u,ay+dy*u);ctx.lineTo(ax+dx*v,ay+dy*v);
      }
    } else {ctx.moveTo(ax,ay);ctx.lineTo(bx,by);}
    ctx.strokeStyle=broken?'rgba(135,147,158,.45)':'rgba(85,101,115,.36)';
    ctx.lineWidth=Math.max(7,size*.021);
    ctx.stroke();
    ctx.beginPath();
    if (broken) {for(const [u,v] of [[.12,.40],[.60,.88]]) {
      ctx.moveTo(ax+dx*u+nx*2,ay+dy*u+ny*2);ctx.lineTo(ax+dx*v+nx*2,ay+dy*v+ny*2);
    }} else {ctx.moveTo(ax+nx*2,ay+ny*2);ctx.lineTo(bx+nx*2,by+ny*2);}
    ctx.lineWidth=Math.max(1.2,size*.004);
    ctx.strokeStyle='rgba(251,254,255,.59)';ctx.stroke();
    if(broken) {
      const cx=(ax+bx)*.5,cy=(ay+by)*.5;
      ctx.strokeStyle='rgba(75,90,106,.38)';ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(cx-5*nx-3,cy-5*ny);ctx.lineTo(cx+5*nx+3,cy+5*ny);ctx.stroke();
    }
  }
  // A disconnected support shifts to its physical resting coordinate; the
  // actual collision point is identical to this rendered position.
  for(const part of targets||[]) {
    if(!part.alive||part.isProtected||!part.coveredBy)continue;
    const cover=byId.get('struct-'+part.coveredBy);
    if(!cover?.alive) {
      ctx.save();ctx.strokeStyle='rgba(83,125,141,.42)';
      ctx.setLineDash([3,4]);ctx.lineWidth=1.2;
      const x=part.x*w,y=part.y*h;
      ctx.beginPath();ctx.moveTo(x-12,y-6);ctx.lineTo(x+12,y-6);ctx.stroke();
      ctx.restore();
    }
  }
  // Permanent visible marks where a severed object used to be attached.
  for(const t of targets||[])if(!t.alive) {
    const x=t.x*w,y=t.y*h,r=Math.max(6,size*.021);
    ctx.fillStyle='rgba(79,99,114,.18)';
    ctx.strokeStyle='rgba(89,110,122,.43)';ctx.lineWidth=1.4;
    ctx.beginPath();ctx.ellipse(x,y,r*1.8,r*.65,0,0,TAU);ctx.fill();ctx.stroke();
    ctx.beginPath();ctx.moveTo(x-r*.7,y-r*.3);ctx.lineTo(x+r*.2,y+r*.35);
    ctx.moveTo(x-r*.1,y-r*.45);ctx.lineTo(x+r*.9,y+r*.15);ctx.stroke();
  }
  ctx.restore();
}

/* ══ 场景 ═══════════════════════════════════════════════ */

function drawBackdrop(ctx, w, h, stream = false) {
  let cache = backdropCaches.get(ctx);
  if (typeof OffscreenCanvas === 'function' && typeof ctx.drawImage === 'function') {
    if (!cache || cache.w !== w || cache.h !== h || cache.stream !== stream) {
      const canvas = new OffscreenCanvas(Math.ceil(w), Math.ceil(h));
      const back = canvas.getContext('2d');
      if (back) { paintBackdrop(back, w, h, stream); cache = { w, h, stream, canvas }; backdropCaches.set(ctx, cache); }
    }
    if (cache) { ctx.drawImage(cache.canvas, 0, 0, w, h); drawWorkLight(ctx, w, h); return; }
  }
  paintBackdrop(ctx, w, h, stream);
  drawWorkLight(ctx, w, h);
}

/** 缓存层：墙、拉丝、夹具导轨、台沿。每帧只画一次 drawImage。 */
/* The foreground material atlas stays intact; only its card-style setting changes. */
const SPECIMEN=Object.freeze({
  rope:{paper:'#FFF1D9',ink:'#BD8050',pop:'#F3BE76',soft:'#FFFAEF'},
  foam:{paper:'#D9F7E9',ink:'#278D7D',pop:'#76D8B9',soft:'#F2FFF9'},
  wood:{paper:'#FFE5CF',ink:'#B97556',pop:'#E6A67B',soft:'#FFF8EF'},
  plastic:{paper:'#E9E2FF',ink:'#7965BC',pop:'#B9A4F2',soft:'#FBF8FF'},
  ice:{paper:'#DBF1FF',ink:'#408FC3',pop:'#9BDDF4',soft:'#F5FCFF'},
  metal:{paper:'#E1E7F9',ink:'#596F9D',pop:'#F0B18C',soft:'#F8F9FF'},
});
function sketchStar(ctx,x,y,r,color,width=2,rotation=0){
  ctx.save();ctx.translate(x,y);ctx.rotate(rotation);
  ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();ctx.moveTo(0,-r);ctx.quadraticCurveTo(r*.19,-r*.19,r,0);
  ctx.quadraticCurveTo(r*.19,r*.19,0,r);ctx.quadraticCurveTo(-r*.19,r*.19,-r,0);
  ctx.quadraticCurveTo(-r*.19,-r*.19,0,-r);ctx.stroke();ctx.restore();
}
function sketchLoop(ctx,x,y,r,color,width=1.8){
  ctx.save();ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';
  ctx.beginPath();ctx.ellipse(x,y,r,r*.68,-.23,.15,Math.PI*1.75);ctx.stroke();
  ctx.fillStyle=color;ctx.beginPath();ctx.arc(x+r*.94,y-r*.39,Math.max(1.2,r*.07),0,TAU);
  ctx.fill();ctx.restore();
}
/** One cached pastel glass arena, with ink accents kept out of the touch area. */
function paintBackdrop(ctx,w,h,stream=false){
  const bg=ctx.createLinearGradient(0,0,w,h);
  bg.addColorStop(0,'#F7F9FC');bg.addColorStop(.47,'#F4F7FC');
  bg.addColorStop(.76,'#ECF5F6');bg.addColorStop(1,'#F2F5FB');
  ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
  ctx.save();ctx.globalAlpha=.28;
  ctx.fillStyle='#E3D2FF';ctx.beginPath();ctx.ellipse(-w*.09,h*.16,w*.36,h*.26,-.45,0,TAU);ctx.fill();
  ctx.fillStyle='#C8F2E7';ctx.beginPath();ctx.ellipse(w*1.03,h*.72,w*.36,h*.33,.24,0,TAU);ctx.fill();
  ctx.fillStyle='#FFE1D1';ctx.beginPath();ctx.ellipse(w*.1,h*.86,w*.25,h*.19,.14,0,TAU);ctx.fill();
  ctx.restore();
  const px=w*.035,py=h*.025,pw=w*.93,ph=h*.895,r=Math.min(26,w*.055);
  ctx.save();ctx.shadowColor='rgba(62,75,108,.09)';ctx.shadowBlur=24;ctx.shadowOffsetY=9;
  ctx.fillStyle='rgba(255,255,255,.76)';
  roundedRect(ctx,px,py,pw,ph,r);ctx.fill();ctx.restore();
  ctx.save();roundedRect(ctx,px,py,pw,ph,r);ctx.clip();
  const pane=ctx.createLinearGradient(0,py,0,py+ph);
  pane.addColorStop(0,'rgba(255,255,255,.91)');
  pane.addColorStop(.44,'rgba(247,249,253,.80)');
  pane.addColorStop(1,'rgba(235,245,249,.83)');
  ctx.fillStyle=pane;ctx.fillRect(px,py,pw,ph);
  for(const [sx,sw,c] of [[.11,.18,'#A88BE9'],[.40,.15,'#6DCDBE'],[.70,.18,'#E9AB8B']]){
    ctx.fillStyle=c;roundedRect(ctx,px+pw*sx,py,w*sw,5,3);ctx.fill();
  }
  ctx.fillStyle='rgba(119,105,170,.10)';
  const step=Math.max(12,w*.043);
  for(let x=px+step*.65;x<px+pw-step*.5;x+=step){
    if(x>w*.23&&x<w*.78)continue;
    for(let y=py+h*.17;y<py+ph-h*.06;y+=step){
      ctx.beginPath();ctx.arc(x,y,Math.max(.7,w*.0022),0,TAU);ctx.fill();
    }
  }
  const rows=stream?[.34,.52,.70]:[.52,.42,.62];
  rows.forEach((yy,i)=>{
    const y=h*yy-Math.min(w*.16,h*.16,62)*.85;
    ctx.strokeStyle=i===0?'rgba(143,108,207,.16)':'rgba(67,165,164,.14)';
    ctx.lineWidth=1.5;ctx.setLineDash([5,9]);ctx.beginPath();
    ctx.moveTo(px+19,y);ctx.lineTo(px+pw-19,y);ctx.stroke();ctx.setLineDash([]);
  });
  ctx.restore();
  ctx.strokeStyle='rgba(136,116,194,.33)';ctx.lineWidth=1.2;
  roundedRect(ctx,px,py,pw,ph,r);ctx.stroke();
  // Graffiti is reserved for successful feats; no permanent ornamental star cluster.




  // Open stage floor: reserve visual contrast for real material gashes and fragments.
  const benchY=h*.92,bench=ctx.createLinearGradient(0,benchY,0,h);
  bench.addColorStop(0,'rgba(255,255,255,.94)');bench.addColorStop(1,'#D7D7F0');
  ctx.fillStyle=bench;ctx.fillRect(0,benchY,w,h-benchY);
  ctx.fillStyle='#BFAAE8';ctx.fillRect(w*.035,benchY,w*.28,3);
  ctx.fillStyle='#87D9C3';ctx.fillRect(w*.325,benchY,w*.37,3);
  ctx.fillStyle='#E9B491';ctx.fillRect(w*.705,benchY,w*.26,3);
}
/** Tiny identity sticker per material, drawn outside the photo's central silhouette. */
/** Flat hand-painted safety seal, clearly unlike an ordinary hard specimen.
 * Its hitbox is still the one and only material target coordinate. */
function drawAvoidSeal(ctx,x,y,width,height,unit){
  const badgeW=Math.min(width*.88,62),badgeH=Math.max(18,unit*.255);
  const left=x-badgeW*.5,top=y-badgeH*.5;
  ctx.save();
  ctx.translate(x,y);ctx.rotate(-.09);ctx.translate(-x,-y);
  ctx.fillStyle='rgba(255,246,224,.96)';ctx.strokeStyle='#C46046';
  ctx.lineWidth=2.0;ctx.lineJoin='round';
  roundedRect(ctx,left,top,badgeW,badgeH,4);ctx.fill();ctx.stroke();
  ctx.fillStyle='#9F3D32';ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='800 '+Math.max(10,Math.min(13,unit*.16))+'px system-ui, sans-serif';
  ctx.fillText('避让 ×',x,y+.6);
  ctx.restore();
}

function drawMaterialMark(ctx,type,x,y,u,color){
  ctx.save();ctx.translate(x,y);ctx.strokeStyle=color;ctx.fillStyle=color;
  ctx.lineWidth=Math.max(1.4,u*.031);ctx.lineJoin='round';ctx.lineCap='round';
  const r=Math.max(4,u*.11);
  ctx.beginPath();
  if(type==='rope'){
    ctx.ellipse(0,0,r*.73,r*.45,-.4,0,TAU);ctx.moveTo(-r*.4,r*.62);ctx.lineTo(r*.48,-r*.62);
  }else if(type==='foam'){
    ctx.arc(-r*.35,r*.16,r*.43,0,TAU);ctx.moveTo(r*.4-r*.34,-r*.36);
    ctx.arc(r*.4,-r*.36,r*.34,0,TAU);ctx.moveTo(r*.42+r*.19,r*.45);
    ctx.arc(r*.42,r*.45,r*.19,0,TAU);
  }else if(type==='wood'){
    ctx.moveTo(-r*.5,r*.7);ctx.quadraticCurveTo(.4*r,-.25*r,r*.55,-r*.7);
    ctx.moveTo(0,0);ctx.quadraticCurveTo(-r,-r*.5,-r*.65,-r*.8);
    ctx.quadraticCurveTo(r*.08,-r*.74,0,0);
  }else if(type==='plastic'){
    ctx.moveTo(0,-r);ctx.lineTo(r,0);ctx.lineTo(0,r);ctx.lineTo(-r,0);ctx.closePath();
    ctx.moveTo(-r*.42,0);ctx.lineTo(r*.45,0);
  }else if(type==='ice'){
    for(let i=0;i<3;i++){
      const a=i*Math.PI/3;ctx.moveTo(Math.cos(a)*r,Math.sin(a)*r);
      ctx.lineTo(-Math.cos(a)*r,-Math.sin(a)*r);
    }
  }else{
    ctx.moveTo(-r*.2,-r);ctx.lineTo(r*.62,-r*.25);ctx.lineTo(0,0);
    ctx.lineTo(r*.42,r*.22);ctx.lineTo(-r*.44,r);
  }
  ctx.stroke();ctx.restore();
}
function drawSpecimenPlate(ctx,type,x,y,bw,bh,unit){
  const p=SPECIMEN[type]||SPECIMEN.metal;
  const width=bw*1.37,height=bh*1.12,left=x-width/2,top=y-height*.53;
  ctx.save();ctx.shadowColor='rgba(74,72,131,.15)';
  ctx.shadowBlur=Math.max(3,unit*.1);ctx.shadowOffsetY=2;
  const wash=ctx.createLinearGradient(left,top,left+width,top+height);
  wash.addColorStop(0,p.soft);wash.addColorStop(.48,'rgba(255,255,255,.86)');wash.addColorStop(1,p.paper);
  ctx.fillStyle=wash;roundedRect(ctx,left,top,width,height,Math.min(17,unit*.25));ctx.fill();ctx.restore();
  ctx.save();ctx.strokeStyle=p.ink;ctx.globalAlpha=.27;ctx.lineWidth=1.25;
  roundedRect(ctx,left,top,width,height,Math.min(17,unit*.25));ctx.stroke();
  ctx.globalAlpha=.7;ctx.strokeStyle=p.pop;ctx.lineWidth=Math.max(1.6,unit*.035);
  ctx.beginPath();ctx.arc(x,y,unit*.56,-.74,Math.PI*.83);ctx.stroke();
  ctx.globalAlpha=.75;sketchStar(ctx,left+width*.14,top+height*.18,unit*.065,p.ink,1.5,.13);
  drawMaterialMark(ctx,type,left+width*.81,top+height*.19,unit,p.ink);
  ctx.fillStyle=p.ink;ctx.globalAlpha=.35;
  for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(left+width*.83+i*unit*.065,top+height*.15,1.2,0,TAU);ctx.fill();}
  ctx.restore();
}

/** 非缓存层：顶部柔光 + 工作区光池。浅色下不要锥形光柱，会像脏污。 */
function drawWorkLight(ctx, w, h) {
  const pool = ctx.createRadialGradient(w * .5, h * .12, 0, w * .5, h * .12, w * .78);
  pool.addColorStop(0, 'rgba(255,255,255,.25)');
  pool.addColorStop(.42, 'rgba(255,255,255,.08)');
  pool.addColorStop(1, 'rgba(210,228,240,0)');
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, w, h * .72);

  // 极轻的青调，避免整块白面发死
  const cool = ctx.createRadialGradient(w * .5, h * .58, 0, w * .5, h * .58, w * .9);
  cool.addColorStop(0, 'rgba(34,122,135,.030)');
  cool.addColorStop(1, 'rgba(34,122,135,0)');
  ctx.fillStyle = cool;
  ctx.fillRect(0, h * .2, w, h * .8);
}

function drawVignette(ctx, w, h) {
  const v = ctx.createRadialGradient(w * .5, h * .46, Math.min(w, h) * .34, w * .5, h * .46, Math.max(w, h) * .74);
  v.addColorStop(0, 'rgba(23,52,75,0)');
  v.addColorStop(.78, 'rgba(23,52,75,.035)');
  v.addColorStop(1, 'rgba(23,52,75,.10)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/* ══ 引导与路线 ═════════════════════════════════════════ */

function drawGuideHeader(ctx, guide, w, h) {
  if (!guide || guide.done || !guide.title) return;
  const size = clamp(w * .038, 12, 16);
  const text = String(guide.title).length > 22 ? `${String(guide.title).slice(0, 21)}…` : guide.title;
  ctx.save();
  ctx.font = `600 ${size}px system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const width = Math.min(w * .84, ctx.measureText(text).width + 30);
  const x = w * .5, y = h * .105;
  ctx.fillStyle = 'rgba(34,122,135,.10)';
  roundedRect(ctx, x - width / 2, y - size * .95, width, size * 1.9, size); ctx.fill();
  ctx.strokeStyle = 'rgba(34,122,135,.30)'; ctx.lineWidth = 1;
  roundedRect(ctx, x - width / 2, y - size * .95, width, size * 1.9, size); ctx.stroke();
  ctx.fillStyle = '#195B65';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawRoute(ctx, run, targets, w, h) {
  if (!run.guide?.minGestureKills || run.guide.done || run.elapsed > 5) return;
  ctx.save(); ctx.strokeStyle = 'rgba(150,220,213,.25)'; ctx.lineWidth = 1; ctx.setLineDash([3, 7]);
  ctx.beginPath(); targets.filter((t) => t.alive).forEach((t, i) => { if (i) ctx.lineTo(t.x * w, t.y * h); else ctx.moveTo(t.x * w, t.y * h); }); ctx.stroke(); ctx.restore();
}

function isGuideTarget(guide, t) {
  if (!guide || guide.done) return false;
  if (guide.slots?.includes(t.slot) || guide.types?.includes(t.type)) return true;
  // 连斩类目标由顶部提示/连线引导即可，给每个靶具圈巨大椭圆会遮挡材质外观。
  return false;
}

/* ══ 靶具 ═══════════════════════════════════════════════ */

function targetMetrics(w, h, stream = false, structure = false) {
  // V4.1: sprites stand on their own material silhouette rather than on
  // small hanging UI cards. Slightly larger structure components remain
  // within the same authored collision centers and clear of neighboring joints.
  const unit = structure ? Math.min(w*.23,h*.21,96)
    : stream ? Math.min(w*.18,h*.165,72) : Math.min(w*.19,h*.21,82);
  return {unit,half:unit*.5,bodyW:unit*.94,
    bodyH:Math.min(unit*1.48,h*(stream ? .15 : structure ? .195 : .21))};
}

function drawTarget(ctx, t, data, index, x, y, w, h, guided, now, bursts = EMPTY, reduced = false, age = 1) {
  const { unit, half, bodyW, bodyH } = targetMetrics(w, h, t.layout === 'stream',t.layout === 'structure');
  const bodyTop = y - bodyH * .49;
  const progress = clamp(Number(t.progress) || 0, 0, 1);

  ctx.save();
  // 顿帧只冻结靶具的视觉压缩/回弹，不阻塞 Canvas 输入、RAF 或45秒倒计时。
  const impact = reduced ? null : bursts.findLast(b => b.type === t.type
    && Math.abs(b.x-t.x)<.002 && Math.abs(b.y-t.y)<.002 && now-b.at<225);
  const motion = impactMotion(impact,now);
  if(motion) {
    const angle=impact.angle||0;
    const recoil=motion.recoil*(impact.recoilPx||0);
    ctx.translate(x+Math.cos(angle)*recoil,y+Math.sin(angle)*recoil);
    ctx.rotate(Math.sin(angle)*motion.compress*.055);
    ctx.scale(1-motion.compress*.085,1+motion.compress*.045);
    ctx.translate(-x,-y);
  }
  // 吊挂的靶具悬在半空，画"接触阴影"会变成一团灰斑；只在旧的三靶制（立在台面上）保留
  if (t.layout !== 'stream') {
    ctx.save();
    ctx.shadowColor = 'rgba(23,52,75,.16)';
    ctx.shadowBlur = Math.max(6, unit * .12);
    ctx.fillStyle = 'rgba(23,52,75,.10)';
    ctx.beginPath(); ctx.ellipse(x, y + bodyH * .6, bodyW * .62, unit * .085, 0, 0, TAU); ctx.fill();
    ctx.restore();
  }

  if (guided) {
    const pulse = .5 + .5 * Math.sin(now * .004 + index);
    ctx.strokeStyle = `rgba(34,122,135,${.20 + pulse * .22})`; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.ellipse(x, y, half * 1.12, bodyH * .70, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(34,122,135,.045)';
    ctx.beginPath(); ctx.ellipse(x, y, half * 1.06, bodyH * .65, 0, 0, TAU); ctx.fill();
  }

  // Sway the prop about the hanger; keep captions/progress perfectly legible.
  const pose=targetPose(t,now,age,reduced);
  ctx.save();
  ctx.translate(x+pose.x,bodyTop-hangGap(unit)+pose.y);
  ctx.rotate(pose.angle);ctx.scale(pose.scaleX,pose.scaleY);
  ctx.translate(-x,-bodyTop+hangGap(unit));
  if (t.layout!=='stream' && t.layout!=='structure') {
    // Legacy static practice props can retain the information plaque. V4.1
    // moving material and structural targets must show bare material geometry.
    drawSpecimenPlate(ctx,t.type,x,y,bodyW,bodyH,unit);
    drawHanger(ctx,x,bodyTop,unit);
  }

  // The target is now a genuine prebaked transparent WebP material sprite.
  // Retain existing Canvas illustration ONLY if the atlas is unavailable.
  ctx.save();
  ctx.shadowColor='rgba(24,49,66,.16)';ctx.shadowBlur=Math.max(2,unit*.045);
  ctx.shadowOffsetX=unit*.025;ctx.shadowOffsetY=unit*.05;
  const textured=drawWholeSprite(ctx,t.type,x,y,bodyW,bodyH);
  ctx.restore();
  if (!textured) {
    drawMaterial(ctx,t,data,x,y,bodyW,bodyH,bodyTop,unit);
    if(t.type==='rope'||t.type==='foam') drawBundleTies(ctx,x,y,bodyW,bodyH,unit);
  }
  // Small authored 2D ink marks sit ON the specimen, never replace the physical material.
  if(t.avoid) drawAvoidSeal(ctx,x,y,bodyW,bodyH,unit);
  else drawTargetHandmark(ctx,t,x,y,bodyW,bodyH,unit);
  drawKerf(ctx, t, x, y, bodyW, bodyH, bodyTop, unit, progress);
  // The persistent kerf carries the hit. No white screen-blend flash over the material.
  ctx.restore();

  if(t.layout!=='structure' && t.layout!=='stream') {
    const railW=bodyW*.88,railY=bodyTop-Math.max(9,unit*.15),railH=Math.max(3,unit*.05);
    ctx.fillStyle='rgba(110,104,166,.18)';
    roundedRect(ctx,x-railW/2,railY,railW,railH,railH/2);ctx.fill();
    if(progress>0){
      ctx.fillStyle=(SPECIMEN[t.type]||SPECIMEN.metal).ink;
      roundedRect(ctx,x-railW/2,railY,railW*progress,railH,railH/2);ctx.fill();
    }
    drawTargetCaption(ctx,t,data,index,x,y,unit,guided,w,bodyH,progress);
  }
  ctx.restore();
}

/** 吊挂：一根细线从横杆垂下来，末端一个挂环扣住材料。没有夹座，靠"挂着"解释支撑。 */
function hangGap(unit) { return Math.max(10, unit * .24); }

function drawHanger(ctx, x, topY, unit) {
  const gap = hangGap(unit);
  const anchorY = topY - gap;
  ctx.save();
  ctx.strokeStyle = 'rgba(23,52,75,.26)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x, anchorY); ctx.lineTo(x, topY - 2); ctx.stroke();
  // 挂环
  ctx.strokeStyle = 'rgba(23,52,75,.34)';
  ctx.lineWidth = Math.max(1, unit * .022);
  ctx.beginPath(); ctx.arc(x, topY - 1, Math.max(2, unit * .055), 0, TAU); ctx.stroke();
  // 横杆上的锚点
  ctx.fillStyle = 'rgba(23,52,75,.30)';
  ctx.beginPath(); ctx.arc(x, anchorY, Math.max(1.6, unit * .03), 0, TAU); ctx.fill();
  ctx.restore();
}

/** 空槽用的：只有垂线与空环 */
function drawEmptyHanger(ctx, x, topY, unit) {
  const gap = hangGap(unit);
  ctx.save();
  ctx.strokeStyle = 'rgba(23,52,75,.14)';
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 3]);
  ctx.beginPath(); ctx.moveTo(x, topY - gap); ctx.lineTo(x, topY - 2); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(23,52,75,.18)';
  ctx.beginPath(); ctx.arc(x, topY - 1, Math.max(2, unit * .05), 0, TAU); ctx.stroke();
  ctx.restore();
}

/** 旧夹具（保留给其它布局调用，当前靶具已改为吊挂）。 */
function drawClamp(ctx, x, baseY, unit) {
  const clampW = unit * 1.0, clampH = Math.max(7, unit * .155);
  const g = ctx.createLinearGradient(x - clampW * .5, 0, x + clampW * .5, 0);
  g.addColorStop(0, '#B9C8D2'); g.addColorStop(.42, '#E6EEF3'); g.addColorStop(.62, '#F2F7FA'); g.addColorStop(1, '#B4C4CF');
  ctx.fillStyle = g;
  roundedRect(ctx, x - clampW * .5, baseY, clampW, clampH, clampH * .35); ctx.fill();
  ctx.strokeStyle = 'rgba(23,52,75,.18)'; ctx.lineWidth = 1;
  roundedRect(ctx, x - clampW * .5, baseY, clampW, clampH, clampH * .35); ctx.stroke();
  ctx.fillStyle = 'rgba(34,122,135,.70)';
  ctx.fillRect(x - clampW * .5 + 4, baseY + clampH * .32, 2, clampH * .36);
  ctx.fillRect(x + clampW * .5 - 6, baseY + clampH * .32, 2, clampH * .36);
  ctx.fillStyle = 'rgba(23,52,75,.22)';
  ctx.fillRect(x - clampW * .12, baseY + clampH * .18, clampW * .24, clampH * .64);
}

/**
 * 空槽：夹座常驻；整排清空时再给残影框 + 下一波倒计时。
 * 之前靶具一断画面就是纯黑等待，看不出"在等下一波"。
 */
function drawEmptySlots(ctx, run, targets, now, w, h, reduced) {
  if (!targets.length || run.done) return;
  const dead = targets.filter((t) => t && !t.alive);
  if (!dead.length) return;
  const allDead = dead.length === targets.length;
  const { unit, bodyH } = targetMetrics(w, h, targets.some((t) => t.layout === 'stream'));
  // Stream stages use nextSpawnAt, never the old three-target nextWaveAt.
  // End-of-quota uses Number.MAX_SAFE_INTEGER; it is a sentinel, not a countdown.
  const streamMode = run.spawnMode==='stream';
  const nextAt=Number(streamMode ? run.nextSpawnAt : run.nextWaveAt);
  const nowElapsed=Number(run.elapsed)||0;
  const futureWait=nextAt-nowElapsed;
  const quotaExhausted=streamMode&&run.encounter
    && run.stageSpawned >= (run.encounter.stages?.[run.spawnStage]?.quota ?? Infinity);
  const hasNext=Number.isFinite(nextAt)&&nextAt<1e6&&!quotaExhausted
    && futureWait>=0&&futureWait<30;
  const wait=hasNext?futureWait:0;
  const span=Math.max(.8,nextAt-(Number(run.lastKillAt)||0));
  const p=hasNext?clamp(1-wait/span,0,1):0;
  for (const t of dead) {
    const x = t.x * w, y = t.y * h;
    drawEmptyHanger(ctx, x, y - bodyH * .5, unit);
    if (!allDead) continue;
    const stream = t.layout === 'stream';
    const focus = stream ? t.slot === 1 : t.slot === 1;   // 只在中间工位报倒计时，三个数字一起跳太吵
    ctx.save();
    // 连续投放的架子本身就说明了"空位"，再画虚线框会像工程图；只在旧的三靶制里保留
    if (!stream) {
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = focus ? 'rgba(23,52,75,.14)' : 'rgba(23,52,75,.06)';
      ctx.lineWidth = 1;
      roundedRect(ctx, x - unit * .46, y - bodyH * .5, unit * .92, bodyH, unit * .1); ctx.stroke();
    }
    if (focus && !reduced && hasNext) {
      const size = Math.max(11, unit * .22);
      const breathe = .5 + .5 * Math.sin(now * .006);
      ctx.setLineDash([]);
      ctx.strokeStyle = `rgba(34,122,135,${.34 + p * .42 + breathe * .12})`;
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x, y, unit * .22, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(.02, p)); ctx.stroke();
      ctx.fillStyle = '#17344B';
      ctx.font = `700 ${size}px system-ui, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(wait > .05 ? wait.toFixed(1) : '…', x, y + 1);
      ctx.font = `600 ${Math.max(9, size * .44)}px system-ui, sans-serif`;
      ctx.fillStyle = '#526879';
      ctx.fillText('下一波', x, y + unit * .36);
    }
    ctx.restore();
  }
}

/**
 * 六个「综艺靶具」不是统一贴图卡片：用独立轮廓和材质来建立可辨识度。
 * 全部为 Canvas2D 程序绘制、无额外图片和贴图请求；碎块也复用同一个形状。
 */
function drawMaterial(ctx, t, data, x, y, width, height, top, unit) {
  const type=t.type, left=x-width*.5;
  ctx.save();
  if(type==='rope') {
    // 5股编织绳组成一束，绳股略有扭转；绑带是一个实体环。
    for(let k=0;k<5;k++){
      const sw=width*.22, sx=x-width*.43+k*width*.214, sy=top+height*(k%2?.055:.035), sh=height*.92;
      ctx.save();roundedRect(ctx,sx-sw*.5,sy,sw,sh,sw*.42);ctx.clip();
      const g=ctx.createLinearGradient(sx-sw*.5,0,sx+sw*.5,0);
      g.addColorStop(0,'#6F593D');g.addColorStop(.25,'#D1B681');g.addColorStop(.53,'#F5E0AF');g.addColorStop(.78,'#B99A65');g.addColorStop(1,'#776048');
      ctx.fillStyle=g;ctx.fillRect(sx-sw,sy,sw*2,sh);
      for(let line=-3;line<sh/sw+3;line++){
        const yy=sy+line*sw*.53;
        ctx.lineWidth=Math.max(.8,unit*.018);ctx.strokeStyle=line%2?'rgba(77,58,39,.45)':'rgba(255,246,207,.60)';
        ctx.beginPath();ctx.moveTo(sx-sw*.62,yy);ctx.lineTo(sx+sw*.64,yy+sw*.79);ctx.stroke();
      }
      ctx.restore();
      ctx.strokeStyle='rgba(69,50,30,.38)';ctx.lineWidth=Math.max(.6,unit*.012);
      roundedRect(ctx,sx-sw*.5,sy,sw,sh,sw*.42);ctx.stroke();
    }
  } else if(type==='foam') {
    // 四块蜂窝EVA安全泡棉：高饱和但克制的运动道具配色，端面有细孔。
    const tones=['#4BD7B3','#6EE4D3','#48C4CB','#75D8E4'];
    for(let k=0;k<4;k++){
      const sw=width*.235,sx=x-width*.35+k*width*.232,sy=top+height*.085,sh=height*.83;
      ctx.save();roundedRect(ctx,sx-sw*.5,sy,sw,sh,sw*.25);ctx.clip();
      const g=ctx.createLinearGradient(sx-sw*.5,0,sx+sw*.5,0);
      g.addColorStop(0,shade(tones[k],-.34));g.addColorStop(.24,tones[k]);g.addColorStop(.63,shade(tones[k],.26));g.addColorStop(1,shade(tones[k],-.3));
      ctx.fillStyle=g;ctx.fillRect(sx-sw,sy,sw*2,sh);
      ctx.fillStyle='rgba(240,255,255,.34)';
      for(let row=0;row<6;row++)for(let col=0;col<2;col++){
        ctx.beginPath();ctx.arc(sx+sw*(col? .20:-.18),sy+sh*(.13+row*.135),Math.max(.65,unit*.008),0,TAU);ctx.fill();
      }
      ctx.restore();
      ctx.strokeStyle='rgba(21,105,102,.24)';ctx.lineWidth=Math.max(.7,unit*.012);
      roundedRect(ctx,sx-sw*.5,sy,sw,sh,sw*.25);ctx.stroke();
    }
  } else if(type==='wood') {
    // 圆木柱：明显的上端年轮、侧面树皮与裂纹，不再是木纹方砖。
    const g=ctx.createLinearGradient(left,0,left+width,0);
    g.addColorStop(0,'#523728');g.addColorStop(.19,'#966541');g.addColorStop(.45,'#BC8654');g.addColorStop(.73,'#97633D');g.addColorStop(1,'#553B2B');
    ctx.fillStyle=g;roundedRect(ctx,left,top+height*.045,width,height*.91,width*.16);ctx.fill();
    ctx.save();roundedRect(ctx,left,top+height*.045,width,height*.91,width*.16);ctx.clip();
    drawWoodGrain(ctx,x,y,width,height,unit);
    ctx.restore();
    ctx.fillStyle='#D8A770';ctx.beginPath();ctx.ellipse(x,top+height*.09,width*.47,height*.075,0,0,TAU);ctx.fill();
    ctx.strokeStyle='#95633B';ctx.lineWidth=Math.max(.8,unit*.014);
    for(let ring=.23;ring<.9;ring+=.22){
      ctx.beginPath();ctx.ellipse(x,top+height*.09,width*.47*ring,height*.075*ring,-.08,0,TAU);ctx.stroke();
    }
    ctx.strokeStyle='rgba(53,35,22,.45)';ctx.lineWidth=Math.max(1,unit*.024);
    ctx.beginPath();ctx.moveTo(x+width*.16,top+height*.14);ctx.lineTo(x+width*.23,top+height*.88);ctx.stroke();
  } else if(type==='plastic') {
    // 工业工程塑料：厚边框+细密加强肋+四个紧固点，呈刚性板而非发灰方块。
    const g=ctx.createLinearGradient(left,0,left+width,0);
    g.addColorStop(0,'#567886');g.addColorStop(.15,'#B6D2DA');g.addColorStop(.48,'#EDF6F7');g.addColorStop(.82,'#A0C1CB');g.addColorStop(1,'#52717D');
    ctx.fillStyle=g;roundedRect(ctx,left,top,width,height,unit*.065);ctx.fill();
    ctx.fillStyle='rgba(38,85,102,.15)';roundedRect(ctx,left+width*.07,top+height*.065,width*.86,height*.87,unit*.035);ctx.fill();
    ctx.save();roundedRect(ctx,left+width*.12,top+height*.08,width*.76,height*.83,unit*.025);ctx.clip();
    drawPlasticTexture(ctx,x,y,width,height,unit);
    for(let i=0;i<5;i++){
      const xx=left+width*(.18+i*.16);
      ctx.strokeStyle=i%2?'rgba(255,255,255,.44)':'rgba(44,85,107,.21)';
      ctx.lineWidth=Math.max(1,unit*.026);
      ctx.beginPath();ctx.moveTo(xx,top+height*.08);ctx.lineTo(xx,top+height*.92);ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle='#3B6271';ctx.strokeStyle='rgba(246,255,255,.72)';
    for(const dx of [.14,.86])for(const dy of [.115,.885]){
      ctx.beginPath();ctx.arc(left+width*dx,top+height*dy,Math.max(1.3,unit*.027),0,TAU);ctx.fill();ctx.stroke();
    }
  } else if(type==='ice') {
    // 多面体透明冰块：深蓝折射边界、内部雪晶与白亮碎面，保持半透明。
    ctx.beginPath();ctx.moveTo(left+width*.10,top+height*.035);ctx.lineTo(left+width*.85,top);
    ctx.lineTo(left+width,top+height*.15);ctx.lineTo(left+width*.91,top+height*.9);
    ctx.lineTo(left+width*.73,top+height);ctx.lineTo(left+width*.06,top+height*.9);
    ctx.lineTo(left,top+height*.18);ctx.closePath();
    const g=ctx.createLinearGradient(left,top,left+width,top+height);
    g.addColorStop(0,'#CFFAFF');g.addColorStop(.25,'#80DDEC');g.addColorStop(.60,'#BEEBF8');g.addColorStop(1,'#3C9EBF');
    ctx.fillStyle=g;ctx.fill();
    ctx.save();ctx.clip();drawIceFaces(ctx,x,y,width,height,unit);
    ctx.strokeStyle='rgba(255,255,255,.65)';ctx.lineWidth=Math.max(1.1,unit*.019);
    ctx.beginPath();ctx.moveTo(left+width*.1,top+height*.1);ctx.lineTo(left+width*.48,top+height*.28);
    ctx.lineTo(left+width*.94,top+height*.08);ctx.moveTo(left+width*.48,top+height*.28);
    ctx.lineTo(left+width*.62,top+height*.95);ctx.stroke();ctx.restore();
    ctx.lineWidth=Math.max(1.1,unit*.023);ctx.strokeStyle='#5EAFC4';ctx.stroke();
    ctx.strokeStyle='rgba(252,255,255,.96)';ctx.lineWidth=Math.max(1,unit*.035);
    ctx.beginPath();ctx.moveTo(left+width*.08,top+height*.48);ctx.lineTo(left+width*.1,top+height*.08);
    ctx.lineTo(left+width*.51,top+height*.05);ctx.stroke();
  } else if(type==='metal') {
    // Downgrade-only Canvas backup matches the new SOLID steel block silhouette.
    // Never draw a pipe opening or hollow wall if the WebP atlas is unavailable.
    const front=[x-width*.18,top+height*.2,x+width*.48,top+height*.09,
      x+width*.48,top+height*.87,x-width*.18,top+height];
    const face=ctx.createLinearGradient(left,top,left+width,top+height);
    face.addColorStop(0,'#8c9eae');face.addColorStop(.35,'#e3eff5');
    face.addColorStop(.63,'#8b9da9');face.addColorStop(1,'#4e6577');
    ctx.fillStyle='#53697c';
    ctx.beginPath();ctx.moveTo(left,top+height*.15);
    ctx.lineTo(x-width*.18,top+height*.2);ctx.lineTo(x-width*.18,top+height);
    ctx.lineTo(left,top+height*.83);ctx.closePath();ctx.fill();
    ctx.fillStyle=face;
    ctx.beginPath();ctx.moveTo(x-width*.18,top+height*.2);
    ctx.lineTo(x+width*.48,top+height*.09);
    ctx.lineTo(x+width*.48,top+height*.87);
    ctx.lineTo(x-width*.18,top+height);ctx.closePath();ctx.fill();
    ctx.fillStyle='#d5e2eb';
    ctx.beginPath();ctx.moveTo(left,top+height*.15);
    ctx.lineTo(x+width*.17,top+height*.03);
    ctx.lineTo(x+width*.48,top+height*.09);
    ctx.lineTo(x-width*.18,top+height*.2);ctx.closePath();ctx.fill();
    ctx.strokeStyle='rgba(248,253,255,.82)';ctx.lineWidth=Math.max(1.0,unit*.025);
    ctx.beginPath();ctx.moveTo(x-width*.18,top+height*.2);
    ctx.lineTo(x+width*.48,top+height*.09);
    ctx.lineTo(x+width*.48,top+height*.87);ctx.stroke();
    // Fine directional brushed steel grain with no hollow opening.
    ctx.save();ctx.beginPath();ctx.moveTo(x-width*.18,top+height*.2);
    ctx.lineTo(x+width*.48,top+height*.09);ctx.lineTo(x+width*.48,top+height*.87);
    ctx.lineTo(x-width*.18,top+height);ctx.closePath();ctx.clip();
    for(let n=0;n<18;n++){
      const yy=top+height*(.17+n*.041);
      ctx.strokeStyle=n%3?'rgba(25,44,66,.07)':'rgba(247,253,255,.28)';
      ctx.lineWidth=.65;ctx.beginPath();ctx.moveTo(left,yy+height*.11);
      ctx.lineTo(x+width*.54,yy);ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
}
/** 捆扎带：两道深色绳 + 结。绳束/泡棉靠它读作"一捆"。 */
function drawBundleTies(ctx, x, y, width, height, unit) {
  const bandW = Math.max(1.3, height * .030);
  for (const fy of [-.27, .27]) {
    const by = y + height * fy;
    ctx.strokeStyle = 'rgba(64,46,26,.60)';
    ctx.lineWidth = bandW;
    ctx.beginPath(); ctx.moveTo(x - width * .47, by); ctx.lineTo(x + width * .47, by); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,244,214,.22)';
    ctx.lineWidth = Math.max(.8, bandW * .35);
    ctx.beginPath(); ctx.moveTo(x - width * .45, by - bandW * .28); ctx.lineTo(x + width * .40, by - bandW * .28); ctx.stroke();
    // 结
    ctx.fillStyle = 'rgba(64,46,26,.66)';
    ctx.beginPath(); ctx.arc(x + width * .12, by, Math.max(1.6, bandW * .8), 0, TAU); ctx.fill();
  }
}

function drawWoodGrain(ctx, x, y, width, height, unit) {
  ctx.strokeStyle = 'rgba(70,40,22,.39)'; ctx.lineWidth = Math.max(.7, unit * .014);
  for (let i = 0; i < 6; i++) {
    const gx = x - width * .42 + i * width * .165;
    ctx.beginPath(); ctx.moveTo(gx, y - height * .52);
    ctx.bezierCurveTo(gx + width * .14, y - height * .23, gx - width * .1, y + height * .2, gx + width * .02, y + height * .52); ctx.stroke();
  }
  ctx.beginPath(); ctx.ellipse(x + width * .08, y + height * .04, width * .09, height * .12, -.1, 0, TAU); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,220,166,.20)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x - width * .35, y - height * .38); ctx.lineTo(x + width * .3, y - height * .38); ctx.stroke();
}

function drawPlasticTexture(ctx, x, y, width, height, unit) {
  ctx.fillStyle = 'rgba(38,71,86,.18)';
  const step = Math.max(4, unit * .09);
  for (let ix = -2; ix <= 2; ix++) for (let iy = -3; iy <= 3; iy++) ctx.fillRect(x + ix * step, y + iy * step, Math.max(1, unit * .014), Math.max(1, unit * .014));
  ctx.strokeStyle = 'rgba(248,255,255,.22)'; ctx.lineWidth = Math.max(1, unit * .018);
  ctx.beginPath(); ctx.moveTo(x - width * .35, y - height * .31); ctx.lineTo(x + width * .35, y - height * .31); ctx.stroke();
}

function drawIceFaces(ctx, x, y, width, height, unit) {
  ctx.fillStyle = 'rgba(224,252,255,.20)';
  ctx.beginPath(); ctx.moveTo(x - width * .43, y - height * .38); ctx.lineTo(x + width * .36, y - height * .31); ctx.lineTo(x - width * .13, y + height * .42); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(240,255,255,.15)';
  ctx.beginPath(); ctx.moveTo(x + width * .37, y - height * .30); ctx.lineTo(x + width * .43, y + height * .3); ctx.lineTo(x + width * .05, y + height * .49); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(238,255,255,.75)'; ctx.lineWidth = Math.max(1, unit * .02);
  ctx.beginPath(); ctx.moveTo(x + width * .18, y - height * .48); ctx.lineTo(x - width * .04, y - height * .07); ctx.lineTo(x + width * .12, y + height * .16); ctx.lineTo(x - width * .27, y + height * .49);
  ctx.moveTo(x - width * .04, y - height * .07); ctx.lineTo(x - width * .43, y - height * .20); ctx.stroke();
}

function drawMetalLayers(ctx, x, y, width, height, unit, layer) {
  const bands = 4;
  for (let i = 0; i < bands; i++) {
    const yy = y - height * .43 + i * height * .28;
    ctx.fillStyle = i % 2 ? 'rgba(28,50,64,.13)' : 'rgba(238,248,251,.12)';
    ctx.fillRect(x - width * .48, yy, width * .96, height * .20);
    ctx.strokeStyle = i === (layer ? 1 : 0) ? 'rgba(255,224,154,.66)' : 'rgba(240,250,255,.27)';
    ctx.lineWidth = i === (layer ? 1 : 0) ? Math.max(1.4, unit * .026) : Math.max(.7, unit * .012);
    ctx.beginPath(); ctx.moveTo(x - width * .44, yy + height * .20); ctx.lineTo(x + width * .44, yy + height * .20); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(239,249,251,.24)'; ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const yy = y - height * .4 + i * height * .2;
    ctx.beginPath(); ctx.moveTo(x - width * .43, yy); ctx.lineTo(x + width * .43, yy - height * .12); ctx.stroke();
  }
}

/**
 * 刀口：深缝 + 单侧高温边 + 两端碎屑。
 * 缝宽随进度增长；只有最新一刀带高温色，旧刀口冷却成暗缝 —— 一眼能看出"这一刀切到哪"。
 */
function drawKerf(ctx, t, x, y, width, height, top, unit, progress) {
  const cuts = t.cuts;
  if (!cuts?.length || !(progress > 0)) return;
  const count = Math.min(cuts.length, 3);
  ctx.save();
  ctx.lineCap = 'butt';
  roundedRect(ctx, x - width * .5, top, width, height, width * .06); ctx.clip();
  for (let i = cuts.length - count; i < cuts.length; i++) {
    const cut = cuts[i];
    const age = cuts.length - 1 - i;
    const angle = Number.isFinite(cut.angle) ? cut.angle : 0;
    const yoff = Number.isFinite(cut.y) ? clamp(cut.y * (height * 1.3), -height * .42, height * .42) : 0;
    // 刀口长度跟着材质轮廓走：泡棉只跨 4 根管，绳束跨 5 股，板类铺满整块。
    const spanRatio = t.type === 'foam' ? .60 : t.type === 'rope' ? .86 : .96;
    const len = width * spanRatio * (.94 + clamp(cut.progress || progress, 0, 1) * .06);
    const dx = Math.cos(angle) * len * .5;
    const dy = Math.sin(angle) * len * .5;
    const cy = y + yoff;
    const hot = age === 0;
    const gap = Math.max(1.4, unit * (hot ? .038 + progress * .04 : .026));
    // 先压一条更宽的暗影，再画深缝 —— 只有"缝有厚度"才像切进去，而不是画了条线。
    ctx.strokeStyle = 'rgba(6,12,18,.20)';
    ctx.lineWidth = gap * 1.5;
    ctx.beginPath(); ctx.moveTo(x - dx, cy - dy); ctx.lineTo(x + dx, cy + dy); ctx.stroke();
    ctx.strokeStyle = hot ? 'rgba(8,13,17,.95)' : 'rgba(14,21,27,.66)';
    ctx.lineWidth = hot ? gap * 1.25 : gap;
    ctx.beginPath(); ctx.moveTo(x - dx, cy - dy); ctx.lineTo(x + dx, cy + dy); ctx.stroke();
    if (hot) {
      // 只留"上唇"一条暖光：宽白边会把缝盖掉，看起来就像贴了根白条。
      const lip = t.type === 'ice' ? 'rgba(214,250,255,.62)' : 'rgba(255,232,186,.6)';
      ctx.strokeStyle = lip;
      ctx.lineWidth = Math.max(1, gap * .3);
      ctx.beginPath();
      ctx.moveTo(x - dx * .98, cy - dy * .98 - gap * .62);
      ctx.lineTo(x + dx * .98, cy + dy * .98 - gap * .62);
      ctx.stroke();
      ctx.fillStyle = CORE_COLORS[t.type] || 'rgba(240,240,230,.8)';
      ctx.globalAlpha = .55;
      for (const s of [-1, 1]) {
        const px = x + dx * s, py = cy + dy * s;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + gap * 1.1, py - gap * .6);
        ctx.lineTo(px + gap * .4, py + gap * .9);
        ctx.closePath(); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  /* 楔口：切口中心被"切进去"的深度 = 进度。没有百分比文字，靠它读进度。 */
  const lastDir = Number.isFinite(t.lastAngle) ? t.lastAngle : 0;
  const dx0 = Math.cos(lastDir), dy0 = Math.sin(lastDir);
  const nx0 = -dy0, ny0 = dx0;
  const inSign = ny0 >= 0 ? 1 : -1;
  const notchW = width * .22;
  const notchD = unit * (.06 + progress * .26);
  const cy0 = y + (Number.isFinite(cuts[cuts.length - 1].y) ? clamp(cuts[cuts.length - 1].y * (height * 1.3), -height * .42, height * .42) : 0);
  ctx.save();
  const ng = ctx.createLinearGradient(x, cy0, x, cy0 + notchD * inSign);
  ng.addColorStop(0, 'rgba(10,16,20,.92)');
  ng.addColorStop(.65, 'rgba(10,16,20,.55)');
  ng.addColorStop(1, 'rgba(10,16,20,.05)');
  ctx.fillStyle = ng;
  ctx.beginPath();
  ctx.moveTo(x - notchW * .5, cy0 - 1.2 * inSign);
  ctx.lineTo(x + notchW * .5, cy0 - 1.2 * inSign);
  ctx.lineTo(x, cy0 + notchD * inSign);
  ctx.closePath(); ctx.fill();
  // 两条亮边，说明"切开了"
  ctx.strokeStyle = CORE_COLORS[t.type] || 'rgba(240,240,230,.8)';
  ctx.lineWidth = Math.max(.9, unit * .016);
  ctx.beginPath();
  ctx.moveTo(x - notchW * .5, cy0 - 1.2 * inSign);
  ctx.lineTo(x, cy0 + notchD * inSign);
  ctx.lineTo(x + notchW * .5, cy0 - 1.2 * inSign);
  ctx.stroke();
  ctx.restore();

  // 材质化损伤：冰裂纹 / 木刺
  if (t.type === 'ice' && progress > .2) {
    ctx.strokeStyle = 'rgba(214,250,255,.72)';
    ctx.lineWidth = 1;
    for (const [sx, sy, ex, ey] of [[-.1, .1, -.34, .30], [.12, .08, .36, .26], [0, .16, .04, .44]]) {
      ctx.beginPath();
      ctx.moveTo(x + width * sx, cy0 + notchD * inSign * Math.abs(sy) * 2);
      ctx.lineTo(x + width * ex, cy0 + notchD * inSign * Math.abs(ey) * 2);
      ctx.stroke();
    }
  }
  if (t.type === 'wood' && progress > .15) {
    ctx.fillStyle = 'rgba(120,86,44,.55)';
    for (const s of [-1, 1]) {
      const px = x + s * notchW * .5;
      ctx.beginPath();
      ctx.moveTo(px, cy0);
      ctx.lineTo(px + s * unit * .10, cy0 - unit * .05);
      ctx.lineTo(px + s * unit * .05, cy0 + unit * .06);
      ctx.closePath(); ctx.fill();
    }
  }

  if (t.type === 'metal' && t.layer) {
    ctx.strokeStyle = 'rgba(255,222,150,.85)'; ctx.lineWidth = Math.max(1.5, unit * .026);
    ctx.beginPath(); ctx.moveTo(x - width * .43, y + height * .13); ctx.lineTo(x + width * .43, y + height * .13); ctx.stroke();
  }
  ctx.restore();
}

function drawTargetCaption(ctx,t,data,index,x,y,unit,guided,w,bodyH,progress){
  const p=SPECIMEN[t.type]||SPECIMEN.metal;
  const size=clamp(w*.031,10,13),title=MATERIAL_NAMES[t.type]||data.short||'材料';
  const titleY=y+bodyH*.58+12;
  ctx.save();ctx.textAlign='center';ctx.textBaseline='middle';
  ctx.font='700 '+size+'px system-ui, sans-serif';
  const pillW=Math.max(unit*.83,ctx.measureText(title).width+16),pillH=size+10;
  ctx.fillStyle=guided?p.paper:'rgba(255,255,255,.91)';
  roundedRect(ctx,x-pillW*.5,titleY-pillH*.5,pillW,pillH,pillH*.5);ctx.fill();
  ctx.strokeStyle=guided?p.ink:'rgba(134,124,177,.26)';ctx.lineWidth=1;
  roundedRect(ctx,x-pillW*.5,titleY-pillH*.5,pillW,pillH,pillH*.5);ctx.stroke();
  ctx.fillStyle=p.ink;ctx.fillText(title,x,titleY);
  if(guided){
    ctx.font='800 '+Math.max(9,size*.72)+'px system-ui, sans-serif';
    ctx.fillStyle=p.ink;ctx.fillText('★ 优先',x,y-bodyH*.5-28);
  }
  if(t.layout!=='stream'){
    ctx.font='600 '+Math.max(8,size*.68)+'px system-ui, sans-serif';
    ctx.fillStyle='rgba(95,92,139,.58)';
    ctx.fillText(String(index+1).padStart(2,'0'),x,titleY+pillH*.75);
  }
  ctx.restore();
}

function directionHint(angle) {
  if (!Number.isFinite(angle)) return '→';
  const dirs = ['→', '↘', '↓', '↙', '←', '↖', '↑', '↗'];
  return dirs[Math.round((((angle % TAU) + TAU) % TAU) / (TAU / 8)) % 8];
}

/* ══ 断块 ═══════════════════════════════════════════════ */

/**
 * 靶具被切断后的两半：沿刀口法线分离、各自带一点自旋与下落，断口面给一条亮边。
 * 数据由 arena.js 在 hit.complete 时推入（{x,y,type,angle,at}）。
 *
 * 断块要"像原来那个东西"：绳束给 5 股、泡棉给 4 管、板/冰/金属给整块，
 * 否则一刀下去变成两张绿卡片，比不断还怪。
 */
function drawDebris(ctx, debris, now, w, h) {
  if (!debris.length) return;
  for (let i = 0; i < debris.length; i++) {
    const d = debris[i];
    const { unit, bodyW, bodyH } = targetMetrics(w, h, d.layout === 'stream',d.layout === 'structure');
    const age = now - d.at;
    if (age < 0 || age > DEBRIS_LIFE) continue;
    const p = age / DEBRIS_LIFE;
    const alpha = 1 - Math.pow(p, 2.6);
    const angle = Number.isFinite(d.angle) ? d.angle : 0;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const nx = -dy, ny = dx;
    const cx = d.x * w, cy = d.y * h;
    const sep = (4 + p * unit * .34) * (1 - p * .25);
    const heaviness = d.type==='metal'?1.5:d.type==='ice'?1.15:d.type==='wood'?1:d.type==='foam'?.55:.7;
    const fall = p * p * bodyH * .52 * heaviness;
    const spin = p * (d.type==='metal'?.13:d.type==='foam'?.43:.28);
    const core = CORE_COLORS[d.type] || 'rgba(240,240,230,.8)';
    const BIG = Math.max(bodyW, bodyH) * 1.4;
    ctx.save();
    ctx.globalAlpha = alpha;
    for (const side of [-1, 1]) {
      ctx.save();
      // 吊挂靶具：法线朝上的那一半还挂在线上（小幅摆动），另一半掉下去
      const hanging = d.layout !== 'structure' && ny * side < 0;
      if (hanging) {
        const sway = Math.sin(p * 7) * unit * .05 * (1 - p);
        ctx.translate(cx + nx * sep * side * .22 + sway, cy + ny * sep * side * .22 + p * bodyH * .06);
        ctx.rotate(spin * side * .22 + sway / Math.max(24, bodyH));
      } else {
        ctx.translate(cx + nx * sep * side, cy + ny * sep * side + fall);
        ctx.rotate(spin * side);
      }
      // Two purpose-built textured halves with material-specific exposed cut edges.
      // The sprite's baseline fracture is ~11.3 degrees; reorient to the player's actual slash.
      if (spriteReady()) {
        // Clip the actual material at the slash angle. The intact prop's
        // orientation is preserved instead of rotating the entire log/plate.
        drawSplitSprite(ctx,d.type,side,bodyW,bodyH,angle);
      } else {
        ctx.beginPath();
        ctx.moveTo(-dx * BIG, -dy * BIG);
        ctx.lineTo(dx * BIG, dy * BIG);
        ctx.lineTo(dx * BIG + nx * BIG * side, dy * BIG + ny * BIG * side);
        ctx.lineTo(-dx * BIG + nx * BIG * side, -dy * BIG + ny * BIG * side);
        ctx.closePath();ctx.clip();
        drawDebrisBody(ctx,d.type,bodyW,bodyH,unit);
        ctx.strokeStyle=core;
        ctx.lineWidth=Math.max(1.2,unit*.026);
        ctx.beginPath();ctx.moveTo(-dx*bodyH*.55,-dy*bodyH*.55);
        ctx.lineTo(dx*bodyH*.55,dy*bodyH*.55);ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
  }
}

/** 断块本体（以自身中心为原点）：按材质保留最后的可辨识轮廓。 */
function drawDebrisBody(ctx, type, width, height, unit) {
  drawMaterial(ctx, { type, layer:1 }, MATERIALS[type]||{}, 0,0,width,height,-height*.5,unit);
  if(type==='rope'||type==='foam')drawBundleTies(ctx,0,0,width,height,unit);
}

/* ══ 刀光 / 火花 / 文字 ═════════════════════════════════ */

function drawTrail(ctx, trail, now, w, h, reduced) {
  if(!trail.length)return;
  ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
  // Ink-brush slash: two flat strokes, no white-hot core, glow or bloom.
  for(let pass=0;pass<2;pass++)for(let i=0;i<trail.length;i++){
    const seg=trail[i];if(!seg.a||!seg.b)continue;
    const fade=clamp(1-(now-seg.at)/TRAIL_LIFE,0,1);if(fade<=0)continue;
    const taper=.35+.65*i/Math.max(1,trail.length-1);
    ctx.strokeStyle=pass===0?`rgba(39,66,81,${(.21*fade*taper).toFixed(3)})`
      :`rgba(106,89,167,${(.75*fade*taper).toFixed(3)})`;
    ctx.lineWidth=(pass===0?(reduced?3.1:6.2):(reduced?1.3:2.5))*taper;
    ctx.beginPath();ctx.moveTo(seg.a.x*w,seg.a.y*h);ctx.lineTo(seg.b.x*w,seg.b.y*h);ctx.stroke();
  }
  ctx.restore();
}

/** 2D hand-ink contact feedback. Materials separate by chips and cut resistance,
 * never by generated sparkle, bloom, starbursts or radial particle rings.
 * Purely visual: physics, input and all collision coordinates are untouched. */
function drawBursts(ctx,bursts,now,w,h,reduced){
  for(const b of bursts){
    const age=now-b.at;if(age<0||age>BURST_LIFE)continue;
    const angle=Number.isFinite(b.angle)?b.angle:0;
    const tx=Math.cos(angle),ty=Math.sin(angle),nx=-ty,ny=tx;
    const x=b.x*w,y=b.y*h,weight=clamp(Number(b.weight)||.3,0,1);
    const ink=(SPECIMEN[b.type]||SPECIMEN.metal).ink;
    const blocked=b.event==='blocked'||b.event==='deflect'||b.event==='avoid-hit';
    const cutFade=clamp(1-age/145,0,1);
    const complete=!!b.complete;
    ctx.save();ctx.lineCap='round';ctx.lineJoin='round';
    // Contact pressure: a short dry knife-edge imprint, not an expanding circle.
    if(cutFade>0){
      const extent=8+weight*10;
      ctx.globalAlpha=cutFade*(blocked?.63:.76);
      ctx.strokeStyle=blocked?'#687D8D':ink;
      ctx.lineWidth=blocked?2.9:2.0+weight*.65;
      ctx.beginPath();ctx.moveTo(x-tx*extent,y-ty*extent);
      ctx.lineTo(x+tx*extent,y+ty*extent);ctx.stroke();
      if(blocked){
        ctx.globalAlpha=cutFade*.32;
        ctx.beginPath();ctx.moveTo(x-tx*extent+nx*4,y-ty*extent+ny*4);
        ctx.lineTo(x+tx*extent+nx*4,y+ty*extent+ny*4);ctx.stroke();
      }
    }
    // Two hand-drawn cut-edge ticks: visible only on completed separation.
    if(complete&&age<210){
      const f=1-age/210;
      ctx.globalAlpha=f*.75;ctx.strokeStyle=ink;ctx.lineWidth=1.7;
      for(const side of [-1,1]){
        const spread=10+age*.06;
        const cx=x+nx*spread*side,cy=y+ny*spread*side;
        ctx.beginPath();ctx.moveTo(cx-tx*6,cy-ty*6);
        ctx.lineTo(cx+tx*6,cy+ty*6);ctx.stroke();
      }
      if(b.objective){
        // One tiny flat "✓" check on structural clearance; no star/explosion.
        const cx=x+nx*22,cy=y+ny*22;
        ctx.strokeStyle='#268B7A';ctx.lineWidth=2.3;
        ctx.beginPath();ctx.moveTo(cx-4,cy);ctx.lineTo(cx-1,cy+3);
        ctx.lineTo(cx+6,cy-5);ctx.stroke();
      }
    }
    if(!reduced&&!blocked){
      const raw=Number(b.particleCount);
      const count=Math.min(3,Math.max(0,Number.isFinite(raw)?Math.round(raw):2));
      const life=b.type==='foam'?195:b.type==='metal'?165:255;
      const f=clamp(1-age/life,0,1);
      for(let i=0;i<count&&f>0;i++){
        // Deterministic fragments follow the knife normal; gravity is modest.
        // Shapes, not emitted light: fibers, foam dots, splinters, facets, filings.
        const side=i%2===0?-1:1;
        const offset=side*(7+age*.068*(.6+weight*.5));
        const px=x+nx*offset+tx*(i-1)*4;
        const py=y+ny*offset+ty*(i-1)*4+Math.pow(age/250,2)*8;
        ctx.save();ctx.translate(px,py);
        ctx.rotate(angle+side*.25);ctx.globalAlpha=f*.82;
        if(b.type==='rope'){
          ctx.strokeStyle='#B08B5E';ctx.lineWidth=1.3;
          ctx.beginPath();ctx.moveTo(-5,-2);ctx.quadraticCurveTo(0,2,5,-2);ctx.stroke();
        }else if(b.type==='foam'){
          ctx.fillStyle='#6AC4B0';ctx.beginPath();ctx.arc(0,0,1.9+(i===0?1:0),0,TAU);ctx.fill();
        }else if(b.type==='wood'){
          ctx.fillStyle='#B78557';ctx.beginPath();ctx.moveTo(-5,-1.2);ctx.lineTo(4,-2);
          ctx.lineTo(0,1.6);ctx.closePath();ctx.fill();
        }else if(b.type==='plastic'){
          ctx.fillStyle='#A9BBC8';ctx.beginPath();ctx.moveTo(-3,-2);
          ctx.lineTo(3,-1);ctx.lineTo(2,3);ctx.closePath();ctx.fill();
        }else if(b.type==='ice'){
          ctx.fillStyle='#CCF1F8';ctx.strokeStyle='#6EB4CC';ctx.lineWidth=.8;
          ctx.beginPath();ctx.moveTo(0,-3.4);ctx.lineTo(3,0);ctx.lineTo(0,3.2);
          ctx.lineTo(-3,0);ctx.closePath();ctx.fill();ctx.stroke();
        }else{
          ctx.fillStyle='#6E8997';ctx.fillRect(-3,-.8,6,1.6);
        }
        ctx.restore();
      }
    }
    ctx.restore();
  }
}

function burstColor(b) {
  if (b.objective) return '#195B65';
  if (b.quality === 'PERFECT') return '#A77B38';
  if (b.quality === 'ANGLE') return '#C4402F';
  if (b.type === 'ice') return '#1E8FB8';
  if (b.type === 'metal') return '#526879';
  return '#2E7077';
}

/** 连斩脉冲：连击 ≥2 且 0.9 秒内刚斩断时，在画面上三分之一处给一次提示。 */
function drawComboBanner(ctx, run, w, h, reduced) {
  const combo = Number(run.combo) || 0;
  if (combo < 2) return;
  const age = (Number(run.elapsed) || 0) - (Number(run.lastKillAt) || 0);
  if (age < 0 || age > .9) return;
  const p = clamp(age / .9, 0, 1);
  const alpha = (1 - p) * .95;
  const scale = reduced ? 1 : 1 + .2 * Math.max(0, .16 - p) / .16;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(w * .5, h * .215);
  ctx.scale(scale, scale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${clamp(w * .072, 22, 30)}px system-ui, sans-serif`;
  ctx.fillStyle = '#A77B38';
  ctx.fillText(`×${combo}`, -w * .048, 1);
  ctx.font = `700 ${clamp(w * .038, 13, 16)}px system-ui, sans-serif`;
  ctx.fillStyle = '#195B65';
  ctx.fillText('连斩', w * .05, 2);
  ctx.restore();
}

/** 得分贴命中点上方；未命中贴边、缩小、更快淡出 —— 两者不再互相压住。 */
function drawLabels(ctx, labels, now, w, h, reduced) {
  // 每个目标的连续补刀只显示最新一次，避免三排密集出场时数字叠成一大片。
  const recent=new Map();
  for(const label of labels)if(label.quality!=='MISS')
    recent.set(`${Math.round(label.x*100)}:${Math.round(label.y*100)}`,label);
  const scored=[...recent.values()];
  const missed = labels.filter((l) => l.quality === 'MISS');
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < scored.length; i++) {
    const hit = scored[i];
    const age = now - hit.at;
    if (age < 0 || age > LABEL_LIFE) continue;
    const p = age / LABEL_LIFE;
    const lane = Number(hit.slot) || 0;
    const x = clamp(hit.x * w, Math.min(w * .18, 68), w - Math.min(w * .18, 68));
    // 标签只在所属靶具正上方小范围浮动，避免跨列/跨排遮住材料细节。
    const y = hit.y * h - (reduced ? 47 : 47 + age * .023) - lane * 2;
    const color = hit.quality === 'PERFECT' ? '#8C6D14' : hit.objective ? '#195B65' : '#17344B';
    ctx.globalAlpha = 1 - p * p;
    ctx.font = hit.complete
      ? `800 ${clamp(w * .048, 16, 19)}px system-ui, sans-serif`
      : `750 ${clamp(w * .034, 12, 14)}px system-ui, sans-serif`;
    /* ★ rework T07：按**接触结果类型**给不同主文案。
       改造前只有“切入/弹刃/补刀”三种词，无法区分
       “破甲成功”与“强度不足根本打不动”。 */
    const ev = hit.contactEvent;
    const mainText = hit.complete
      ? `+${Math.round(Number(hit.points) || 0)}`
      : ev === 'avoid-hit' ? '误切 · 断连击'
      : ev === 'armor' ? `破甲 ${Math.round((hit.progress || 0) * 100)}%`
      : ev === 'blocked' ? `受阻 ${Math.round((hit.progress || 0) * 100)}%`
      : ev === 'deflect' ? `弹刃 ${Math.round((hit.progress || 0) * 100)}%`
      : `${hit.followup ? '补刀' : '切入'} ${Math.round((hit.progress || 0) * 100)}%`;
    // Small outlined screen-print sticker: score stays readable on light glass.
    const mainW=Math.min(w*.29,ctx.measureText(mainText).width+15);
    ctx.fillStyle=hit.complete?'rgba(255,251,242,.92)':'rgba(255,255,255,.87)';
    roundedRect(ctx,x-mainW*.5,y-12,mainW,24,11);ctx.fill();
    ctx.strokeStyle=hit.complete?'rgba(219,158,90,.56)':'rgba(151,129,200,.36)';
    ctx.lineWidth=1;roundedRect(ctx,x-mainW*.5,y-12,mainW,24,11);ctx.stroke();
    ctx.fillStyle=color;
    ctx.fillText(mainText,x,y,w*.28);
    ctx.font = `650 ${clamp(w * .026, 9, 11)}px system-ui, sans-serif`;
    let detail = QUALITY_NAMES[hit.quality] || '';
    if (hit.complete && hit.combo > 1) detail += `${detail ? ' · ' : ''}连斩 ×${hit.combo}`;
    if (hit.objective) detail += `${detail ? ' · ' : ''}目标 +${hit.objective}`;
    /* 未击破时：先按接触类型说清楚“为什么没切开”，再给方向提示 */
    else if (!hit.complete) {
      if(ev==='avoid-hit') detail='橙色封条请避开';
      else if (ev === 'armor') detail = `已破甲 · 补刀`;
      else if (ev === 'blocked') detail = `未破甲 · 调整刀路`;
      else if (ev === 'deflect') detail = `角度偏离 · 注意刀损`;
      else detail = `沿刀痕继续切`;
      if(ev!=='avoid-hit')detail += ` ${directionHint(hit.angle)}`;
    }
    if (detail) { ctx.fillStyle = 'rgba(56,84,105,.92)'; ctx.fillText(detail, x, y + 15, w * .31); }
  }
  ctx.globalAlpha = 1;
  for (let i = 0; i < missed.length; i++) {
    const hit = missed[i];
    const age = now - hit.at;
    if (age < 0 || age > LABEL_LIFE * .7) continue;
    const p = age / (LABEL_LIFE * .7);
    const x = clamp(hit.x * w, w * .16, w * .84);
    const y = hit.y * h + 30 + p * 10;
    ctx.globalAlpha = (1 - p) * .6;
    ctx.font = `600 ${clamp(w * .032, 11, 13)}px system-ui, sans-serif`;
    ctx.fillStyle = '#C4402F';
    ctx.fillText('未命中', x, y);
  }
  ctx.restore();
}

function drawPointer(ctx, pointer, w, h, reduced) {
  const x = pointer.x * w, y = pointer.y * h;
  ctx.save();
  ctx.strokeStyle = 'rgba(122,95,205,.88)'; ctx.lineWidth = 1.3;
  ctx.beginPath(); ctx.arc(x, y, reduced ? 5 : 7, 0, TAU); ctx.stroke();
  ctx.fillStyle = 'rgba(109,207,188,.55)'; ctx.beginPath(); ctx.arc(x, y, 2, 0, TAU); ctx.fill();
  ctx.restore();
}

/** 震屏：只取最近三次爆发里 130ms 内的，幅度 ≤ 2.6px，硬靶更明显。 */
/** 有方向、强度受限、100ms内归零；不做持续噪声震屏。 */
function shakeOffset(bursts, now) {
  let x=0,y=0;
  for(let i=bursts.length-1;i>=Math.max(0,bursts.length-3);i--) {
    const b=bursts[i],age=now-b.at;
    if(age<0||age>115||!(b.shakePx>0))continue;
    const fade=(1-age/115)**2;
    const angle=b.angle||0,sign=i%2?1:-1;
    x+=Math.cos(angle+Math.PI/2)*b.shakePx*fade*sign;
    y+=Math.sin(angle+Math.PI/2)*b.shakePx*fade*sign;
  }
  return{x:clamp(x,-3.4,3.4),y:clamp(y,-3.4,3.4)};
}

/* ══ 工具 ═══════════════════════════════════════════════ */

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (amount < 0) { r *= 1 + amount; g *= 1 + amount; b *= 1 + amount; }
  else { r += (255 - r) * amount; g += (255 - g) * amount; b += (255 - b) * amount; }
  return `rgb(${Math.round(r)},${Math.round(g)},${Math.round(b)})`;
}

function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
function roundedRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w * .5, h * .5));
  ctx.beginPath();
  if (typeof ctx.roundRect === 'function') { ctx.roundRect(x, y, w, h, radius); return; }
  ctx.moveTo(x + radius, y); ctx.lineTo(x + w - radius, y); ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius); ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - radius); ctx.lineTo(x, y + radius); ctx.quadraticCurveTo(x, y, x + radius, y); ctx.closePath();
}
