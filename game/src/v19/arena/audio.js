/* 斩试场 v0.8 · 原版离线声音，默认沉稳音色与 80% 音量。
* 49 个本地 PCM WAV；加入纸牌 / 菠萝 / 复合盾牌，不联网、无附加奖励铃声。
* 单次触碰只播放一个材质音，挥刀是轻量背景；破防/斩断优先于轻碰。
*/
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const MATERIALS=['card','rope','bamboo','pineapple','wood','ice','gel','steel','shield'];
const cuts={card:520,rope:330,bamboo:235,pineapple:245,wood:240,ice:260,gel:410,steel:215,shield:235};
const gainByMat={card:.96,rope:1.00,bamboo:.98,pineapple:.99,wood:.93,ice:1.04,gel:.90,steel:.94,shield:.91};
export class BladeAudio {
 constructor(){
  this.ctx=null;this.buffers=new Map();this.loading=null;this.ready=false;
  this.enabled=true;this.volume=.8;this.tone='punchy';this.bank=null;
  this.voices=new Set();this.lastSwing=0;
  this.master=null;this.contactBus=null;this.fxBus=null;this.contactEQ=null;this.fxHP=null;this.comp=null;
 }
 volumeGain(){return this.volume<=0?0:Math.pow(this.volume,1.03)*.96;}
 preload() {
  this.bank ??= import('./audio_bank.js').then(module => module.default).catch(error => {
   this.bank = null;
   throw error;
  });
  return this.bank;
 }
 async unlock(){
  if(!this.enabled)return false;
  try{
   if(!this.ctx){
    const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return false;
    const ctx=this.ctx=new Context({latencyHint:'interactive'});
    this.master=ctx.createGain();this.master.gain.value=this.volumeGain();
    this.comp=ctx.createDynamicsCompressor();this.comp.threshold.value=-15;this.comp.knee.value=9;
    this.comp.ratio.value=2.4;this.comp.attack.value=.004;this.comp.release.value=.11;
    // Native WebAudio compressor is followed by a conservative soft peak stage.
    this.limiter=ctx.createWaveShaper();
    const curve=new Float32Array(8192);for(let i=0;i<curve.length;i++){
     const x=i*2/(curve.length-1)-1;curve[i]=.95*Math.tanh(x*1.14);
    }this.limiter.curve=curve;this.limiter.oversample='2x';
    this.contactBus=ctx.createGain();this.contactBus.gain.value=.96;
    this.fxBus=ctx.createGain();this.fxBus.gain.value=.13;
    // Low shelf attenuates the old samples' drum-like low-mid impact body.
    this.contactEQ=ctx.createBiquadFilter();this.contactEQ.type='lowshelf';this.contactEQ.frequency.value=360;this.contactEQ.gain.value=-3.9;
    this.contactPresence=ctx.createBiquadFilter();this.contactPresence.type='peaking';this.contactPresence.frequency.value=2150;
    this.contactPresence.Q.value=.72;this.contactPresence.gain.value=.4;
    this.fxHP=ctx.createBiquadFilter();this.fxHP.type='highpass';this.fxHP.frequency.value=720;this.fxHP.Q.value=.6;
    this.contactBus.connect(this.contactEQ);this.contactEQ.connect(this.contactPresence);this.contactPresence.connect(this.comp);
    this.fxBus.connect(this.fxHP);this.fxHP.connect(this.comp);
    this.comp.connect(this.limiter);this.limiter.connect(this.master);this.master.connect(ctx.destination);
   }
   if(this.ctx.state==='suspended')await this.ctx.resume();
   if(!this.loading){
    this.loading=this.preload().then(async bank => {
     await Promise.all(Object.entries(bank).map(async ([name, encoded]) => {
      const raw = atob(encoded);
      const bytes = Uint8Array.from(raw, char => char.charCodeAt(0));
      this.buffers.set(name, await this.ctx.decodeAudioData(bytes.buffer));
     }));
     this.ready=true;
     return true;
    }).catch(err=>{this.loading=null;console.warn('音效解码失败',err);return false});

   }
   return await this.loading;
  }catch(err){console.warn('声音设备不可用',err);return false}
 }
 setEnabled(v){this.enabled=!!v;if(!this.enabled){for(const src of this.voices)try{src.stop()}catch{}this.voices.clear();}
   else void this.unlock();}
 setVolume(v){this.volume=clamp(Number(v)||0,0,1);if(this.master&&this.ctx)this.master.gain.setTargetAtTime(this.volumeGain(),this.ctx.currentTime,.012);}
 setTone(t){this.tone=t==='punchy'?'punchy':'natural';
  if(this.ctx){const time=this.ctx.currentTime;
   // '沉稳' affects texture/midrange, never boosts the bass back into a drum.
   this.contactEQ.gain.setTargetAtTime(this.tone==='punchy'?-3.9:-4.6,time,.02);
   this.contactPresence.gain.setTargetAtTime(this.tone==='punchy'?.4:1.7,time,.02);
   this.fxBus.gain.setTargetAtTime(this.tone==='punchy'?.13:.16,time,.02);
  }return this.tone;
 }
 sample(clip,{volume=.3,rate=1,delay=0,pan=0,bus='contact',highpass=0,duration=0}={}){
  if(!this.ready||!this.enabled||!this.ctx||this.volume<=0||this.voices.size>=16)return false;
  const buffer=this.buffers.get(clip);if(!buffer)return false;
  const ctx=this.ctx,t=ctx.currentTime+clamp(delay,0,.8);
  const speed=clamp(rate,.97,1.03),d=Math.min(duration||.4,buffer.duration/speed);
  if(d<=0)return false;
  const source=ctx.createBufferSource(),env=ctx.createGain();source.buffer=buffer;source.playbackRate.value=speed;
  const peak=clamp(volume,0,1.1);
  env.gain.setValueAtTime(0,t);env.gain.linearRampToValueAtTime(peak,t+.0014);
  env.gain.setValueAtTime(peak,t+Math.max(.002,d-Math.min(.048,d*.24)));
  env.gain.linearRampToValueAtTime(0,t+d);
  source.connect(env);let last=env;
  if(highpass){const filter=ctx.createBiquadFilter();filter.type='highpass';filter.frequency.value=highpass;filter.Q.value=.65;last.connect(filter);last=filter;}
  if(ctx.createStereoPanner){const panner=ctx.createStereoPanner();panner.pan.value=clamp(pan,-.5,.5);last.connect(panner);last=panner;}
  last.connect(bus==='fx'?this.fxBus:this.contactBus);
  this.voices.add(source);source.onended=()=>{this.voices.delete(source);try{source.disconnect();env.disconnect();last.disconnect()}catch{}};
  source.start(t);source.stop(t+d+.01);return true;
 }
 duckSwing(delay,stage){
  if(!this.fxBus||!this.ctx)return;
  const bus=this.fxBus.gain,now=this.ctx.currentTime+delay,base=this.tone==='punchy'?.13:.16;
  bus.cancelScheduledValues(now);bus.setValueAtTime(base,now);bus.linearRampToValueAtTime(base*.22,now+.009);
  bus.linearRampToValueAtTime(base,now+(stage==='break'?.12:.09));
 }
 playSwing({heavy=false}={}){
  if(!this.enabled)return;void this.unlock();const now=performance.now();if(now-this.lastSwing<100)return;
  this.lastSwing=now;const clip=heavy?'swing_heavy':'swing_fast';
  this.sample(clip,{bus:'fx',volume:heavy?.36:.32,highpass:720,duration:.16,
   rate:1+Math.random()*.013});
 }
 playHit({material,stage='hit',force=1,pan=0,delayMs=0,groupSize=1}={}){
  if(!this.enabled||!MATERIALS.includes(material))return;void this.unlock();
  const phase=['hit','fracture','break'].includes(stage)?stage:'hit';
  const variant=Math.floor(Math.random()*3);
  const clip=phase==='hit'?`${material}_hit${variant}`:`${material}_${phase==='fracture'?'crack':'break'}`;
  const delay=clamp(delayMs,0,550)/1000;
  // One blade contact = one foreground material sound. No bass thump overlay, no UI chime.
  // Multi-cut retains direction and stagger; grouping trims peaks, not all the detail.
  const group=1/Math.pow(Math.max(1,groupSize),.36);
  const amount=clamp(force,.4,1.4);
  const vol=(phase==='hit'?.64:phase==='fracture'?.77:.90)*(.87+amount*.13)*group*gainByMat[material];
  const baseDuration=phase==='hit'?.155:phase==='fracture'?.195:.26;
  const materialTail={card:.78,rope:.9,bamboo:.87,pineapple:.90,gel:.82,wood:.94,ice:.97,steel:1.04,shield:1.06}[material]||1;
  const duration=(groupSize>1?Math.min(baseDuration,.17):baseDuration)*materialTail;
  const played=this.sample(clip,{volume:vol,rate:.99+Math.random()*.02,pan,delay,
     highpass:cuts[material],duration});
  if(played)this.duckSwing(delay,phase);
 }
}
