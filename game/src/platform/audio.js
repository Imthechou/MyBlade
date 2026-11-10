/**
 * 平台服务层 · 音频
 *
 * 全部音效由 WebAudio 实时合成 —— 不依赖任何音频资源文件，
 * 省掉 小游戏/App 的包体与加载问题，迁移时替换为宿主 API 即可。
 *
 * 设计约束（设定文档 §29）：只有开关与音量，不做复杂音频系统。
 */

import { env } from './env.js';

let ctx = null;
let master = null;
const state = { enabled: true, volume: 0.6 };

function ensure() {
  if (ctx) return ctx;
  if (!env.hasWebAudio) return null;
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = state.enabled ? state.volume : 0;
  master.connect(ctx.destination);
  return ctx;
}

/** 浏览器要求首次用户手势后才能出声 */
export function unlock() {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}

export function setEnabled(v) {
  state.enabled = !!v;
  if (master) master.gain.value = state.enabled ? state.volume : 0;
}

export function setVolume(v) {
  state.volume = Math.min(1, Math.max(0, Number(v) || 0));
  if (master && state.enabled) master.gain.value = state.volume;
}

export const settings = () => ({ ...state });

/** 基础音：一个振荡器 + 包络 */
function tone({ freq = 440, dur = 0.12, type = 'sine', gain = 0.3, sweepTo = null, delay = 0 }) {
  const c = ensure();
  if (!c || !state.enabled) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (sweepTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, sweepTo), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + Math.min(0.015, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

/** 噪声脉冲：锤击、火花、断裂的"撞击"成分 */
function noise({ dur = 0.18, gain = 0.35, lowpass = 1800, delay = 0 }) {
  const c = ensure();
  if (!c || !state.enabled) return;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = lowpass;
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(lp); lp.connect(g); g.connect(master);
  src.start(t0);
}

/** 音效表：语义化命名，业务层只调 play('hammer') */
const SFX = {
  tap: () => tone({ freq: 520, dur: 0.05, type: 'triangle', gain: 0.14 }),
  select: () => tone({ freq: 660, dur: 0.07, type: 'triangle', gain: 0.16 }),
  confirm: () => { tone({ freq: 523, dur: 0.09, type: 'triangle', gain: 0.2 }); tone({ freq: 784, dur: 0.12, type: 'triangle', gain: 0.16, delay: 0.07 }); },
  reroll: () => tone({ freq: 300, dur: 0.16, type: 'sawtooth', gain: 0.12, sweepTo: 620 }),
  // A dry steel-on-anvil "tak" with a very short ringing body; no celebratory chime.
  hammer: () => {
    noise({dur:.035,gain:.13,lowpass:3800});
    tone({freq:172,dur:.086,type:'triangle',gain:.115,sweepTo:117});
    tone({freq:515,dur:.055,type:'sine',gain:.038,sweepTo:410,delay:.009});
  },
  hammerRisk: () => {
    noise({dur:.055,gain:.17,lowpass:2750});
    tone({freq:142,dur:.12,type:'triangle',gain:.16,sweepTo:82});
    tone({freq:348,dur:.08,type:'sine',gain:.044,delay:.014});
  },
  hammerTier: () => {
    noise({dur:.045,gain:.14,lowpass:3900});
    tone({freq:178,dur:.09,type:'triangle',gain:.12,sweepTo:118});
    tone({freq:610,dur:.18,type:'sine',gain:.058,delay:.014});
  },
  // S7 honing: soft dry abrasive contact in short, sparse strokes. These are
  // deliberately much quieter than hammer or cut impact, not bright jingles.
  hone: () => {
    noise({ dur: 0.025, gain: 0.042, lowpass: 2750 });
    tone({ freq: 355, dur: 0.038, type: 'sine', gain: 0.015, sweepTo: 300 });
  },
  honeFinish: () => {
    noise({ dur: 0.042, gain: 0.047, lowpass: 3400 });
    tone({ freq: 590, dur: 0.12, type: 'sine', gain: 0.055, sweepTo: 720, delay: 0.012 });
  },
  spark: () => noise({ dur: 0.1, gain: 0.22, lowpass: 5200 }),
  riskUp: () => tone({ freq: 220, dur: 0.14, type: 'sawtooth', gain: 0.12, sweepTo: 160 }),
  riskSafe: () => tone({ freq: 440, dur: 0.12, type: 'sine', gain: 0.16, sweepTo: 560 }),
  fracture: () => {
    noise({ dur: 0.4, gain: 0.5, lowpass: 1200 });
    tone({ freq: 180, dur: 0.5, type: 'sawtooth', gain: 0.24, sweepTo: 40 });
  },
  trait: () => { tone({ freq: 659, dur: 0.1, type: 'sine', gain: 0.18 }); tone({ freq: 988, dur: 0.16, type: 'sine', gain: 0.14, delay: 0.09 }); },
  combo: () => { tone({ freq: 523, dur: 0.1, type: 'sine', gain: 0.16 }); tone({ freq: 659, dur: 0.1, gain: 0.16, delay: 0.08 }); tone({ freq: 1046, dur: 0.22, type: 'sine', gain: 0.18, delay: 0.16 }); },
  reveal: () => tone({ freq: 330, dur: 0.5, type: 'sine', gain: 0.18, sweepTo: 880 }),
  win: () => { [523, 659, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.16, type: 'triangle', gain: 0.16, delay: i * 0.09 })); },
  lose: () => { [440, 392, 330].forEach((f, i) => tone({ freq: f, dur: 0.2, type: 'triangle', gain: 0.14, delay: i * 0.11 })); },
};

/**
 * 三层打击音：低频重量 + 中频材质 + 高频切裂。
 * 切割中只播放很短的合成包络，沿用已有音量/静音开关；无外部音效文件。
 * 由画布层节流，浏览器不支持 WebAudio 时静默降级。
 */
export function playCutImpact(impact) {
  if(!impact||!state.enabled)return;
  const kind=impact.sound||'fiber', weight=Math.max(0,Math.min(1,Number(impact.weight)||.3));
  const complete=!!impact.completed;
  const low=kind==='metal'?112:kind==='wood'?142:kind==='plastic'?174:kind==='ice'?209:kind==='fiber'?242:296;
  const mid=kind==='metal'?470:kind==='ice'?850:kind==='plastic'?540:kind==='wood'?365:kind==='fiber'?625:760;
  try {
    // 软材紧而轻；硬材低频先到，裂响略滞后，视觉定格期仍然可以继续输入。
    tone({freq:low,dur:.055+weight*.058,type:'triangle',gain:.045+weight*.09,sweepTo:low*.65});
    tone({freq:mid,dur:.027+weight*.035,type:kind==='metal'?'sawtooth':'triangle',
      gain:.04+weight*.05,sweepTo:mid*.67,delay:.007});
    if(kind==='metal'||kind==='ice')noise({dur:.04+weight*.05,gain:.065+weight*.06,
      lowpass:kind==='metal'?6800:5200,delay:.012});
    else if(kind==='wood'||kind==='plastic')noise({dur:.045,gain:.05+weight*.06,lowpass:2000+weight*2000,delay:.009});
    else noise({dur:.025,gain:.04,lowpass:3000,delay:.004});
    if(complete&&weight>.4)tone({freq:mid*1.6,dur:.038,type:'sine',gain:.035,delay:.024});
  } catch(_) { /* 音频永不阻塞输入 */ }
}

export function play(name) {
  const fn = SFX[name];
  if (!fn) return;
  try { fn(); } catch (_) { /* 音频失败绝不影响玩法 */ }
}

export const list = () => Object.keys(SFX);

export default { play, playCutImpact, list, setEnabled, setVolume, settings, unlock };
