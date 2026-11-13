import { say } from '../i18n';
import { Passenger, World } from '../sim/world';
import { PeopleView } from '../view/peopleView';
import { Floaters } from './floaters';
import { sfx } from '../audio/sfx';

const MAX_BUBBLES = 3;

/**
 * Decides who says what, and when. Passengers react to their situation in short,
 * funny Uzbek lines — each one hints at the real problem (waits, crowding, cars).
 * Rate-limited in real time so the screen never turns into a wall of text, even at 16x.
 */
export class Speech {
  private chatterIn = 3;
  private readonly stopCooldown: number[];
  private readonly spoke = new Set<number>();

  constructor(
    private readonly world: World,
    private readonly people: PeopleView,
    private readonly floaters: Floaters,
  ) {
    this.stopCooldown = world.stops.map(() => 0);
  }

  private room(): boolean {
    return this.floaters.bubbleCount < MAX_BUBBLES;
  }

  private speak(p: Passenger, text: string, cls: string): void {
    if (!text) return;
    if (this.spoke.size > 3000) this.spoke.clear();
    this.spoke.add(p.id);
    sfx.blip(cls === 'angry');
    this.floaters.bubble(() => this.people.headOf(p.id), text, cls);
  }

  /** a full bus just left people behind */
  leftBehind(stop: number): void {
    const q = this.world.stops[stop].queue;
    if (!q.length || !this.room()) return;
    const p = q[Math.floor(Math.random() * Math.min(q.length, 6))];
    this.speak(p, say('say.full'), 'angry');
    this.stopCooldown[stop] = 4;
  }

  /** the bus had room, but these people chose to wait for an emptier one */
  skipped(stop: number, waiting: Passenger[]): void {
    if (!waiting.length || !this.room() || this.stopCooldown[stop] > 0) return;
    this.speak(waiting[0], say('say.skip', `p.${waiting[0].persona}`), '');
    this.stopCooldown[stop] = 4;
  }

  /** a passenger got on; quick service sometimes earns a compliment */
  boarded(p: Passenger): void {
    if (!this.room() || Math.random() > 0.12) return;
    if (this.world.waitOf(p) / p.patience > 0.3) return;
    this.speak(p, say('say.happy'), 'happy');
  }

  gaveUp(p: Passenger): void {
    if (!this.room() || Math.random() > 0.4) return;
    this.speak(p, say('say.taxi'), 'angry');
  }

  update(realDt: number): void {
    for (let i = 0; i < this.stopCooldown.length; i++) this.stopCooldown[i] = Math.max(0, this.stopCooldown[i] - realDt);
    this.chatterIn -= realDt;
    if (this.chatterIn > 0) return;
    this.chatterIn = 2.2 + Math.random() * 2.5;
    if (!this.room()) return;

    // pick a stop, weighted by how many are waiting
    const candidates = this.world.stops
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => s.queue.length > 0 && this.stopCooldown[i] === 0);
    const total = candidates.reduce((n, c) => n + c.s.queue.length, 0);
    if (!total) return;
    let r = Math.random() * total;
    const pick = candidates.find((c) => (r -= c.s.queue.length) <= 0) ?? candidates[0];

    // the most frustrated person who hasn't spoken yet does the talking
    const fresh = pick.s.queue.filter((p) => !this.spoke.has(p.id));
    if (!fresh.length) return;
    const p = fresh.reduce((a, b) => (this.world.waitOf(b) / b.patience > this.world.waitOf(a) / a.patience ? b : a));
    const mood = this.world.moodOf(p);
    if (mood === 'happy' && Math.random() < 0.7) return; // content people mostly stay quiet
    const text = mood === 'angry' ? say('say.angry') : say('say.waiting', Math.random() < 0.5 ? pick.s.key : `p.${p.persona}`);
    this.speak(p, text, mood === 'angry' ? 'angry' : '');
    this.stopCooldown[pick.i] = 5;
  }
}
