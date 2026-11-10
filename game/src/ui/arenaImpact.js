/**
 * 切割冲击视觉/音效参数：只读 core 接触判定，不更改 45 秒游戏时钟或伤害。
 * 顿帧采用短时间「物体压缩保持」，不是阻塞 JS/RAF，更不会卡住触控输入。
 */
export const IMPACT_PRESETS=Object.freeze({
  foam:   Object.freeze({weight:.20,hold:12,recoil:1.4,shake:.10,particles:0,sound:'soft'}),
  rope:   Object.freeze({weight:.31,hold:16,recoil:1.8,shake:.16,particles:1,sound:'fiber'}),
  wood:   Object.freeze({weight:.59,hold:28,recoil:3.0,shake:.26,particles:2,sound:'wood'}),
  plastic:Object.freeze({weight:.69,hold:32,recoil:3.4,shake:.30,particles:2,sound:'plastic'}),
  ice:    Object.freeze({weight:.77,hold:36,recoil:4.0,shake:.35,particles:3,sound:'ice'}),
  metal:  Object.freeze({weight:1.00,hold:46,recoil:4.8,shake:.42,particles:2,sound:'metal'}),
});
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
export function cutImpact(hit,{reducedMotion=false}={}) {
  const material=hit?.target?.type || hit?.type || 'rope';
  const preset=IMPACT_PRESETS[material]||IMPACT_PRESETS.rope;
  const event=hit?.contactEvent || (hit?.complete?'kill':'cut');
  const completed=!!hit?.complete;
  const blocked=event==='blocked'||event==='deflect'||event==='avoid-hit';
  const power=completed?1.2:blocked?.75:.87;
  const quality=hit?.quality==='PERFECT'?1.08:hit?.quality==='ANGLE'?.83:1;
  const factor=power*quality;
  const angle=Number.isFinite(hit?.angle)?hit.angle:0;
  return {
    material,event,completed,angle,
    weight:preset.weight, sound:preset.sound,
    holdMs:reducedMotion?0:Math.round(preset.hold*factor),
    recoilPx:reducedMotion?0:Number((preset.recoil*factor).toFixed(2)),
    shakePx:reducedMotion?0:Number((2.8*preset.shake*factor).toFixed(2)),
    particleCount:reducedMotion||blocked?0:clamp(Math.round(preset.particles*factor),0,3),
    flashMs:reducedMotion?0:clamp(Math.round(35+20*preset.weight),35,60),
    hapticMs:clamp(Math.round((completed?9:4)+(preset.weight*(completed?19:9))),4,28),
  };
}
export function impactMotion(event,now) {
  if(!event || !Number.isFinite(now)||!Number.isFinite(event.at))return null;
  const age=now-event.at;
  if(age<0||age>Math.max(event.holdMs+150,155))return null;
  const hold=event.holdMs||0;
  const settle=clamp((age-hold)/120,0,1);
  // 第一段短促压缩 + 定格，第二段迅速回弹；不修改任何实际靶具坐标。
  return {compress:age<hold?1:Math.max(0,1-settle)**2,
    recoil:age<hold?0:Math.sin(settle*Math.PI)*Math.max(0,1-settle),
    age};
}

/** Pure visual pose. Never moves collision centers, consumes RNG or changes time. */
export function targetPose(target, now, age = 1, reduced = false) {
  if(reduced)return {angle:0,x:0,y:0,scaleX:1,scaleY:1};
  let hash=2166136261;
  for(const c of String(target?.id||target?.type||''))hash=Math.imul(hash^c.charCodeAt(0),16777619)>>>0;
  const phase=hash/4294967296*Math.PI*2;
  const weight=IMPACT_PRESETS[target?.type]?.weight??.5;
  const soft=1-weight;
  const t=(Number(now)||0)*.001;
  const entry=Math.max(0,Math.min(1,Number(age)||0));
  const spring=Math.sin(entry*22)*Math.exp(-entry*10)*(0.035+soft*.065);
  return {
    angle:(Math.sin(phase)*.012+Math.sin(t*(1+soft*.55)+phase)*(.006+soft*.022))
      +Math.sin(entry*18+phase)*Math.exp(-entry*12)*soft*.03,
    x:Math.sin(t*.93+phase)*(.15+soft*.55),
    y:Math.sin(t*1.19+phase)*(.10+soft*.42),
    scaleX:1+spring*.45,
    scaleY:1-spring,
  };
}
