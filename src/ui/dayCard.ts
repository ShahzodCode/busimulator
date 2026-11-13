import { t } from '../i18n';
import { DAILY_FIXED_COST, DaySummary } from '../sim/world';
import { formatMoney } from './hud';
import { sfx } from '../audio/sfx';

/** Picks the most useful real-world lesson for how today went. */
function pickTip(s: DaySummary): string {
  const halfHeadway = s.headway / 2;
  if (s.linesOpened > 0) return t('tip.newLine');
  // full buses at rush hour: the one-direction commuter wave
  if (s.leftBehind > 40 && s.day % 2 === 1) return t('tip.tidal', { n: s.leftBehind });
  if (s.buses >= 2 && s.avgWait > halfHeadway * 1.35 && s.avgWait > 6) return t('tip.bunching');
  if (s.avgWait > 9 || s.gaveUp > 10) return t('tip.headway', { h: Math.round(s.headway), w: Math.round(s.avgWait) });
  if (s.profit < s.revenue * 0.45) return t('tip.costs', { c: formatMoney(DAILY_FIXED_COST) });
  return t(['tip.happy', 'tip.traffic', 'tip.people'][s.day % 3]);
}

/** End-of-day results card. Resolves when the player taps "next day". */
export function showDayCard(s: DaySummary): Promise<void> {
  const stars = s.happiness >= 0.8 ? 3 : s.happiness >= 0.6 ? 2 : 1;
  const pct = (n: number) => `${n >= 0 ? '+' : ''}${Math.round(n * 100)}%`;
  const overlay = document.createElement('div');
  overlay.className = 'day-overlay';
  overlay.innerHTML = `
    <div class="day-card" role="dialog" aria-modal="true">
      <div class="day-stars">${[0, 1, 2].map((i) => `<span class="star ${i < stars ? 'on' : ''}" style="--i:${i}">★</span>`).join('')}</div>
      <h2>${t('day.title', { n: s.day })}</h2>
      <div class="day-grid">
        <div class="day-stat"><span class="ico">🧍</span><b>${s.served}</b><small>${t('day.served')}</small></div>
        <div class="day-stat ${s.gaveUp > 10 ? 'bad' : ''}"><span class="ico">🚕</span><b>${s.gaveUp}</b><small>${t('day.gaveUp')}</small></div>
        <div class="day-stat ${s.avgWait > 12 ? 'bad' : ''}"><span class="ico">⏱</span><b>${Math.round(s.avgWait)} ${t('fleet.min')}</b><small>${t('day.avgWait')}</small></div>
        <div class="day-stat"><span class="ico">😊</span><b>${Math.round(s.happiness * 100)}%</b><small>${t('day.happiness')}</small></div>
      </div>
      <div class="day-money">
        <div><span>${t('day.revenue')}</span><b class="pos">+${formatMoney(s.revenue)}</b></div>
        <div><span>${t('day.costs', { n: s.buses, c: formatMoney(DAILY_FIXED_COST) })}</span><b class="neg">−${formatMoney(s.costs)}</b></div>
        <div><span>${t('day.fuel')}</span><b class="neg">${s.fuelLitres.toFixed(1)} L · −${formatMoney(s.fuelCost)}</b></div>
        <div class="total"><span>${t('day.profit')}</span><b class="${s.profit >= 0 ? 'pos' : 'neg'}">${s.profit >= 0 ? '' : '−'}${formatMoney(Math.abs(s.profit))} ${t('hud.money')}</b></div>
        <div class="riders"><span>${t('day.riders')}</span><b class="${s.demandChange >= 0 ? 'pos' : 'neg'}">${pct(s.demandChange)}</b></div>
      </div>
      <div class="day-tip"><b>💡 ${t('tip.title')}</b><p>${pickTip(s)}</p></div>
      <button class="day-next">${t('day.next')} ▶</button>
    </div>`;
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  sfx.dayEnd();
  // star chimes, in time with the CSS star-pop animation
  for (let i = 0; i < stars; i++) setTimeout(() => sfx.star(i), 350 + i * 180 + 120);

  return new Promise((resolve) => {
    overlay.querySelector<HTMLButtonElement>('.day-next')!.onclick = () => {
      sfx.click();
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 300);
      resolve();
    };
  });
}
