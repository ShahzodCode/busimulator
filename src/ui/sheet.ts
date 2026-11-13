import { t } from '../i18n';
import { sfx } from '../audio/sfx';
import { icon, IconName } from './icons';

/**
 * A panel that slides up above the dock. The game keeps running and the map stays
 * draggable around it. Only one sheet is open at a time; drag it down or tap ✕ to close.
 */
export class Sheet {
  private static current: Sheet | null = null;
  readonly el: HTMLElement;
  readonly body: HTMLElement;
  private open_ = false;
  onChange?: (open: boolean) => void;

  constructor(parent: HTMLElement, title: string, iconName: IconName) {
    this.el = document.createElement('section');
    this.el.className = 'sheet';
    this.el.setAttribute('role', 'dialog');
    this.el.setAttribute('aria-label', title);
    this.el.inert = true;
    this.el.innerHTML = `
      <div class="sheet-grip"><span></span></div>
      <header class="sheet-head">
        <span class="sheet-icon">${icon(iconName)}</span>
        <h2>${title}</h2>
        <button class="round-btn sheet-close" aria-label="${t('menu.close')}">${icon('close-line')}</button>
      </header>
      <div class="sheet-body"></div>`;
    parent.appendChild(this.el);
    this.body = this.el.querySelector('.sheet-body')!;
    this.el.querySelector<HTMLButtonElement>('.sheet-close')!.onclick = () => this.close();
    this.dragToClose(this.el.querySelector('.sheet-grip')!);
    this.dragToClose(this.el.querySelector('.sheet-head')!);
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.open_) this.close();
    });
  }

  get isOpen(): boolean {
    return this.open_;
  }

  open(): void {
    if (this.open_) return;
    Sheet.current?.close(true);
    Sheet.current = this;
    this.open_ = true;
    this.el.inert = false;
    this.el.classList.add('open');
    sfx.whoosh(true);
    this.onChange?.(true);
  }

  close(quiet = false): void {
    if (!this.open_) return;
    this.open_ = false;
    if (Sheet.current === this) Sheet.current = null;
    this.el.inert = true;
    this.el.classList.remove('open');
    this.el.style.transform = '';
    if (!quiet) sfx.whoosh(false);
    this.onChange?.(false);
  }

  toggle(): void {
    if (this.open_) this.close();
    else this.open();
  }

  /** follow the finger down; let go past a third of the way (or with a flick) and it closes */
  private dragToClose(handle: HTMLElement): void {
    let startY = 0;
    let lastY = 0;
    let lastT = 0;
    let speed = 0;
    let dragging = false;
    handle.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      dragging = true;
      startY = lastY = e.clientY;
      lastT = e.timeStamp;
      speed = 0;
      handle.setPointerCapture(e.pointerId);
      this.el.classList.add('dragging');
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const dy = Math.max(0, e.clientY - startY);
      const dt = Math.max(1, e.timeStamp - lastT);
      speed = (e.clientY - lastY) / dt;
      lastY = e.clientY;
      lastT = e.timeStamp;
      this.el.style.transform = `translate(-50%, ${dy}px)`;
    });
    const end = (e: PointerEvent) => {
      if (!dragging) return;
      dragging = false;
      this.el.classList.remove('dragging');
      const dy = e.clientY - startY;
      this.el.style.transform = '';
      if (dy > this.el.offsetHeight / 3 || speed > 0.6) this.close();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }
}
