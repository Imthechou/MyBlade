/**
 * S7 precision honing artwork.
 *
 * The GLB and its real PBR material stay visible. This 2D overlay only paints
 * a faint etched cutting-edge guide, a growing satin polish, and a small
 * whetstone contact head. No neon silhouette, fireworks or full-screen flashes.
 *
 * All coordinates are in CSS pixels, supplied by bladeContourProjection.
 */
const TAU=Math.PI*2;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const rgba=(a)=>'rgba(249,247,239,'+a+')';

function stroke(ctx,points,color,width,blur=0){
  if(points.length<2)return;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(points[0].x,points[0].y);
  for(let i=1;i<points.length;i++)ctx.lineTo(points[i].x,points[i].y);
  ctx.strokeStyle=color;ctx.lineWidth=width;
  ctx.lineCap='round';ctx.lineJoin='round';
  if(blur){ctx.shadowColor=color;ctx.shadowBlur=blur;}
  ctx.stroke();ctx.restore();
}
function partition(path,values){
  if(!values?.size)return [];
  const segments=[];let current=[];
  for(let i=0;i<path.length;i++){
    if(values.has(i)) current.push(path[i]);
    else {if(current.length>1)segments.push(current);current=[];}
  }
  if(current.length>1)segments.push(current);
  return segments;
}
function pointOn(path,index){
  return path[clamp(Math.floor(index),0,path.length-1)];
}
function tangent(path,index){
  const a=pointOn(path,index-1),b=pointOn(path,index+1);
  return Math.atan2(b.y-a.y,b.x-a.x);
}
function startMarker(ctx,p,ready){
  ctx.save();
  ctx.beginPath();ctx.arc(p.x,p.y,ready?12:8,0,TAU);
  ctx.fillStyle=ready?'rgba(237,218,177,.14)':'rgba(255,255,255,.06)';
  ctx.fill();
  ctx.strokeStyle=ready?'rgba(150,113,70,.72)':'rgba(76,88,100,.44)';
  ctx.lineWidth=ready?1.4:1;ctx.stroke();
  ctx.beginPath();ctx.arc(p.x,p.y,3,0,TAU);
  ctx.fillStyle=ready?'#a98c62':'rgba(102,111,119,.6)';ctx.fill();
  if(ready){
    const left=clamp(p.x-42,6,ctx.canvas.width-86),top=Math.max(10,p.y-42);
    ctx.fillStyle='rgba(254,251,245,.92)';
    ctx.strokeStyle='rgba(159,146,123,.45)';
    ctx.lineWidth=.8;
    ctx.beginPath();ctx.roundRect(left,top,83,25,10);ctx.fill();ctx.stroke();
    ctx.fillStyle='#5e5b55';ctx.font='500 11px system-ui,sans-serif';
    ctx.textAlign='center';ctx.fillText('从这里起磨',left+41.5,top+16.5);
  }
  ctx.restore();
}
function stone(ctx,p,angle,good,fit=0){
  if(!p)return;
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);
  // restrained contact reflection, physically attached to the knife contour
  const halo=ctx.createRadialGradient(0,0,1,0,0,18);
  halo.addColorStop(0,good?'rgba(228,195,139,.22)':'rgba(96,122,133,.12)');
  halo.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle=halo;ctx.beginPath();ctx.arc(0,0,18,0,TAU);ctx.fill();
  ctx.fillStyle=good?'rgba(92,99,102,.88)':'rgba(133,137,138,.75)';
  ctx.strokeStyle=good?'rgba(251,238,208,.95)':'rgba(255,255,255,.65)';
  ctx.lineWidth=1.1;
  ctx.beginPath();ctx.roundRect(-11,-5,22,10,3);ctx.fill();ctx.stroke();
  // bevel facet
  ctx.strokeStyle=good?'rgba(255,244,221,.93)':'rgba(229,236,240,.67)';
  ctx.lineWidth=1.1;
  ctx.beginPath();ctx.moveTo(-7,-2);ctx.lineTo(6,-2);ctx.stroke();
  ctx.restore();
  // contact dust: micro filings only, no energetic particles / fireworks.
  if(good){
    ctx.save();ctx.translate(p.x,p.y);ctx.rotate(angle);
    ctx.strokeStyle='rgba(188,148,96,.40)';ctx.lineWidth=.8;
    for(let k=0;k<3;k++){
      const xx=-13-k*3,yy=(k%2?.9:-1.5);
      ctx.beginPath();ctx.moveTo(xx,yy);ctx.lineTo(xx-2.5,yy+(k-1)*1.2);ctx.stroke();
    }
    ctx.restore();
  }
}
export function renderHoningArtwork(ctx,path,{
  best=null, samples=null, active=false, cursor=null,
  progress=0, showStart=true, finished=false, quality=0,
}={}){
  if(!ctx||!path?.length)return;
  const w=ctx.canvas.clientWidth,h=ctx.canvas.clientHeight;
  ctx.clearRect(0,0,w,h);

  // The real knife should be the star. Two hairlines describe the polishing
  // channel; no broad bright cyan outline covering the PBR blade.
  stroke(ctx,path,'rgba(41,55,64,.22)',6.5);
  stroke(ctx,path,'rgba(255,255,255,.38)',1.55);
  stroke(ctx,path,'rgba(96,112,124,.27)',.7);

  if(best?.size){
    for(const part of partition(path,best)){
      stroke(ctx,part,'rgba(56,77,82,.28)',5.4);
      stroke(ctx,part,'rgba(248,248,243,.83)',2.1,2.2);
    }
  }
  if(samples?.size){
    for(const part of partition(path,samples)){
      stroke(ctx,part,'rgba(181,143,88,.23)',7);
      stroke(ctx,part,rgba(.96),2.15,2.4);
    }
    // Small brushed-metal bevel marks perpendicular to the cut, tied to
    // actual covered points rather than using a flashy generic animation.
    ctx.save();ctx.lineWidth=.65;ctx.strokeStyle='rgba(250,237,211,.36)';
    for(const idx of samples.keys()){
      if(idx%3!==0)continue;
      const p=path[idx],a=tangent(path,idx),nx=-Math.sin(a),ny=Math.cos(a);
      ctx.beginPath();ctx.moveTo(p.x+nx*1.7,p.y+ny*1.7);
      ctx.lineTo(p.x+nx*5,p.y+ny*5);ctx.stroke();
    }
    ctx.restore();
  }

  if(showStart)startMarker(ctx,path[0],!active && !finished);
  // A calm terminal notch for an intentional endpoint.
  const end=path[path.length-1];
  ctx.save();ctx.beginPath();ctx.arc(end.x,end.y,3.3,0,TAU);
  ctx.fillStyle=finished?'#b99962':'rgba(94,103,107,.48)';ctx.fill();ctx.restore();

  if(active&&cursor){
    const near=pointOn(path,cursor.index);
    stone(ctx,near,tangent(path,cursor.index),cursor.distance<=cursor.tolerance);
    if(progress>=.05){
      ctx.save();ctx.font='650 12px system-ui,sans-serif';
      const value=Math.round(progress*100)+'%';
      const bx=clamp(near.x-22,8,w-50),by=clamp(near.y-38,8,h-35);
      ctx.fillStyle='rgba(255,253,248,.9)';
      ctx.beginPath();ctx.roundRect(bx,by,44,24,10);ctx.fill();
      ctx.fillStyle='#57565b';ctx.textAlign='center';ctx.fillText(value,bx+22,by+16);
      ctx.restore();
    }
  }
  if(finished&&best?.size){
    // Tiny travelling satin catchlight is intentionally static at rest,
    // preventing a second always-running animation loop.
    const idx=Math.round(clamp(quality,0,1)*(path.length-1));
    const p=path[idx];
    ctx.save();ctx.beginPath();ctx.arc(p.x,p.y,2.4,0,TAU);
    ctx.fillStyle='rgba(250,245,222,.76)';ctx.fill();ctx.restore();
  }
}
