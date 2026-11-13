/**
 * Procedural sound effects with the Web Audio API — no audio files, no downloads, no licences.
 * Every sound is a few oscillators or a noise burst shaped by an envelope.
 * Each sound type is throttled so 4x speed doesn't turn into noise.
 */

const STORAGE_KEY = 'bus-sim-muted';

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private last = new Map<string, number>();
  private coinCombo = 0;
  private lastCoin = 0;
  muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      /* storage unavailable: default to sound on */
    }
    // browsers only allow audio after a user gesture
    const unlock = () => {
      this.ensure();
      void this.ctx?.resume();
    };
    window.addEventListener('pointerdown', unlock, { once: false, passive: true });
    window.addEventListener('keydown', unlock, { once: false });
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    // gentle compressor keeps overlapping sounds from clipping
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.5;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return this.ctx;
  }

  setMuted(m: boolean): void {
    this.muted = m;
    try {
      localStorage.setItem(STORAGE_KEY, m ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  /** returns the audio context if this sound may play now */
  private gate(name: string, minGap: number): AudioContext | null {
    if (this.muted) return null;
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return null;
    const now = ctx.currentTime;
    if (now - (this.last.get(name) ?? -1) < minGap) return null;
    this.last.set(name, now);
    return ctx;
  }

  private tone(
    ctx: AudioContext,
    type: OscillatorType,
    f0: number,
    f1: number,
    start: number,
    dur: number,
    vol: number,
    attack = 0.005,
  ): void {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(this.master!);
    o.start(start);
    o.stop(start + dur + 0.02);
  }

  private noiseBurst(ctx: AudioContext, start: number, dur: number, vol: number, f0: number, f1: number, q = 1.2): void {
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = q;
    bp.frequency.setValueAtTime(f0, start);
    bp.frequency.exponentialRampToValueAtTime(f1, start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(vol, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(bp).connect(g).connect(this.master!);
    src.start(start);
    src.stop(start + dur + 0.02);
  }

  /** fare collected: bright two-note "ding"; quick successions climb in pitch (combo) */
  coin(): void {
    const ctx = this.gate('coin', 0.05);
    if (!ctx) return;
    const now = ctx.currentTime;
    this.coinCombo = now - this.lastCoin < 0.6 ? Math.min(this.coinCombo + 1, 12) : 0;
    this.lastCoin = now;
    const k = Math.pow(2, this.coinCombo / 12);
    this.tone(ctx, 'square', 988 * k, 988 * k, now, 0.06, 0.07);
    this.tone(ctx, 'square', 1319 * k, 1319 * k, now + 0.05, 0.16, 0.07);
  }

  /** little pop: someone appears / UI */
  pop(): void {
    const ctx = this.gate('pop', 0.08);
    if (!ctx) return;
    this.tone(ctx, 'sine', 700, 220, ctx.currentTime, 0.09, 0.15);
  }

  /** bus doors: soft pneumatic "pssh" */
  door(): void {
    const ctx = this.gate('door', 0.2);
    if (!ctx) return;
    this.noiseBurst(ctx, ctx.currentTime, 0.28, 0.12, 3500, 1200, 0.8);
  }

  /** friendly double horn */
  horn(): void {
    const ctx = this.gate('horn', 0.4);
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const [s, d] of [
      [0, 0.12],
      [0.17, 0.2],
    ]) {
      this.tone(ctx, 'sawtooth', 440, 430, t + s, d, 0.06, 0.01);
      this.tone(ctx, 'sawtooth', 554, 545, t + s, d, 0.05, 0.01);
    }
  }

  /** annoyed "hmph": someone gave up */
  angry(): void {
    const ctx = this.gate('angry', 0.3);
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'triangle', 260, 150, t, 0.16, 0.16);
    this.tone(ctx, 'square', 130, 90, t, 0.14, 0.03);
  }

  /** bubble appears */
  blip(angry = false): void {
    const ctx = this.gate('blip', 0.15);
    if (!ctx) return;
    const f = angry ? 330 : 620;
    this.tone(ctx, 'triangle', f, f * 1.3, ctx.currentTime, 0.07, 0.07);
  }

  /** bought a bus: happy arpeggio */
  buy(): void {
    const ctx = this.gate('buy', 0.3);
    if (!ctx) return;
    const t = ctx.currentTime;
    [523, 659, 784, 1047].forEach((f, i) => this.tone(ctx, 'square', f, f, t + i * 0.07, 0.14, 0.06));
    this.tone(ctx, 'triangle', 1047, 1047, t + 0.28, 0.4, 0.08);
  }

  /** sold a bus: two descending notes */
  sell(): void {
    const ctx = this.gate('sell', 0.3);
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'triangle', 660, 660, t, 0.12, 0.1);
    this.tone(ctx, 'triangle', 440, 440, t + 0.1, 0.22, 0.1);
  }

  /** can't afford it */
  deny(): void {
    const ctx = this.gate('deny', 0.25);
    if (!ctx) return;
    const t = ctx.currentTime;
    this.tone(ctx, 'square', 180, 170, t, 0.08, 0.06);
    this.tone(ctx, 'square', 150, 140, t + 0.1, 0.12, 0.06);
  }

  /** paper page turning over */
  page(): void {
    const ctx = this.gate('page', 0.12);
    if (!ctx) return;
    this.noiseBurst(ctx, ctx.currentTime, 0.22, 0.12, 900, 3800, 0.7);
    this.tone(ctx, 'sine', 240, 150, ctx.currentTime + 0.16, 0.09, 0.07);
  }

  /** a panel sliding open or shut */
  whoosh(open: boolean): void {
    const ctx = this.gate('whoosh', 0.08);
    if (!ctx) return;
    this.noiseBurst(ctx, ctx.currentTime, 0.16, 0.06, open ? 500 : 1800, open ? 1800 : 500, 0.9);
  }

  /** a switch flicking on or off */
  toggle(on: boolean): void {
    const ctx = this.gate('toggle', 0.05);
    if (!ctx) return;
    this.tone(ctx, 'triangle', on ? 620 : 820, on ? 930 : 520, ctx.currentTime, 0.09, 0.1);
  }

  click(): void {
    const ctx = this.gate('click', 0.03);
    if (!ctx) return;
    this.tone(ctx, 'sine', 1200, 900, ctx.currentTime, 0.04, 0.08);
  }

  /** end-of-day star, i = 0..2 rises in pitch */
  star(i: number): void {
    const ctx = this.gate(`star${i}`, 0.1);
    if (!ctx) return;
    const f = [784, 988, 1319][i] ?? 1319;
    const t = ctx.currentTime;
    this.tone(ctx, 'triangle', f, f, t, 0.35, 0.12);
    this.tone(ctx, 'sine', f * 2, f * 2, t, 0.25, 0.04);
  }

  /** day over: gentle evening chime */
  dayEnd(): void {
    const ctx = this.gate('dayEnd', 1);
    if (!ctx) return;
    const t = ctx.currentTime;
    [659, 523, 392, 523].forEach((f, i) => this.tone(ctx, 'triangle', f, f, t + i * 0.16, 0.35, 0.09));
  }
}

export const sfx = new Sfx();
