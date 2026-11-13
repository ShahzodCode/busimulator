/** Game clock. Time is in game minutes since midnight. The day stops at DAY_END until nextDay(). */
export class GameClock {
  /** game minutes per simulated second */
  static readonly BASE_RATE = 1;
  static readonly DAY_START = 6 * 60;
  static readonly DAY_END = 22 * 60;

  minutes = GameClock.DAY_START;
  day = 1;
  speed = 1;

  /** @param simDt simulated seconds (real seconds already multiplied by `speed`) */
  update(simDt: number): void {
    this.minutes = Math.min(GameClock.DAY_END, this.minutes + simDt * GameClock.BASE_RATE);
  }

  get dayOver(): boolean {
    return this.minutes >= GameClock.DAY_END;
  }

  nextDay(): void {
    this.minutes = GameClock.DAY_START;
    this.day += 1;
  }

  get hour(): number {
    return this.minutes / 60;
  }

  label(): string {
    const h = Math.floor(this.minutes / 60);
    const m = Math.floor(this.minutes % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
}
