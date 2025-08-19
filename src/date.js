// /src/date.js

/** Returns today's date id as YYYY-MM-DD (local time). */
export function dateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Rotates index by days since 2025-01-01 (safe modulo). */
export function dailyIndex(d = new Date(), n) {
  const start = new Date(2025, 0, 1);
  const oneDay = 86400000;
  const today = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const base = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const diff = Math.floor((today - base) / oneDay);
  return ((diff % n) + n) % n;
}

/** Milliseconds remaining to next local midnight. */
export function msUntilTomorrow() {
  const now = new Date();
  const tmr = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return tmr - now;
}

/** Formats milliseconds as "Hh MMm SSs". */
export function fmtCountdown(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return `${h}h ${String(m).padStart(2, '0')}m ${String(ss).padStart(2, '0')}s`;
}
