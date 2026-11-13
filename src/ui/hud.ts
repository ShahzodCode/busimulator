import { t } from '../i18n';
import { GameClock } from '../sim/clock';
import { isRushHour } from '../sim/demand';
import { World } from '../sim/world';
import { sfx } from '../audio/sfx';
import { icon, IconName } from './icons';

export function formatMoney(n: number): string {
  const s = Math.round(Math.abs(n)).toLocaleString('en-US').replace(/,/g, ' ');
  return n < 0 ? `−${s}` : s;
}

const SPEEDS = [1, 2, 8, 16];
const press: Keyframe[] = [{ transform: 'scale(0.86)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }];

/**
 * The always-visible corner readouts: clock, mood and waiting riders on the left,
 * money and game speed on the right. Everything else lives in the dock's menus.
 */
export class Hud {
  private readonly timeEl: HTMLElement;
  private readonly dayEl: HTMLElement;
  private readonly iconEl: HTMLElement;
  private readonly moneyEl: HTMLElement;
  private readonly moneyPill: HTMLElement;
  private readonly happyFill: HTMLElement;
  private readonly happyFace: HTMLElement;
  private readonly happyPct: HTMLElement;
  private readonly waitingEl: HTMLElement;
  private readonly rushEl: HTMLElement;
  private readonly pauseBtn: HTMLButtonElement;
  private readonly speedBtn: HTMLButtonElement;
  private readonly speedVal: HTMLElement;
  private shownMoney = 0;
  private shownHappy = -1;
  /** speed to return to after a pause */
  private lastSpeed = 1;
  private shownSpeed = -1;
  private shownSky = '';
  private shownFace = '';

  constructor(
    root: HTMLElement,
    private readonly clock: GameClock,
    private readonly world: World,
  ) {
    const top = document.createElement('div');
    top.className = 'hud-top';
    top.innerHTML = `
      <div class="hud-col">
        <div class="pill clock">
          <span class="clock-icon"></span>
          <div class="clock-text">
            <span class="clock-day"></span>
            <span class="clock-time"></span>
          </div>
        </div>
        <div class="pill happy" title="${t('hud.happiness')}">
          <span class="happy-face"></span>
          <div class="happy-bar"><div class="happy-fill"></div></div>
          <span class="happy-pct"></span>
        </div>
        <div class="hud-chips">
          <div class="pill waiting">${icon('group-fill')}<span class="waiting-val"></span></div>
          <div class="rush">${icon('alarm-warning-fill')}${t('hud.rush')}</div>
        </div>
      </div>
      <div class="hud-col right">
        <div class="pill money">${icon('coin-fill', 'coin')}<span class="money-val">0</span></div>
        <div class="pill speeds" role="group" aria-label="${t('hud.speed')}">
          <button class="speed-pause"></button>
          <button class="speed-cycle" aria-label="${t('hud.speed')}">${icon('speed-fill')}<b class="speed-val"></b></button>
        </div>
      </div>`;
    root.appendChild(top);
    const q = <T extends HTMLElement>(sel: string) => top.querySelector<T>(sel)!;
    this.timeEl = q('.clock-time');
    this.dayEl = q('.clock-day');
    this.iconEl = q('.clock-icon');
    this.moneyEl = q('.money-val');
    this.moneyPill = q('.money');
    this.happyFill = q('.happy-fill');
    this.happyFace = q('.happy-face');
    this.happyPct = q('.happy-pct');
    this.waitingEl = q('.waiting-val');
    this.rushEl = q('.rush');
    this.pauseBtn = q('.speed-pause');
    this.speedBtn = q('.speed-cycle');
    this.speedVal = q('.speed-val');

    this.pauseBtn.onclick = () => {
      sfx.click();
      clock.speed = clock.speed === 0 ? this.lastSpeed : 0;
      this.pauseBtn.animate(press, { duration: 260, easing: 'ease-out' });
    };
    // one button steps through the speeds instead of a row of them
    this.speedBtn.onclick = () => {
      sfx.click();
      const now = clock.speed === 0 ? this.lastSpeed : clock.speed;
      clock.speed = clock.speed === 0 ? now : SPEEDS[(SPEEDS.indexOf(now) + 1) % SPEEDS.length];
      this.speedBtn.animate(press, { duration: 260, easing: 'ease-out' });
    };
  }

  /** little bounce on the money pill when coins land */
  bumpMoney(): void {
    this.moneyPill.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
  }

  /** shake the money pill: can't afford that */
  denyMoney(): void {
    this.moneyPill.animate(
      [{ transform: 'translateX(0)' }, { transform: 'translateX(-7px)' }, { transform: 'translateX(7px)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(0)' }],
      { duration: 350 },
    );
  }

  update(dt: number): void {
    this.moneyPill.classList.toggle('neg', this.world.money < 0);
    this.timeEl.textContent = this.clock.label();
    this.dayEl.textContent = t('hud.day', { n: this.clock.day });
    const h = this.clock.hour;
    const sky: IconName = h < 7 ? 'sun-foggy-fill' : h < 17.5 ? 'sun-fill' : h < 20 ? 'haze-fill' : 'moon-fill';
    if (sky !== this.shownSky) {
      this.shownSky = sky;
      this.iconEl.innerHTML = icon(sky);
      this.iconEl.dataset.sky = sky;
    }

    // speed buttons follow the clock, whoever changed it
    const speed = this.clock.speed;
    if (speed > 0) this.lastSpeed = speed;
    if (speed !== this.shownSpeed) {
      this.shownSpeed = speed;
      const paused = speed === 0;
      this.pauseBtn.innerHTML = icon(paused ? 'play-fill' : 'pause-fill');
      this.pauseBtn.setAttribute('aria-label', t(paused ? 'hud.play' : 'hud.pause'));
      this.pauseBtn.classList.toggle('active', paused);
      this.speedBtn.classList.toggle('fast', !paused && speed > 1);
      this.speedVal.textContent = `${this.lastSpeed}×`;
    }

    // money counts up smoothly
    this.shownMoney += (this.world.money - this.shownMoney) * (1 - Math.exp(-dt * 8));
    if (Math.abs(this.world.money - this.shownMoney) < 1) this.shownMoney = this.world.money;
    this.moneyEl.textContent = formatMoney(this.shownMoney);

    const hp = this.world.happiness;
    this.shownHappy = this.shownHappy < 0 ? hp : this.shownHappy + (hp - this.shownHappy) * (1 - Math.exp(-dt * 4));
    const pct = Math.round(this.shownHappy * 100);
    const hue = Math.round(this.shownHappy * 120);
    this.happyFill.style.width = `${pct}%`;
    this.happyFill.style.background = `hsl(${hue}, 75%, 52%)`;
    this.happyPct.textContent = `${pct}%`;
    const face: IconName =
      hp > 0.75 ? 'emotion-laugh-fill' : hp > 0.55 ? 'emotion-happy-fill' : hp > 0.35 ? 'emotion-normal-fill' : hp > 0.2 ? 'emotion-unhappy-fill' : 'emotion-sad-fill';
    if (face !== this.shownFace) {
      this.shownFace = face;
      this.happyFace.innerHTML = icon(face);
    }
    this.happyFace.style.color = `hsl(${hue}, 70%, 42%)`;

    this.waitingEl.textContent = t('hud.waiting', { n: this.world.waitingCount() });
    this.rushEl.classList.toggle('on', isRushHour(h));
  }
}
