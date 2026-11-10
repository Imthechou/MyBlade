/**
 * Hand-authored 2D ink marks for the arena specimen props.
 * No image-generation/atlas dependencies; deliberately sits over (not inside)
 * the material sprite. Small, fixed marks must never obscure a slash or change
 * hit testing, physics, RNG or the 45-second match clock.
 */
export const MARK_INKS = Object.freeze({
  rope:'#77583E', foam:'#168C77', wood:'#8C5339',
  plastic:'#536D9A', ice:'#387FA6', metal:'#445F78',
});
export const MARK_TYPES = Object.freeze(['rope','foam','wood','plastic','ice','metal']);
export function handmarkMetrics(width,height,unit) {
  const w=Math.max(0,Number(width)||0),h=Math.max(0,Number(height)||0);
  const u=Math.max(0,Number(unit)||0);
  // A single 2D ink sticker: 11-15px on most 390px phones.
  const radius=Math.max(4,Math.min(8.5,u*.093));
  return {radius,offsetX:w*.295,offsetY:-h*.30,inkWidth:Math.max(1.3,radius*.21)};
}
export function drawTargetHandmark(ctx,target,x,y,width,height,unit) {
  const type=target?.type,ink=MARK_INKS[type];
  if(!ctx||!ink||!(width>0)||!(height>0))return;
  const {radius:r,offsetX,offsetY,inkWidth}=handmarkMetrics(width,height,unit);
  ctx.save();
  ctx.translate(x+offsetX,y+offsetY);
  // Flat ivory sticker, modest wobble in the outline: deliberately not
  // realistic material texturing and not a loud badge over the knife path.
  ctx.globalAlpha=.90;
  ctx.fillStyle='rgba(255,253,245,.79)';
  ctx.strokeStyle=ink;ctx.lineWidth=inkWidth;ctx.lineCap='round';ctx.lineJoin='round';
  ctx.beginPath();
  ctx.moveTo(-r*.96,-r*.57);
  ctx.quadraticCurveTo(-r*1.06,-r*.98,-r*.43,-r*1.05);
  ctx.lineTo(r*.65,-r*.91);
  ctx.quadraticCurveTo(r*1.1,-r*.86,r*1.03,-r*.22);
  ctx.lineTo(r*.91,r*.69);
  ctx.quadraticCurveTo(r*.88,r*1.06,r*.26,r*.97);
  ctx.lineTo(-r*.66,r*.89);
  ctx.quadraticCurveTo(-r*1.05,r*.78,-r*.96,r*.26);
  ctx.closePath();ctx.fill();ctx.stroke();
  ctx.beginPath();
  if(type==='rope'){
    ctx.ellipse(-r*.20,0,r*.40,r*.32,-.5,0,Math.PI*2);
    ctx.moveTo(-r*.06,-r*.45);ctx.lineTo(r*.47,r*.42);
  }else if(type==='foam'){
    // A small, friendly two-dot foam cell, not a cartoon face on every prop.
    for(const dx of [-.32,.28]){ctx.moveTo(r*dx+r*.16,-r*.13);ctx.arc(r*dx,-r*.13,r*.16,0,Math.PI*2);}
    ctx.moveTo(-r*.31,r*.35);ctx.quadraticCurveTo(0,r*.55,r*.36,r*.29);
  }else if(type==='wood'){
    ctx.moveTo(-r*.52,-r*.47);ctx.bezierCurveTo(-r*.10,-r*.56,-r*.27,r*.25,r*.29,r*.37);
    ctx.moveTo(-r*.15,-r*.53);ctx.bezierCurveTo(r*.40,-r*.34,-r*.05,r*.28,r*.52,r*.49);
  }else if(type==='plastic'){
    ctx.moveTo(0,-r*.55);ctx.lineTo(r*.49,0);ctx.lineTo(0,r*.53);
    ctx.lineTo(-r*.48,0);ctx.closePath();
    ctx.moveTo(-r*.23,0);ctx.lineTo(r*.22,0);
  }else if(type==='ice'){
    for(let i=0;i<3;i++){
      const a=i*Math.PI/3;
      ctx.moveTo(Math.cos(a)*r*.54,Math.sin(a)*r*.54);
      ctx.lineTo(-Math.cos(a)*r*.54,-Math.sin(a)*r*.54);
    }
  }else{
    // Metal = little stamped rivet, not a lightning bolt/sparkle.
    ctx.arc(0,0,r*.38,0,Math.PI*2);
    ctx.moveTo(-r*.2,0);ctx.lineTo(r*.2,0);
    ctx.moveTo(0,-r*.20);ctx.lineTo(0,r*.20);
  }
  ctx.stroke();
  ctx.restore();
}
