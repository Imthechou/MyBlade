import { icon } from './icons.js';
/** Forge V4: one visible 3D stage, two distinct touch minigames. */
import { el, mount } from './dom.js';
import { bladeContourProjection } from './bladeEdgeProjection.js';
import { renderHoningArtwork } from './edgeHoningArtwork.js';
import * as Audio from '../platform/audio.js';
import { HAMMER_TIERS } from '../data/balance.js';
import * as Hammer from '../core/hammer.js';
import { breakChance } from '../core/risk.js';
import * as Edge from '../core/edge.js';
function put(parent,items){mount(parent,items);}
export function renderHammerV4({body,run,stage,Game,getStage,router,render}) {
  body.classList.add('hammer-panel');
  const question=stage.querySelector('.stage-question');
  if(question)question.textContent='自由锻打 · 越锤越强';
  const hit=el('button',{class:'hammer-stage-hit',type:'button',
    'aria-label':'自由挥锤，前十锤不会断裂'},[
      el('span',{class:'hammer-stage-cue',text:'点击挥锤'}),
      el('span',{class:'forge-impact-dent','aria-hidden':'true'}),
      el('span',{class:'forge-impact-chips','aria-hidden':'true'},[el('i'),el('i'),el('i')]),
      el('span',{class:'forge-hammer-float','aria-hidden':'true'}),
    ]);
  stage.appendChild(hit);
  const hud=el('div',{class:'hammer-simple-hud',role:'status','aria-live':'polite'});
  const meter=el('div',{class:'hammer-meter'});
  const next=el('div',{class:'hammer-next'});
  const caption=el('div',{class:'hammer-footer'});
  body.append(hud,meter,next,caption);
  body.parentNode.appendChild(el('div',{class:'hammer-actions'},[
    el('button',{class:'btn btn--primary btn--block',type:'button',text:'收手 · 保留强度',
      onclick:()=>{if(Game.run!==run||run.phase!=='hammer')return;Game.endHammer();render();}})
  ]));
  function refresh(strike=null){
    const h=run.hammer,scale=run.daily?.breakScale||1;
    const futureRisk=Math.min(100,run.risk.current+Hammer.nextRiskDelta(h.count));
    const chance=h.count<10?0:breakChance(futureRisk,scale);
    const nextGain=Hammer.progressOf(h.count+1);
    put(hud,[
      el('div',{class:'hammer-hud-value'},[el('small',{text:'本轮强度'}),el('b',{text:'+'+(h.statGained||0).toFixed(1)})]),
      el('div',{class:'hammer-hud-value'},[el('small',{text:'锤数'}),el('b',{text:String(h.count)})]),
      el('div',{class:'hammer-hud-value'+(run.risk.current>=60?' is-danger':'')},[el('small',{text:'Risk'}),el('b',{text:String(Math.round(run.risk.current))})]),
    ]);
    const tier=HAMMER_TIERS.at(-1).need;
    put(meter,[
      el('div',{class:'hammer-meter-top'},[
        el('b',{text:'强化 '+(h.tier?['','Ⅰ','Ⅱ','Ⅲ','Ⅳ'][h.tier]:'准备中')}),
        el('span',{text:h.count<10?'安全锤 '+(10-h.count)+' 次':run.risk.current>=75?'极限风险':'高收益锻打'})
      ]),
      el('div',{class:'hammer-meter-rail'},[el('i',{style:{width:Math.min(100,h.progress/tier*100)+'%'}})]),
    ]);
    put(next,[
      el('span',{text:'下一锤 +'+nextGain.toFixed(1)+' 强度'}),
      el('span',{class:chance>=.15?'hammer-risk-hot':'',text:'断裂 '+(chance*100).toFixed(1)+'%'})
    ]);
    caption.textContent=strike?.tierUp?'强化升级 · '+Hammer.tierName(strike.tierUp):
      h.count<10?'前十锤安全 · 自由挥锤':'越锤越强，也越危险';
    stage.classList.toggle('hammer-is-risky',run.risk.current>=60);
  }
  hit.addEventListener('click',e=>{
    if(router.currentKey()!=='forge'||Game.run!==run||run.phase!=='hammer')return;
    const result=Game.hammerStrike();
    if(!result?.ok)return;
    const box=hit.getBoundingClientRect();
    hit.style.setProperty('--hit-x',(e.detail>0?e.clientX-box.x:box.width*.5)+'px');
    hit.style.setProperty('--hit-y',(e.detail>0?e.clientY-box.y:box.height*.48)+'px');
    hit.classList.remove('is-striking');stage.classList.remove('forge-hit-stop');
    void hit.offsetWidth;hit.classList.add('is-striking');stage.classList.add('forge-hit-stop');
    clearTimeout(hit._feelTimer);hit._feelTimer=setTimeout(()=>stage.classList.remove('forge-hit-stop'),90);
    hit.querySelector('.forge-hammer-float').textContent='+'+Math.round(result.strike?.statGain||0);
    // No old WebGL fireworks: restrained local metal contact feedback instead.
    if(result.fractured||run.fractured){render();return;}
    refresh(result.strike);
  });
  refresh();
}

/**
 * S7 · Precision honing.
 * The active GLB drives the target: a subtle wire directly on the real metal,
 * with a small whetstone polishing head and a progressively revealed satin edge.
 *
 * The only grade is proximity/fit. Three complete one-finger passes are
 * available, with a small disclosed bonus for finishing earlier. All rewards
 * still go through Game.submitEdge / core/edge (no duplicated stat logic).
 */
export function renderEdgeV4({body,run,stage,Game,getStage,render,toast}) {
  const question=stage.querySelector('.stage-question');
  if(question)question.textContent='沿刀锋收光 · 三次精磨机会';
  stage.classList.add('edge-honing-active');
  const canvas=el('canvas',{class:'edge-stage-canvas edge-honing-surface',
    'aria-label':'按住刀根的起点，沿真实刀刃轮廓滑动至终点'});
  stage.appendChild(canvas);
  const ctx=canvas.getContext('2d',{alpha:true});
  const hud=el('div',{class:'edge-simple-hud edge-honing-hud',role:'status'});
  const fitValue=el('b',{text:'—'});
  const countValue=el('b',{text:'0 / 3'});
  const sharpValue=el('b',{text:'+0'});
  hud.append(
    el('div',{class:'edge-honing-primary'},[el('small',{text:'最佳贴合'}),fitValue]),
    el('div',{},[el('small',{text:'磨刃次数'}),countValue]),
    el('div',{class:'edge-hud-result'},[el('small',{text:'预计锋利'}),sharpValue])
  );
  const bar=el('div',{class:'edge-simple-rail edge-honing-progress','aria-label':'当前研刃进度'},[el('i')]);
  const hint=el('div',{class:'edge-simple-hint edge-honing-hint',role:'status','aria-live':'polite'});
  const action=el('div',{class:'edge-simple-actions edge-honing-actions'});
  const again=el('button',{class:'btn edge-retry',type:'button',text:'再描一次'});
  const finish=el('button',{class:'btn btn--primary edge-finish',type:'button',text:'完成开刃'});
  const skip=el('button',{class:'edge-skip',type:'button',text:'跳过'});
  action.append(again,finish,skip);
  body.append(hud,bar,hint,action);
  const n=48;
  let path=null,active=null,previous=null,lastIndex=0;
  let frame=0,disposed=false,dirty=true;
  let attempts=0,best=null,bestFit=-1,locked=false,cursor=null;
  let samples=new Map(),lastHud=0,lastBuzzIndex=-9;
  let currentModel=null,tolerance=26;
  const asArray=map=>[...map].map(([index,value])=>({index,value}));
  const score=(map,used)=>Edge.contourPreview(asArray(map),Math.max(1,used));
  const currentBest=()=>score(best||samples,Math.max(1,attempts));
  const isReduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  function haptic(ms=5){
    try{if(!isReduced&&typeof navigator.vibrate==='function')navigator.vibrate(ms);}catch(_){}
  }
  function feedback(force=false){
    const now=performance.now();
    if(!force&&now-lastHud<75)return;
    lastHud=now;
    const data=currentBest(),live=score(samples,Math.max(1,attempts+1));
    const percentage=Math.round(data.fit*100);
    fitValue.textContent=(best?percentage:(active!==null?Math.round(live.fit*100):0))+'%';
    countValue.textContent=attempts+' / 3';
    sharpValue.textContent='+'+(best?data.sharp:0);
    bar.firstChild.style.width=Math.round(((active!==null?lastIndex/(n-1):(best?data.coverage:0))*100))+'%';
    finish.disabled=attempts<1;
    again.disabled=attempts<1||attempts>=3||!locked;
    again.setAttribute('aria-label',attempts<3?'再描一次 ('+(3-attempts)+' 次剩余)':'次数已用完');
    if(attempts===0&&active===null)hint.textContent='按住金色起点，沿两侧刀锋滑动 · 磨到终点';
    else if(active!==null)hint.textContent='保持贴刃 · 当前覆盖 '+Math.round(live.coverage*100)+'%';
    else if(!locked)hint.textContent='从刀根起点重新描磨';
    else hint.textContent='贴合 '+percentage+'% · 基础 +'+data.baseSharp+' ×'+data.multiplier.toFixed(2)
      +' · 收光 +'+data.bonus+' = 锋利 +'+data.sharp;
  }
  function setup(){
    const b=canvas.getBoundingClientRect();
    if(!b.width||!b.height)return;
    const dpr=Math.min(2,globalThis.devicePixelRatio||1);
    const width=Math.round(b.width*dpr),height=Math.round(b.height*dpr);
    if(canvas.width!==width||canvas.height!==height){
      canvas.width=width;canvas.height=height;
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    path=bladeContourProjection(getStage(),b.width,b.height);
    currentModel=getStage()?.modelId;
    tolerance=Math.max(20,Math.min(30,b.width*.073));
    dirty=false;
    if(!path)hint.textContent='正在校准真实刀刃…';
  }
  function draw(){
    frame=0;
    if(disposed||!canvas.isConnected)return;
    if(dirty||!path||currentModel!==getStage()?.modelId)setup();
    if(!path)return;
    renderHoningArtwork(ctx,path,{
      best,samples,active:active!==null,cursor,
      progress:lastIndex/(n-1),showStart:active===null,
      finished:locked,quality:bestFit,
    });
  }
  function repaint(){if(!frame&&!disposed)frame=requestAnimationFrame(draw);}
  // Project the finger into nearby contour segments, never jump to an unrelated
  // section on the opposite side of the knife.
  function nearest(x,y){
    if(!path)return null;
    let closest=null;
    const from=active===null?0:Math.max(0,lastIndex-2);
    const to=active===null?Math.min(5,n-2):Math.min(n-2,lastIndex+7);
    for(let i=from;i<=to;i++){
      const a=path[i],b=path[i+1],dx=b.x-a.x,dy=b.y-a.y;
      const t=Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/(dx*dx+dy*dy||1)));
      const xx=a.x+dx*t,yy=a.y+dy*t,dist=Math.hypot(x-xx,y-yy);
      if(!closest||dist<closest.distance)closest={index:Math.min(n-1,Math.round(i+t)),distance:dist};
    }
    return closest;
  }
  function sample(x,y){
    const near=nearest(x,y);
    if(!near)return;
    cursor={...near,tolerance};
    if(near.index<lastIndex-1||near.distance>tolerance*1.55)return;
    const next=Math.max(lastIndex,near.index);
    // The movement is resampled every 4 CSS px. Credit only visited cells,
    // not missing sections; quality remains the physical distance to the edge.
    const value=.5+Math.min(tolerance,near.distance)/(2*tolerance);
    for(let i=lastIndex;i<=next;i++)
      samples.set(i,Math.min(samples.has(i)?samples.get(i):1,value));
    if(next>=lastBuzzIndex+12&&next>3){
      lastBuzzIndex=next;haptic(4);
      if(Audio.settings().enabled)Audio.play('hone');
    }
    lastIndex=next;
  }
  function position(e){
    const b=canvas.getBoundingClientRect();
    return {x:e.clientX-b.left,y:e.clientY-b.top};
  }
  function moveTo(e){
    const p=position(e);
    if(previous){
      const dist=Math.hypot(p.x-previous.x,p.y-previous.y);
      const steps=Math.max(1,Math.min(150,Math.ceil(dist/4)));
      for(let i=1;i<=steps;i++){
        const t=i/steps;
        sample(previous.x+(p.x-previous.x)*t,previous.y+(p.y-previous.y)*t);
      }
    }else sample(p.x,p.y);
    previous=p;
    feedback();repaint();
  }
  function endStroke(e){
    if(active!==e.pointerId)return;
    const id=active;active=null;previous=null;cursor=null;
    try{if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);}catch(_){}
    // Cancellation (incoming call, gesture interruption) never burns a chance.
    if(e.type==='pointercancel'){
      samples.clear();lastIndex=0;feedback(true);repaint();return;
    }
    // Short accidental contact is not an attempt.
    if(samples.size>=8){
      attempts++;
      const candidate=score(samples,1);
      if(candidate.eligible&&candidate.fit>bestFit){
        bestFit=candidate.fit;best=new Map(samples);
      }
      locked=true;
      haptic(candidate.eligible?12:6);
      if(candidate.eligible&&Audio.settings().enabled)Audio.play('honeFinish');
    }else{
      samples.clear();lastIndex=0;
    }
    feedback(true);repaint();
  }
  canvas.addEventListener('pointerdown',e=>{
    if(disposed||locked||active!==null||attempts>=3||e.isPrimary===false)return;
    if(!path)setup();if(!path)return;
    const p=position(e);
    if(Math.hypot(p.x-path[0].x,p.y-path[0].y)>42)return;
    active=e.pointerId;lastIndex=0;previous=null;cursor=null;
    lastBuzzIndex=-9;samples.clear();
    try{canvas.setPointerCapture(active);}catch(_){}
    if(Audio.settings().enabled)Audio.unlock();
    haptic(6);moveTo(e);feedback(true);
    e.preventDefault();
  },{passive:false});
  canvas.addEventListener('pointermove',e=>{
    if(active!==e.pointerId)return;
    for(const p of (e.getCoalescedEvents?.()||[]))moveTo(p);
    moveTo(e);e.preventDefault();
  },{passive:false});
  canvas.addEventListener('pointerup',endStroke);
  canvas.addEventListener('pointercancel',endStroke);
  again.addEventListener('click',()=>{
    if(!locked||attempts>=3)return;
    samples.clear();lastIndex=0;previous=null;cursor=null;locked=false;
    feedback(true);repaint();
  });
  function commit(skipped){
    if(!skipped&&attempts<1)return;
    const data=best?asArray(best):[];
    const result=Game.submitEdge(skipped?null:data,{skipped,projected:true,attemptsUsed:Math.max(1,attempts)});
    if(!result?.ok){toast('开刃结算失败','warn');return;}
    const e=result.edge||{};
    toast('刃口贴合 '+Math.round((e.fit||0)*100)+'% ×'+(e.multiplier||1).toFixed(2)
      +' · 锋利 +'+(e.sharp||0),e.sharp?'good':'info');
    render();
  }
  finish.addEventListener('click',()=>commit(false));
  skip.addEventListener('click',()=>commit(true));
  const observer=new ResizeObserver(()=>{if(active===null){dirty=true;repaint();}});
  observer.observe(canvas);
  const initial=setTimeout(()=>{dirty=true;repaint();},700);
  const onBlur=()=>{
    if(active!==null){active=null;previous=null;cursor=null;samples.clear();lastIndex=0;feedback(true);repaint();}
  };
  globalThis.addEventListener('blur',onBlur);
  repaint();feedback(true);
  return ()=>{
    disposed=true;observer.disconnect();clearTimeout(initial);
    globalThis.removeEventListener('blur',onBlur);
    if(frame)cancelAnimationFrame(frame);
    stage.classList.remove('edge-honing-active');
    canvas.remove();
  };
}
