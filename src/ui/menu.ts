import { t } from '../i18n';
import { GameClock } from '../sim/clock';
import { GAP_BAD, GAP_GOOD, World } from '../sim/world';
import { GAP_COLOR } from '../view/gapOverlay';
import { sfx } from '../audio/sfx';
import { Guidebook } from './guidebook';
import { icon, IconName } from './icons';
import { LinesPanel } from './linesPanel';
import { Sheet } from './sheet';

/** the guidebook appears once the player has finished two days */
export const BOOK_DAY = 3;

export interface MenuHandlers {
  onBuy: (line: number) => void;
  onSell: (line: number) => void;
  onOpenLine: (line: number) => void;
  onDenied: () => void;
  onGaps: (on: boolean) => void;
}

const wiggle: Keyframe[] = [
  { transform: 'rotate(0)' },
  { transform: 'rotate(-12deg)' },
  { transform: 'rotate(10deg)' },
  { transform: 'rotate(-6deg)' },
  { transform: 'rotate(0)' },
];

/**
 * Everything reachable while playing, behind four buttons at the bottom of the screen:
 * Lines (fleet and future routes), the gap overlay switch, the guidebook and settings.
 * New features get a card in a sheet or a new dock button — not another control on the map.
 */
export class GameMenu {
  private readonly dock: HTMLElement;
  private readonly linesBtn: HTMLButtonElement;
  private readonly linesCount: HTMLElement;
  private readonly linesInt: HTMLElement;
  private readonly gapsBtn: HTMLButtonElement;
  private readonly bookBtn: HTMLButtonElement;
  private readonly legend: HTMLElement;
  private readonly toastEl: HTMLElement;
  private readonly lines: LinesPanel;
  private readonly linesSheet: Sheet;
  private readonly settingsSheet: Sheet;
  private readonly book: Guidebook;
  private bookUnlocked = false;
  private gapsOn = false;
  private toastTimer = 0;
  private speedBeforeBook = 1;
  private shownCount = '';
  private shownInt = '';

  constructor(
    root: HTMLElement,
    private readonly world: World,
    private readonly clock: GameClock,
    private readonly handlers: MenuHandlers,
  ) {
    const layer = document.createElement('div');
    layer.className = 'menu';
    layer.innerHTML = `
      <div class="menu-toast" role="status"></div>
      <div class="gap-legend" aria-hidden="true">
        <span><i style="background:${GAP_COLOR.good}"></i>${t('gaps.good', { a: GAP_GOOD })}</span>
        <span><i style="background:${GAP_COLOR.ok}"></i>${t('gaps.ok', { a: GAP_GOOD, b: GAP_BAD })}</span>
        <span><i style="background:${GAP_COLOR.bad}"></i>${t('gaps.bad', { b: GAP_BAD })}</span>
      </div>
      <nav class="dock">
        <button class="dock-lines" aria-label="${t('menu.lines')}">
          <span class="dock-roundel">${icon('bus-2-fill')}</span>
          <span class="dock-lines-text"><b class="dock-count"></b><small class="dock-int"></small></span>
          <i class="dock-ready"></i>
        </button>
        <button class="round-btn dock-btn dock-gaps" aria-label="${t('menu.gaps')}" aria-pressed="false">${icon('pin-distance-fill')}</button>
        <button class="round-btn dock-btn dock-book locked" aria-label="${t('menu.book')}">${icon('book-2-fill')}<i class="dock-lock">${icon('lock-fill')}</i></button>
        <button class="round-btn dock-btn dock-settings" aria-label="${t('menu.settings')}">${icon('settings-3-fill')}</button>
      </nav>`;
    root.appendChild(layer);
    const q = <T extends HTMLElement>(sel: string) => layer.querySelector<T>(sel)!;
    this.dock = q('.dock');
    this.linesBtn = q('.dock-lines');
    this.linesCount = q('.dock-count');
    this.linesInt = q('.dock-int');
    this.gapsBtn = q('.dock-gaps');
    this.bookBtn = q('.dock-book');
    this.legend = q('.gap-legend');
    this.toastEl = q('.menu-toast');

    // ----- sheets -----
    this.linesSheet = new Sheet(layer, t('menu.lines'), 'route-fill');
    this.lines = new LinesPanel(this.linesSheet, world, handlers.onBuy, handlers.onSell, handlers.onOpenLine, handlers.onDenied);
    this.linesSheet.onChange = (open) => this.linesBtn.classList.toggle('active', open);

    this.settingsSheet = new Sheet(layer, t('menu.settings'), 'settings-3-fill');
    const settingsBtn = q<HTMLButtonElement>('.dock-settings');
    this.settingsSheet.onChange = (open) => settingsBtn.classList.toggle('active', open);
    this.buildSettings();

    this.book = new Guidebook(document.body, (open) => {
      // reading time: the city waits while the notebook is open
      if (open) {
        this.speedBeforeBook = clock.speed;
        clock.speed = 0;
      } else {
        clock.speed = this.speedBeforeBook;
      }
    });

    // ----- dock buttons -----
    this.linesBtn.onclick = () => {
      sfx.click();
      this.linesSheet.toggle();
    };
    settingsBtn.onclick = () => {
      sfx.click();
      this.settingsSheet.toggle();
    };
    this.gapsBtn.onclick = () => this.setGaps(!this.gapsOn);
    this.bookBtn.onclick = () => {
      if (!this.bookUnlocked) {
        sfx.deny();
        this.bookBtn.animate(wiggle, { duration: 380, easing: 'ease-out' });
        this.toast(t('book.locked'), 'lock-fill');
        return;
      }
      sfx.click();
      this.bookBtn.classList.remove('fresh');
      this.linesSheet.close(true);
      this.settingsSheet.close(true);
      this.book.open();
    };
  }

  private buildSettings(): void {
    const body = this.settingsSheet.body;
    body.innerHTML = `
      <label class="setting">
        <span class="setting-icon"></span>
        <span class="setting-text"><b>${t('settings.sound')}</b><small>${t('settings.soundHint')}</small></span>
        <button class="switch" role="switch" aria-label="${t('settings.sound')}"><i></i></button>
      </label>`;
    const sw = body.querySelector<HTMLButtonElement>('.switch')!;
    const ico = body.querySelector<HTMLElement>('.setting-icon')!;
    const paint = () => {
      sw.setAttribute('aria-checked', String(!sfx.muted));
      ico.innerHTML = icon(sfx.muted ? 'volume-mute-fill' : 'volume-up-fill');
    };
    paint();
    sw.onclick = () => {
      sfx.setMuted(!sfx.muted);
      sfx.toggle(!sfx.muted);
      paint();
    };
  }

  private setGaps(on: boolean): void {
    this.gapsOn = on;
    sfx.toggle(on);
    this.gapsBtn.setAttribute('aria-pressed', String(on));
    this.gapsBtn.animate([{ transform: 'scale(0.86)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }], { duration: 280, easing: 'ease-out' });
    this.legend.classList.toggle('show', on);
    this.handlers.onGaps(on);
  }

  /** short message above the dock */
  toast(text: string, iconName: IconName): void {
    this.toastEl.innerHTML = `${icon(iconName)}<span>${text}</span>`;
    this.toastEl.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toastEl.classList.remove('show'), 2600);
  }

  update(): void {
    const w = this.world;
    const count = `×${w.activeBuses.length}`;
    if (count !== this.shownCount) this.linesCount.textContent = this.shownCount = count;
    // the longest wait on any line is the one worth acting on
    const int = `~${Math.round(w.worstHeadway())} ${t('fleet.min')}`;
    if (int !== this.shownInt) this.linesInt.textContent = this.shownInt = int;
    // a green dot on the Lines button says "you can afford a bus" without a buy button on the map
    const canGrow = w.canBuy() || w.lines.some((L) => w.canOpenLine(L.index));
    this.linesBtn.classList.toggle('ready', canGrow && !this.linesSheet.isOpen);
    this.lines.update();

    if (!this.bookUnlocked && this.clock.day >= BOOK_DAY) {
      this.bookUnlocked = true;
      this.bookBtn.classList.remove('locked');
      this.bookBtn.classList.add('fresh');
      this.bookBtn.animate(wiggle, { duration: 600, easing: 'ease-out', iterations: 2 });
      sfx.star(2);
      this.toast(t('book.unlocked'), 'book-open-fill');
    }
    // keep the dock clear of the map while the notebook is open
    this.dock.classList.toggle('behind', this.book.isOpen);
  }
}
