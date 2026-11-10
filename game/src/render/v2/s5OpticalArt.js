/** S5 optical treatment, NOT S3 forged texture or a replacement normal map.
 * R: spectral position, G: film coverage, B: polish, A: dielectric topcoat.
 * Bake once per card/run; one filtered lookup replaces per-fragment FBM and
 * 25 procedural branches. One stable DataTexture per LIVE material bounds
 * storage to 128 KiB/material; updates reuse its allocation, disposal follows
 * the material. Simultaneous collection previews never overwrite each other.
 * Source ideas: CS2-SP-Workshop-Tools customweapon.glsl (separate metal/paint
 * channels), Filament material model (dielectric coat over metallic substrate).
 * All artwork/math below is original. No Valve textures or shader code copied.
 */
const W = 256, H = 128, TAU = Math.PI * 2;
const clamp = x => Math.min(1, Math.max(0, x));
const smooth = (a,b,x) => { const t=clamp((x-a)/(b-a)); return t*t*(3-2*t); };
const band = (x,w) => 1-smooth(w,w+0.035,Math.abs(x));
const textures = new WeakMap();
export function s5Pattern(cardId, seeds=[]) {
  const id=Number(String(cardId).slice(3));
  if (!(id>=1 && id<=25)) return {id:0,seed:0,rare:false,variant:'none'};
  let h=2166136261;
  // seeds[0] is the selected S3 pattern index. It must NOT reroll S5 art.
  for(const x of [id,...Array.from({length:3},(_,i)=>Number(seeds[i+1])||0)]) {
    h=Math.imul(h ^ Math.round(x*100003),16777619)>>>0;
  }
  const seed=h/4294967296;
  // Cosmetic only. No gameplay RNG consumption, card rarity or odds changed.
  const rare=seed<0.065;
  const variants={14:'冰火断层',16:'蓝宝石心',18:'蓝域',19:'满渐变',20:'双相流星',
    21:'星核',22:'紫金蚀界',23:'极昼',24:'极光天幕'};
  return {id,seed,rare,variant:rare?(variants[id]||'精密晶界'):'标准晶相'};
}

export function bakeS5Optical(cardId, seeds=[]) {
  const meta=s5Pattern(cardId,seeds), {id,seed,rare}=meta;
  const data=new Uint8Array(W*H*4);
  if (!id) return {data,width:W,height:H,...meta};
  const phase=seed*TAU, shift=(seed-0.5)*0.27, zoom=0.84+seed*0.32;
  const hasFlow=[1,6,7,12,14,18,20,21,22,24].includes(id);
  const hasCloud=[5,16,18,19,23].includes(id);
  const hasFine=[8,9,21,25].includes(id);
  for(let y=0;y<H;y++) for(let x=0;x<W;x++) {
    const u=x/(W-1), v=y/(H-1), a=u*zoom+shift, b=v-0.5+shift*0.4;
    const flow=hasFlow ? Math.sin(a*8.2+phase+b*3.4)*0.19
      + Math.sin(a*15.7-b*6.2+phase*1.31)*0.065 : 0;
    const cloud=hasCloud ? clamp(0.5+Math.sin(a*9.7+b*5.1+phase)*0.23
      + Math.cos(a*4.3-b*12.3+phase*0.7)*0.18
      + Math.sin(a*23.7+b*17.3-phase)*0.065) : 0.5;
    // Fine *optical* mottling, not a new relief/normal texture.
    const fine=hasFine ? 0.5+0.5*Math.sin(x*2.17+y*1.91+phase)*Math.cos(y*2.73-x*0.79) : 0.5;
    let p=0.5,mask=0.8,polish=0.42,coat=0.1;
    switch(id) {
      case 1: { const veil=0.5+0.5*Math.cos(b*5.6+a*1.8+flow);
        p=0.15+veil*0.66; mask=0.42+veil*0.40; polish=0.36+veil*0.15; break; }
      case 2: { const hamon=band(b-0.25-Math.sin(a*18+phase)*0.052,0.045);
        p=hamon*0.80+0.10; mask=0.30+hamon*0.66; polish=0.48-hamon*0.34; coat=hamon*0.55; break; }
      case 3: { const panel=band(b+0.06,0.17);
        p=panel*0.7; mask=0.62; polish=0.69-panel*0.43; coat=panel*0.15; break; }
      case 4: { const chevron=0.5+0.5*Math.sin((a+Math.abs(b)*0.7)*95+phase);
        p=chevron; mask=0.52; polish=0.24+chevron*0.35; coat=0.12; break; }
      case 5: { const mineral=smooth(0.35,0.67,cloud);
        p=mineral; mask=0.45+mineral*0.3; polish=0.28+mineral*0.22; coat=0.23; break; }
      case 6: { const smoke=0.5+0.5*Math.sin(b*10+flow*6+a*3);
        p=smoke*0.7; mask=0.92; polish=0.34+smoke*0.16; coat=0.30; break; }
      case 7: { const pool=Math.hypot((a-0.45)*0.9,b+flow*0.25);
        p=0.5+0.5*Math.sin(pool*13+phase); mask=0.4+p*0.39; polish=0.25; coat=0.56; break; }
      case 8: { const ribbon=band(b-a*0.32+0.14,0.08);
        p=fine*0.55; mask=0.55; polish=0.71-ribbon*0.25+fine*0.04; coat=ribbon*0.16; break; }
      case 9: { const lane=band(b+0.03,0.09);
        p=0.4+lane*0.35; mask=0.28; polish=0.065+fine*0.025; coat=0.70; break; }
      case 10: { const cell=Math.floor(a*7)+Math.floor((b+0.5)*5)*3;
        p=(Math.sin(cell*2.73+phase)+1)*0.5; mask=0.88; polish=0.27+p*0.25; coat=0.28; break; }
      case 11: { const window=band(a-0.53+Math.sin(b*5+phase)*0.07,0.055);
        p=window; mask=0.38+window*0.56; polish=0.38-window*0.21; coat=window*0.62; break; }
      case 12: { const fold=0.5+0.5*Math.sin(b*59+flow*9+phase);
        p=fold; mask=0.45+fold*0.35; polish=0.26+fold*0.27; coat=0.22; break; }
      case 13: { const rim=smooth(0.09,0.43,Math.abs(b));
        p=clamp(a*0.44+rim*0.45); mask=0.25+rim*0.62; polish=0.36-rim*0.20; coat=0.58; break; }
      case 14: { const fracture=Math.abs(Math.sin(a*7.5+b*4+flow*3+phase));
        p=clamp(fracture*1.22-0.12); if(rare)p=clamp((p-0.45)*3+0.5);
        mask=0.94; polish=0.13+band(fracture-0.6,0.03)*0.17; coat=0.76; break; }
      case 15: { const strata=0.5+0.5*Math.sin((a*0.68+b*0.9)*17+phase);
        p=strata; mask=0.88; polish=0.23+strata*0.12; coat=0.46; break; }
      case 16: { const blue=smooth(rare?0.25:0.56,rare?0.55:0.72,cloud);
        p=clamp(0.73-blue*0.55+band(cloud-0.54,0.025)*0.2);
        mask=0.89; polish=0.26-blue*0.13; coat=0.37+blue*0.25; break; }
      case 17: { const plate=Math.abs(Math.sin(a*27+Math.floor((b+0.5)*8)*0.8));
        p=smooth(0.15,0.3,plate); mask=0.91; polish=0.28+p*0.24; coat=0.19; break; }
      case 18: { const belt=band(b+Math.sin(a*8+phase)*0.15,rare?0.44:0.21);
        p=clamp(0.76-belt*0.57+(cloud-0.5)*0.22); mask=0.94;
        polish=0.29-belt*0.16; coat=0.48+belt*0.20; break; }
      case 19: { p=clamp((u+shift)*(rare?1.22:0.90)+(cloud-0.5)*0.075);
        mask=0.95; polish=0.13+(cloud-0.5)*0.065; coat=0.76; break; }
      case 20: { const liquid=0.5+0.5*Math.sin(b*5.5+a*4.5+flow*7+phase);
        p=rare?clamp(liquid*1.45-0.15):liquid; mask=0.96;
        polish=0.12+smooth(0.64,0.9,liquid)*0.12; coat=0.82; break; }
      case 21: { const gem=0.5+0.5*Math.sin(b*8+a*3+flow*6+phase);
        p=clamp(0.19+gem*0.65+fine*(rare?0.15:0.045)); mask=0.96;
        polish=0.10+gem*0.045; coat=0.88; break; }
      case 22: { const erosion=Math.abs(Math.sin(a*8-b*5+flow*9+phase));
        p=Math.pow(erosion,4); mask=0.96; polish=0.30-p*0.18;
        coat=0.36+p*0.44; if(rare)p=clamp(p*1.4); break; }
      case 23: { p=clamp(u+(cloud-0.5)*0.12+shift);
        mask=rare?0.94:0.83; polish=0.20-(u*0.09); coat=0.61; break; }
      case 24: { const sky=0.5+0.5*Math.sin(b*8+flow*3+a*1.6+phase);
        p=clamp(0.15+sky*0.66); mask=0.96; polish=0.11+sky*0.08;
        coat=0.85; if(rare)p=clamp(p+0.15*Math.sin(a*11+b*8)); break; }
      case 25: { p=0.5; mask=0.12; polish=0.12+fine*0.025; coat=0.28; break; }
    }
    if(rare && id<14) { polish*=0.86; coat=clamp(coat+0.12); }
    const i=(y*W+x)*4;
    data[i]=Math.round(clamp(p)*255); data[i+1]=Math.round(clamp(mask)*255);
    data[i+2]=Math.round(clamp(polish)*255); data[i+3]=Math.round(clamp(coat)*255);
  }
  return {data,width:W,height:H,...meta};
}

// Neutral cards use tinted reflectance in the S1 metal, never opaque paint.
export const S5_OPTICAL_PALETTES={
  1:['#273b51','#547b9c','#91bed0','#c6d5dc'],
  2:['#3d5262','#7e9ba8','#b3d5da','#5ea9bd'],
  3:['#4b535b','#76818b','#929da5','#b6c1c5'],
  4:['#424d58','#6c8797','#aab9c0','#5e7687'],
  5:['#635c49','#aea78c','#c8c6ae','#8eaaa6'],
  6:['#121c26','#253340','#3e5360','#71828d'],
  7:['#2f557c','#568a9c','#8f719b','#cda76c'],
  8:['#69747b','#879198','#adb8bd','#c0c4c3'],
  9:['#56636f','#8f9fa9','#bcc9cd','#d5dfe1'],
  10:['#192632','#344958','#637b87','#9aadb2'],
  11:['#405f7b','#708c9d','#8d7440','#e3c779'],
  12:['#283941','#405b67','#7b929c','#a8bcc2'],
  13:['#477c9b','#7ba3b6','#8570ac','#d8b582'],
  17:['#17282e','#2e464e','#57676b','#8c9997'],
  25:['#738590','#8c9ea9','#a3b3bc','#b4c2ca'],
};

export function getS5OpticalTexture(THREE,cardId,seeds=[],chosen=false,owner=THREE) {
  const id=chosen?Number(String(cardId).slice(3)):0;
  const key=id>=1&&id<=25?id:0;
  const meta=s5Pattern(cardId,seeds), stamp=key+':'+(key?meta.seed:-1);
  const target=owner || THREE;
  let entry=textures.get(target);
  if(entry?.stamp===stamp) return entry.texture;
  const bake=key?bakeS5Optical(cardId,seeds):{data:new Uint8Array(W*H*4),width:W,height:H};
  if(!entry) {
    const texture=new THREE.DataTexture(bake.data,bake.width,bake.height,THREE.RGBAFormat);
    texture.name='S5 optical film '+key;
    texture.minFilter=texture.magFilter=THREE.LinearFilter;
    texture.wrapS=texture.wrapT=THREE.ClampToEdgeWrapping;
    texture.generateMipmaps=false;
    entry={texture,stamp}; textures.set(target,entry);
    target.addEventListener?.('dispose',()=>{ texture.dispose(); textures.delete(target); });
  } else {
    entry.texture.image.data.set(bake.data); entry.stamp=stamp;
  }
  entry.texture.needsUpdate=true;
  return entry.texture;
}
