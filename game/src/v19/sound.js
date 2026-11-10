const Audio = globalThis.AudioContext || globalThis.webkitAudioContext;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

export class ForgeSound {
  constructor() {
    this.muted = false;
    this.volume = 1;
    this.samples = new Map();
    this.voices = [];
  }

  prepare() {
    if (!this.context || this.prepared) return;
    this.prepared = true;
    const queue = ['polish', 'shift', 'scar', 'surge', 'break', 'swish', 'heat', 'melt', 'cast', 'tension']
      .flatMap(kind => [0, 1, 2, 3].map(variant => [kind, variant]));
    const warm = () => {
      const next = queue.shift();
      if (!next) return;
      this.sample(...next);
      setTimeout(warm, 8);
    };
    setTimeout(warm, 0);
  }

  unlock() {
    if (!Audio || this.muted) return;
    if (!this.context) {
      this.context = new Audio();
      this.master = this.context.createDynamicsCompressor();
      this.master.threshold.value = -12;
      this.master.ratio.value = 5;
      this.gain = this.context.createGain();
      this.gain.gain.value = this.volume;
      this.master.connect(this.gain);
      this.gain.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') this.context.resume().catch(() => {});
  }

  configure({ sound, volume }) {
    this.muted = !sound;
    this.volume = this.muted ? 0 : volume;
    if (this.gain) this.gain.gain.value = this.volume;
  }

  sample(kind, variation) {
    const key = kind + ':' + variation;
    if (this.samples.has(key)) return this.samples.get(key);
    const breakage = kind === 'break';
    const chime = ['surge', 'appraise', 'shift', 'heat', 'cast'].includes(kind);
    const air = kind === 'swish';
    const furnace = kind === 'melt' || kind === 'tension';
    const ore = kind === 'ore';
    const damage = kind === 'scar';
    const length = air ? .10 : kind === 'heat' ? .13 : breakage ? .58 : chime || furnace ? .40 : .24;
    const rate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, Math.ceil(length * rate), rate);
    const samples = buffer.getChannelData(0);
    const scale = .94 + variation * .037;
    const voices = chime
      ? [[245, .40, 23], [711, .24, 12], [1389, .17, 9], [2517, .11, 13]]
      : [[139, .46, 31], [491, .28, 24], [1187, .22, 32], [2207, .17, 52], [3472, .10, 55]];
    let noise = (350112 + variation * 773) | 0;
    let slow = 0;
    for (let i = 0; i < samples.length; i++) {
      const t = i / rate;
      noise = (Math.imul(noise, 1664525) + 1013904223) | 0;
      const grit = noise / 2147483648;
      slow += .16 * (grit - slow);
      const attack = Math.min(1, t / .0018);
      let sample = 0;
      for (const [freq, strength, decay] of voices) {
        const pitch = freq * scale * (furnace ? .47 : ore ? .68 : breakage ? .77 : damage ? .88 : 1);
        if (!air) sample += Math.sin(2 * Math.PI * pitch * t) * Math.exp(-t * (damage ? decay * 1.38 : decay)) * strength;
      }
      const strike = (grit - .64 * slow) * Math.exp(-t * (breakage || ore ? 67 : 132));
      sample += strike * (ore || breakage || damage ? .55 : .28) + .26 * slow * Math.exp(-t * 58);
      if (air) sample = (grit - .75 * slow) * Math.sin(Math.PI * t / length) ** 3 * .37;
      if (!air && !furnace) sample += .17 * slow * Math.exp(-Math.abs(t - .038) * 90);
      if (breakage) {
        const shards = Math.exp(-Math.abs(t - .041) * 119) + .73 * Math.exp(-Math.abs(t - .114) * 77);
        sample += (grit * .32 + slow * .31) * shards;
      }
      samples[i] = Math.tanh(attack * sample * .92);
    }
    this.samples.set(key, buffer);
    return buffer;
  }

  play(kind = 'polish', pitch = 1, delay = 0) {
    if (this.muted || !this.context || this.context.state !== 'running') return;
    const source = this.context.createBufferSource();
    const level = this.context.createGain();
    const variation = Math.floor(Math.random() * 4);
    source.buffer = this.sample(kind, variation);
    source.playbackRate.value = pitch;
    level.gain.value = kind === 'swish' ? .095 : kind === 'heat' ? .16 : kind === 'tension' ? .20 :
      kind === 'break' ? .55 : kind === 'appraise' ? .31 : .39;
    while (this.voices.length >= 5) {
      const earliest = this.voices.shift();
      try { earliest.stop(); } catch {}
    }
    this.voices.push(source);
    source.connect(level);
    level.connect(this.master);
    source.start(this.context.currentTime + delay);
    source.onended = () => {
      this.voices = this.voices.filter(voice => voice !== source);
      source.disconnect();
      level.disconnect();
    };
  }

  impact(event, purity) {
    const pitch = (event.zone === 'edge' ? 1.14 : event.zone === 'tip' ? 1.06 : .94) * (.95 + purity / 1000);
    this.play(event.type, pitch);
    if (event.type === 'surge' || event.notable && event.type !== 'scar') this.play('shift', 1.27, .054);
    if (!reduced && navigator.vibrate) {
      navigator.vibrate(event.type === 'break' ? [26, 24, 21] : event.type === 'surge' ? [11, 14, 10] : 10);
    }
  }

  inspect(ore) {
    this.play('ore',.66+(ore.density ?? 55)*.006);
    if(this.muted || !this.context || this.context.state!=='running')return;
    const oscillator=this.context.createOscillator(),gain=this.context.createGain();
    const now=this.context.currentTime,density=(ore.density ?? 55)/100;
    oscillator.frequency.value=310+density*610;
    gain.gain.setValueAtTime(.065,now);
    gain.gain.exponentialRampToValueAtTime(.0001,now+.10+density*.48);
    oscillator.connect(gain);gain.connect(this.master);
    oscillator.start(now);oscillator.stop(now+.65);
    oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};
  }
}
