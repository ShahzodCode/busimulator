import { t } from '../i18n';
import { BUS_PRICE, DAILY_FIXED_COST, MAX_BUSES, World } from '../sim/world';
import { GAP_COLOR } from '../view/gapOverlay';
import { formatMoney } from './hud';
import { icon } from './icons';
import { Sheet } from './sheet';

const pressKeys: Keyframe[] = [{ transform: 'scale(1)' }, { transform: 'scale(0.9)' }, { transform: 'scale(1.05)' }, { transform: 'scale(1)' }];
const shakeKeys: Keyframe[] = [
  { transform: 'translateX(0)' },
  { transform: 'translateX(-6px)' },
  { transform: 'translateX(6px)' },
  { transform: 'translateX(-3px)' },
  { transform: 'translateX(0)' },
];

/** One line's card: its live strip (where every bus is, and how long each gap is) and its fleet controls. */
class LineCard {
  private readonly meta: HTMLElement;
  private readonly interval: HTMLElement;
  private readonly strip: HTMLElement;
  private readonly worst: HTMLElement;
  private readonly count: HTMLElement;
  private readonly buyBtn: HTMLButtonElement;
  private readonly buyFill: HTMLElement;
  private readonly buySub: HTMLElement;
  private readonly sellBtn: HTMLButtonElement;
  private readonly segs: HTMLElement[] = [];
  private readonly marks: HTMLElement[] = [];

  constructor(
    parent: HTMLElement,
    private readonly world: World,
    private readonly line: number,
    onBuy: (line: number) => void,
    onSell: (line: number) => void,
    onDenied: () => void,
  ) {
    const spec = world.lines[line].spec;
    const card = document.createElement('article');
    card.className = 'line-card';
    card.style.setProperty('--line-1', spec.color);
    card.style.setProperty('--line-1-dark', spec.dark);
    card.innerHTML = `
      <div class="line-top">
        <span class="line-no">${spec.no}</span>
        <div class="line-name">
          <b>${t(spec.name)}</b>
          <small class="line-meta"></small>
        </div>
        <span class="line-interval">${icon('timer-fill')}<b></b></span>
      </div>
      <div class="line-strip" aria-hidden="true">
        <div class="line-track"></div>
      </div>
      <p class="line-worst"></p>
      <div class="line-fleet">
        <button class="round-btn line-sell" aria-label="${t('lines.remove')}">${icon('subtract-line')}</button>
        <span class="line-count">${icon('bus-2-fill')}<b></b></span>
        <button class="line-buy">
          <span class="line-buy-fill"></span>
          <span class="line-buy-label">${icon('add-line')}${t('lines.add')}</span>
          <span class="line-buy-sub"></span>
        </button>
      </div>`;
    parent.appendChild(card);
    const q = <T extends HTMLElement>(sel: string) => card.querySelector<T>(sel)!;
    this.meta = q('.line-meta');
    this.interval = q('.line-interval b');
    this.strip = q('.line-track');
    this.worst = q('.line-worst');
    this.count = q('.line-count b');
    this.buyBtn = q('.line-buy');
    this.buyFill = q('.line-buy-fill');
    this.buySub = q('.line-buy-sub');
    this.sellBtn = q('.line-sell');

    // stops never move: draw them once
    const L = world.lines[line];
    for (const s of world.stopsOf(line)) {
      const dot = document.createElement('i');
      dot.className = 'strip-stop';
      dot.style.left = `${(s.d / L.route.length) * 100}%`;
      this.strip.appendChild(dot);
    }

    this.buyBtn.onclick = () => {
      if (this.world.canBuy()) {
        this.buyBtn.animate(pressKeys, { duration: 300, easing: 'ease-out' });
        onBuy(line);
      } else {
        this.buyBtn.animate(shakeKeys, { duration: 300 });
        onDenied();
      }
    };
    this.sellBtn.onclick = () => {
      if (!this.world.canSell(line)) return;
      this.sellBtn.animate(pressKeys, { duration: 300, easing: 'ease-out' });
      onSell(line);
    };
  }

  private pooled(list: HTMLElement[], n: number, cls: string, html = ''): void {
    while (list.length < n) {
      const el = document.createElement('i');
      el.className = cls;
      el.innerHTML = html;
      this.strip.appendChild(el);
      list.push(el);
    }
    list.forEach((el, i) => (el.hidden = i >= n));
  }

  update(): void {
    const w = this.world;
    const n = w.activeOn(this.line).length;
    const L = w.lines[this.line].route.length;
    this.meta.textContent = t('lines.meta', { s: w.lines[this.line].stops.length, b: n });
    this.interval.textContent = `~${Math.round(w.headway(this.line))} ${t('fleet.min')}`;
    this.count.textContent = `×${n}`;

    // live strip: the loop unrolled left to right, coloured by the gap each stretch lies in
    const gaps = w.gaps(this.line);
    const parts: { from: number; len: number; color: string }[] = [];
    for (const g of gaps) {
      const from = g.d / L;
      const len = g.dist / L;
      const color = GAP_COLOR[g.level];
      if (from + len > 1) parts.push({ from, len: 1 - from, color }, { from: 0, len: from + len - 1, color });
      else parts.push({ from, len, color });
    }
    this.pooled(this.segs, parts.length, 'strip-seg');
    parts.forEach((p, i) => {
      const el = this.segs[i];
      el.style.left = `${p.from * 100}%`;
      el.style.width = `${p.len * 100}%`;
      el.style.background = p.color;
    });
    this.pooled(this.marks, gaps.length, 'strip-bus', icon('bus-2-fill'));
    gaps.forEach((g, i) => {
      const el = this.marks[i];
      el.style.left = `${(g.d / L) * 100}%`;
      el.classList.toggle('full', g.bus.onboard.length >= g.bus.capacity);
    });
    const worst = gaps.reduce((a, b) => (b.minutes > a.minutes ? b : a), gaps[0]);
    if (worst) {
      this.worst.textContent = t('lines.worst', { m: Math.round(worst.minutes) });
      this.worst.dataset.level = worst.level;
    }

    const atMax = w.activeBuses.length >= MAX_BUSES;
    const ready = w.canBuy();
    this.buyBtn.classList.toggle('ready', ready);
    this.buyFill.style.width = `${atMax ? 0 : Math.min(100, (Math.max(0, w.money) / BUS_PRICE) * 100)}%`;
    const sub = atMax ? t('fleet.max') : `<b>${formatMoney(BUS_PRICE)}</b> · ${t('fleet.dailyCost', { c: formatMoney(DAILY_FIXED_COST) })}`;
    if (this.buySub.innerHTML !== sub) this.buySub.innerHTML = sub;
    this.sellBtn.disabled = !w.canSell(this.line);
  }
}

/** A route the player hasn't bought yet: what it serves, what it costs, and the button that opens it. */
class LockedCard {
  private readonly btn: HTMLButtonElement;
  private readonly fill: HTMLElement;

  constructor(
    parent: HTMLElement,
    private readonly world: World,
    private readonly line: number,
    onOpen: (line: number) => void,
    onDenied: () => void,
  ) {
    const L = world.lines[line];
    const spec = L.spec;
    const stops = world.stopsOf(line);
    const card = document.createElement('article');
    card.className = 'line-card locked';
    card.style.setProperty('--line-1', spec.color);
    card.style.setProperty('--line-1-dark', spec.dark);
    card.innerHTML = `
      <div class="line-top">
        <span class="line-no">${spec.no}<i class="line-lock">${icon('lock-fill')}</i></span>
        <div class="line-name">
          <b>${t(spec.name)}</b>
          <small>${t('lines.meta', { s: stops.length, b: 0 })}</small>
        </div>
      </div>
      <p class="line-stops">${stops.map((s) => t(`stop.${s.key}`)).join(' · ')}</p>
      <p class="line-hint">${icon('lightbulb-fill')}<span>${t('lines.lockedHint', { m: Math.round(world.lapTime(line) / 5) * 5 })}</span></p>
      <div class="line-fleet">
        <button class="line-buy line-open">
          <span class="line-buy-fill"></span>
          <span class="line-buy-label">${icon('map-pin-add-fill')}${t('lines.open')}</span>
          <span class="line-buy-sub"><b>${formatMoney(spec.price)}</b> · ${t('lines.openSub')}</span>
        </button>
      </div>`;
    parent.appendChild(card);
    this.btn = card.querySelector<HTMLButtonElement>('.line-open')!;
    this.fill = card.querySelector<HTMLElement>('.line-buy-fill')!;
    this.btn.onclick = () => {
      if (this.world.canOpenLine(line)) {
        this.btn.animate(pressKeys, { duration: 300, easing: 'ease-out' });
        onOpen(line);
      } else {
        this.btn.animate(shakeKeys, { duration: 300 });
        onDenied();
      }
    };
  }

  update(): void {
    const price = this.world.lines[this.line].spec.price;
    this.btn.classList.toggle('ready', this.world.canOpenLine(this.line));
    this.fill.style.width = `${Math.min(100, (Math.max(0, this.world.money) / price) * 100)}%`;
  }
}

/**
 * The Lines menu: one card per bus line with its live strip and the controls to add or sell
 * buses on that line. The dashed card at the bottom is where player-drawn lines will go.
 */
export class LinesPanel {
  private cards: (LineCard | LockedCard)[] = [];
  private shownOpen = '';

  constructor(
    private readonly sheet: Sheet,
    private readonly world: World,
    private readonly onBuy: (line: number) => void,
    private readonly onSell: (line: number) => void,
    private readonly onOpen: (line: number) => void,
    private readonly onDenied: () => void,
  ) {
    this.render();
  }

  /** (re)build the cards: running lines first, then the routes still for sale */
  private render(): void {
    const { sheet, world } = this;
    this.shownOpen = world.lines.map((L) => L.open).join();
    sheet.body.innerHTML = '';
    this.cards = [
      ...world.openLines.map((L) => new LineCard(sheet.body, world, L.index, this.onBuy, this.onSell, this.onDenied)),
      ...world.lines.filter((L) => !L.open).map((L) => new LockedCard(sheet.body, world, L.index, this.onOpen, this.onDenied)),
    ];
    const soon = document.createElement('article');
    soon.className = 'line-card soon';
    soon.innerHTML = `
      <span class="line-no ghost">${icon('map-pin-add-fill')}</span>
      <div class="line-name">
        <b>${t('lines.new')}</b>
        <small>${t('lines.soon')}</small>
      </div>
      ${icon('lock-fill', 'soon-lock')}`;
    sheet.body.appendChild(soon);
  }

  update(): void {
    if (this.world.lines.map((L) => L.open).join() !== this.shownOpen) this.render();
    if (!this.sheet.isOpen) return;
    for (const c of this.cards) c.update();
  }
}
