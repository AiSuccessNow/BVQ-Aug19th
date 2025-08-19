// /src/game.js
import { drawLetters, colorizeRow } from './ui/board.js';
import { msUntilTomorrow, fmtCountdown } from './date.js';
import { track } from './analytics.js';
import { EVT } from './analytics/events.js';

export function evaluate(guess, answer) {
  const size = guess.length;
  const res = Array(size).fill('absent');
  const a = answer.split('');
  const g = guess.split('');
  for (let i = 0; i < size; i++) {
    if (g[i] === a[i]) { res[i] = 'correct'; a[i] = '*'; g[i] = '_'; }
  }
  for (let i = 0; i < size; i++) {
    if (res[i] === 'correct') continue;
    const idx = a.indexOf(g[i]);
    if (idx > -1) { res[i] = 'present'; a[idx] = '*'; }
  }
  return res;
}

export function buildShareGrid(todayKey, dayReveals, finished) {
  const map = { correct:'🟩', present:'🟨', absent:'⬜' };
  const rows = (dayReveals || []).filter(Boolean).map(arr => arr.map(x => map[x] || '⬜').join(''));
  const status = finished ? `${rows.length}/6` : `X/6`;
  const title = `BibleVerseQuest — Daily ${todayKey} ${status}`;
  return `${title}\n${rows.join('\n')}\n${location.href}`.trim();
}

export function showToast(toastEl, text) {
  toastEl.textContent = text;
  toastEl.style.display = 'block';
  setTimeout(() => { toastEl.style.display = 'none'; }, 2200);
}

export function makeStartMarker(todayKey) {
  let started = false;
  return () => {
    if (!started) {
      started = true;
      track(EVT.START, { puzzle_id: todayKey, mode: 'normal' });
    }
  };
}

export function startCountdown(countdownEl) {
  function tick() {
    const ms = msUntilTomorrow();
    countdownEl.textContent = 'Next puzzle in ' + fmtCountdown(ms);
    requestAnimationFrame(() => setTimeout(tick, 250));
  }
  tick();
}

export function submit({
  row, col, size, maxRows,
  guesses, target, todayKey, kbdEl,
  setMessage, revealVerse, persistRows, persistReveals, setFinished
}) {
  if (setFinished.get()) { setMessage("You've played today's puzzle. Come back tomorrow!"); return { advanced:false }; }
  if (col < size) { setMessage('Not enough letters.'); return { advanced:false }; }

  const guess = guesses[row].join('');
  if (!/^[a-z]{5}$/.test(guess)) { setMessage('Letters only (A–Z).'); return { advanced:false }; }

  const result = evaluate(guess, target.w);
  colorizeRow(row, result, guesses, kbdEl);
  track(EVT.GUESS, { puzzle_id: todayKey, guess_count: row + 1 });

  persistRows(guesses);
  persistReveals(row, result);

  const win = result.every(x => x === 'correct');
  if (win) {
    setMessage(`Solved! “${target.w.toUpperCase()}” — ${target.r} (KJV)`);
    revealVerse();
    setFinished.set(true);
    track(EVT.WIN, { puzzle_id: todayKey, attempts: row + 1 });
    return { advanced:false, finished:true };
  }

  const nextRow = row + 1;
  if (nextRow === maxRows) {
    setMessage(`Answer: “${target.w.toUpperCase()}” — ${target.r} (KJV)`);
    revealVerse();
    setFinished.set(true);
    track(EVT.FAIL, { puzzle_id: todayKey, attempts: maxRows });
    return { advanced:false, finished:true };
  }

  return { advanced:true, nextRow };
}

export function handleInput(ch, ctx) {
  const { rowRef, colRef, size, guesses, draw, persistRows, onSubmit, markStart, setFinished } = ctx;
  if (setFinished.get()) return;

  if (ch === 'Enter') { onSubmit(); return; }

  if (ch === 'Backspace') {
    if (colRef.value > 0) {
      colRef.value--;
      guesses[rowRef.value][colRef.value] = '';
      draw(); persistRows(guesses);
    }
    return;
  }

  if (!/^[A-Za-z]$/.test(ch)) return;

  if (rowRef.value === 0 && colRef.value === 0) markStart();

  if (colRef.value < size) {
    guesses[rowRef.value][colRef.value] = ch.toLowerCase();
    colRef.value++;
    draw(); persistRows(guesses);
  }
}
