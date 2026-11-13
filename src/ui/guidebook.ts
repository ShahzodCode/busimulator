import { t } from '../i18n';
import { GAP_BAD, GAP_GOOD } from '../sim/world';
import { GAP_COLOR } from '../view/gapOverlay';
import { sfx } from '../audio/sfx';
import { icon, IconName } from './icons';

/** leaves swing up over the spiral binding to this angle, fading out as they go */
const FLIP = 104;

interface Page {
  key: string;
  icon: IconName;
  tint: string;
  extra?: string;
}

const PAGES: Page[] = [
  {
    key: 'p1',
    icon: 'timer-fill',
    tint: '#35c46a',
    extra: `<ul class="book-legend">
      <li><i style="background:${GAP_COLOR.good}"></i>${t('gaps.good', { a: GAP_GOOD })}</li>
      <li><i style="background:${GAP_COLOR.ok}"></i>${t('gaps.ok', { a: GAP_GOOD, b: GAP_BAD })}</li>
      <li><i style="background:${GAP_COLOR.bad}"></i>${t('gaps.bad', { b: GAP_BAD })}</li>
    </ul>`,
  },
  { key: 'p2', icon: 'alarm-warning-fill', tint: '#f0483e' },
  { key: 'p3', icon: 'group-fill', tint: '#8a5cf6' },
  { key: 'p5', icon: 'timer-fill', tint: '#1f9fb8' },
  { key: 'p4', icon: 'sparkling-2-fill', tint: '#ffb020' },
];

/**
 * The dispatcher's notebook: a spiral-bound pad whose pages flip up over the top.
 * Drag a page up to turn it (it follows your finger), drag down to turn back, or just tap.
 * Thin on purpose for now — pages are added as the game grows.
 */
export class Guidebook {
  private readonly overlay: HTMLElement;
  private readonly book: HTMLElement;
  private readonly leaves: HTMLElement[];
  private readonly dots: HTMLElement[];
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  /** how many leaves have been turned */
  private index = 0;
  private opened = false;

  constructor(
    parent: HTMLElement,
    private readonly onOpenChange: (open: boolean) => void,
  ) {
    const total = PAGES.length;
    const pages = PAGES.map((p, i) => {
      const note = t(`book.${p.key}.note`);
      return `
      <div class="leaf page">
        <span class="page-icon" style="--tint:${p.tint}">${icon(p.icon)}</span>
        <h3>${t(`book.${p.key}.title`)}</h3>
        <p>${t(`book.${p.key}.text`)}</p>
        ${p.extra ?? ''}
        ${note ? `<p class="page-note">${note}</p>` : ''}
        <span class="page-no">${i + 1} / ${total}</span>
      </div>`;
    }).join('');

    this.overlay = document.createElement('div');
    this.overlay.className = 'book-overlay';
    this.overlay.inert = true;
    this.overlay.innerHTML = `
      <div class="book-stage" role="dialog" aria-modal="true" aria-label="${t('book.title')}">
        <div class="book">
          <div class="book-back"></div>
          <div class="leaf cover">
            <div class="cover-plate">
              <span class="cover-icon">${icon('bus-2-fill')}</span>
              <h2>${t('book.title')}</h2>
              <small>${t('book.subtitle')}</small>
            </div>
            <span class="cover-hint">${t('book.open')}</span>
          </div>
          ${pages}
          <div class="book-rings">${'<i></i>'.repeat(9)}</div>
        </div>
        <div class="book-nav">
          <button class="round-btn book-prev" aria-label="${t('book.prev')}">${icon('arrow-left-s-line')}</button>
          <div class="book-dots">${'<i></i>'.repeat(total + 1)}</div>
          <button class="round-btn book-next" aria-label="${t('book.next')}">${icon('arrow-right-s-line')}</button>
        </div>
      </div>
      <button class="round-btn book-close" aria-label="${t('menu.close')}">${icon('close-line')}</button>`;
    parent.appendChild(this.overlay);

    this.book = this.overlay.querySelector('.book')!;
    this.leaves = [...this.overlay.querySelectorAll<HTMLElement>('.leaf')];
    this.dots = [...this.overlay.querySelectorAll<HTMLElement>('.book-dots i')];
    this.prevBtn = this.overlay.querySelector('.book-prev')!;
    this.nextBtn = this.overlay.querySelector('.book-next')!;
    // first leaf on top
    this.leaves.forEach((leaf, i) => (leaf.style.zIndex = String(this.leaves.length - i)));

    this.prevBtn.onclick = () => this.turn(-1);
    this.nextBtn.onclick = () => this.turn(1);
    this.overlay.querySelector<HTMLButtonElement>('.book-close')!.onclick = () => this.close();
    this.overlay.addEventListener('pointerdown', (e) => {
      if (e.target === this.overlay) this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (!this.opened) return;
      if (e.key === 'Escape') this.close();
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === ' ') this.turn(1);
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') this.turn(-1);
    });
    this.dragToTurn();
    this.paint();
  }

  get isOpen(): boolean {
    return this.opened;
  }

  open(): void {
    if (this.opened) return;
    this.opened = true;
    this.overlay.inert = false;
    this.overlay.classList.add('show');
    sfx.whoosh(true);
    this.onOpenChange(true);
  }

  close(): void {
    if (!this.opened) return;
    this.opened = false;
    this.overlay.inert = true;
    this.overlay.classList.remove('show');
    sfx.whoosh(false);
    this.onOpenChange(false);
  }

  /** turn one leaf forward (+1) or back (-1); the last leaf stays put */
  private turn(dir: number): void {
    const next = Math.min(this.leaves.length - 1, Math.max(0, this.index + dir));
    if (next === this.index) {
      // nothing left to turn: a small nudge says so
      this.book.animate([{ transform: 'translateX(0)' }, { transform: `translateX(${dir * 8}px)` }, { transform: 'translateX(0)' }], { duration: 220, easing: 'ease-out' });
      return;
    }
    this.index = next;
    sfx.page();
    this.paint();
  }

  private paint(): void {
    this.leaves.forEach((leaf, i) => leaf.classList.toggle('flipped', i < this.index));
    this.dots.forEach((dot, i) => dot.classList.toggle('on', i === this.index));
    this.prevBtn.disabled = this.index === 0;
    this.nextBtn.disabled = this.index === this.leaves.length - 1;
  }

  /** the page follows the finger; letting go past a third of the way finishes the turn */
  private dragToTurn(): void {
    let startY = 0;
    let leaf: HTMLElement | null = null;
    let forward = true;
    let progress = 0;
    let moved = false;
    let down = false;

    const pose = (el: HTMLElement, p: number) => {
      el.style.transform = `rotateX(${p * FLIP}deg)`;
      el.style.opacity = String(p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4);
    };
    const release = () => {
      if (!leaf) return;
      leaf.classList.remove('dragging');
      leaf.style.transform = '';
      leaf.style.opacity = '';
      leaf = null;
    };

    this.book.addEventListener('pointerdown', (e) => {
      down = true;
      moved = false;
      startY = e.clientY;
      this.book.setPointerCapture(e.pointerId);
    });
    this.book.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dy = e.clientY - startY;
      if (!moved) {
        if (Math.abs(dy) < 8) return;
        moved = true;
        forward = dy < 0;
        const i = forward ? this.index : this.index - 1;
        // the last leaf has nothing behind it, the cover has nothing before it
        leaf = i >= 0 && i < this.leaves.length - 1 ? this.leaves[i] : null;
        leaf?.classList.add('dragging');
      }
      if (!leaf) return;
      const travel = Math.min(1, Math.abs(dy) / (this.book.offsetHeight * 0.75));
      progress = forward ? (dy < 0 ? travel : 0) : dy > 0 ? 1 - travel : 1;
      pose(leaf, progress);
    });
    const end = () => {
      if (!down) return;
      down = false;
      if (!moved) {
        this.turn(1);
        return;
      }
      const had = leaf;
      const done = forward ? progress > 0.33 : progress < 0.67;
      release();
      if (had && done) this.turn(forward ? 1 : -1);
    };
    this.book.addEventListener('pointerup', end);
    this.book.addEventListener('pointercancel', () => {
      down = false;
      release();
    });
  }
}
