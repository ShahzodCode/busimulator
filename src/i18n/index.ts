import uz from './uz.json';

type Dict = Record<string, string | string[]>;
const dict: Dict = uz;

/** Translate a key. `{name}` placeholders are filled from `vars`. Missing keys show the key itself. */
export function t(key: string, vars: Record<string, string | number> = {}): string {
  const v = dict[key];
  const s = typeof v === 'string' ? v : key;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** All lines for a key (for random speech). Empty if missing. */
export function lines(key: string): string[] {
  const v = dict[key];
  return Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
}

/** A random line, preferring a more specific key (e.g. `say.waiting.maktab`) half the time. */
const recent: string[] = [];

export function say(key: string, specific?: string): string {
  const spec = specific ? lines(`${key}.${specific}`) : [];
  const pool = spec.length && Math.random() < 0.5 ? spec : lines(key);
  // avoid repeating anything said in the last few lines
  const fresh = pool.filter((l) => !recent.includes(l));
  const from = fresh.length ? fresh : pool;
  const line = from[Math.floor(Math.random() * from.length)] ?? '';
  recent.push(line);
  if (recent.length > 6) recent.shift();
  return line;
}
