// /src/main.js
import { track, initInstallAnalytics } from './analytics.js';
import { EVT } from './analytics/events.js';
import { WORDS } from './words.js';
import { dateKey, dailyIndex } from './date.js';
import * as store from './state.js';
import { initBoard, drawLetters } from './ui/board.js';
import { initKeyboard } from './ui/keyboard.js';
import { buildShareGrid, showToast, startCountdown, makeStartMarker, submit, handleInput } from './game.js';

// ---------- DOM ----------
const boardEl     = document.getElementById('board');
const kbdEl       = document.getElementById('kbd');
const msgEl       = document.getElementById('msg');
const countdownEl = document.getElementById('countdown');
const helpBtn     = document.getElementById('helpBtn');
const helpBox     = document.getElementById('helpBox');
const verseBox    = document.getElementById('verseBox');
const shareBtn    = document.getElementById('shareBtn');
const toastEl     = document.getElementById('toast');

// Create/ensure a "New Game" button (appends next to Share)
function ensureNewGameButton() {
  let btn = document.getElementById('newGameBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'newGameBtn';
    btn.className = 'btn primary';
    btn.type = 'button';
    btn.textContent = 'New Game';
    if (shareBtn && shareBtn.parentElement) {
      shareBtn.parentElement.appendChild(btn);
    } else {
      document.body.appendChild(btn);
    }
  }
  return btn;
}

// Create/ensure a quota/reset message container (appends near the buttons)
function ensureQuotaMsgEl() {
  let el = document.getElementById('quotaMsg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'quotaMsg';
    el.className = 'quota-msg';
    if (shareBtn && shareBtn.parentElement) {
      shareBtn.parentElement.appendChild(el);
    } else {
      document.body.appendChild(el);
    }
  }
  return el;
}

const newGameBtn = ensureNewGameButton();
const quotaMsgEl = ensureQuotaMsgEl();

// ---------- Analytics ----------
initInstallAnalytics((which) => {
  if (which === 'INSTALL_SHOWN') track(EVT.INSTALL_SHOWN);
  if (which === 'INSTALLED')     track(EVT.INSTALLED);
});
document.addEventListener('DOMContentLoaded', () => {
  track(EVT.APP_LOADED, { build: 'BVQ-v1.0.0', lang: navigator.language });
});

// ---------- State (per day) ----------
const maxRows  = 6, size = 5;
const todayKey = dateKey();
const state    = store.load();
const day      = store.ensureDay(state, todayKey);

// DAILY TARGET (unchanged: same daily word)
const idx     = dailyIndex(new Date(), WORDS.length);
const target  = WORDS[idx];

// --- Daily play quota (count on START) ---
const MAX_PLAYS = 3;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const FINISH_CLEAR_DELAY_MS = 1200; // time to let users see result/verse before clearing

// Initialize new fields if missing
if (typeof day.playCount !== 'number') day.playCount = 0;
if (typeof day.attemptStartedAt !== 'number') day.attemptStartedAt = 0;
if (typeof day.lastActivityAt !== 'number') day.lastActivityAt = 0;
if (typeof day.expired !== 'boolean') day.expired = false;
store.save(state);

function playsRemaining() { return Math.max(0, MAX_PLAYS - (day.playCount || 0)); }
function nextResetDate() { const d = new Date(); d.setHours(24, 0, 0, 0); return d; }
function formatTime(d) { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); }
function hasActiveAttempt() {
  // Active if started, not finished, not expired, and within idle window
  if (!day.attemptStartedAt) return false;
  if (day.finished) return false;
  if (day.expired) return false;
  const last = day.lastActivityAt || day.attemptStartedAt;
  return (Date.now() - last) < IDLE_TIMEOUT_MS;
}

// ---------- Grid state (restore prior input) ----------
let rowRef = { value: Math.min(maxRows, day.rows?.length || 0) };
let colRef = { value: 0 };
let guesses = Array.from({ length: maxRows }, (_, r) => {
  const saved = day.rows?.[r] || [];
  return Array.from({ length: size }, (_, c) => saved[c] || '');
});

// ---------- Helpers to mutate UI + persist ----------
function setMessage(t) { msgEl.textContent = t; day.msg = t; store.save(state); }
function draw() { drawLetters(guesses); }
function persistRows(next) { day.rows = next.map(r => r.slice()); store.save(state); }
function persistReveals(r, result) {
  day.reveals = day.reveals || [];
  day.reveals[r] = result.slice();
  store.save(state);
}
function revealVerse() {
  verseBox.style.display = 'block';
  verseBox.textContent = `${target.r} — ${target.v}`;
}

function clearGrid({ keepVerse = true } = {}) {
  // Clear only the board state; do NOT alter day.msg so finish/expiry messages persist
  day.rows = [];
  day.reveals = [];
  store.save(state);

  rowRef.value = 0;
  colRef.value = 0;
  guesses = Array.from({ length: maxRows }, () => Array.from({ length: size }, () => ''));
  draw();

  if (!keepVerse) {
    verseBox.style.display = 'none';
  }
}


// --- Input locking & controls ---
let inputLocked = false;
function setInputLocked(v) {
  inputLocked = !!v;
  if (kbdEl) kbdEl.style.pointerEvents = v ? 'none' : 'auto';
  if (newGameBtn) {
    // While an attempt is active: disable New Game
    // After finish or expiry: enable if plays remain
    if (hasActiveAttempt()) newGameBtn.disabled = true;
    else newGameBtn.disabled = (playsRemaining() === 0);
  }
}

function renderQuotaMessage() {
  if (!quotaMsgEl) return;
  const left = playsRemaining();
  const resetAt = formatTime(nextResetDate());
  quotaMsgEl.textContent =
    left > 0
      ? `You can play ${left} more time${left === 1 ? '' : 's'} today (max ${MAX_PLAYS}). Your game will reset tomorrow at ${resetAt}.`
      : `Daily limit reached (max ${MAX_PLAYS}). Your game will reset tomorrow at ${resetAt}.`;
  if (newGameBtn) newGameBtn.disabled = hasActiveAttempt() || left === 0;
}

// Clears the board/state for a fresh attempt (same daily word)
// NOTE: Counts a play *on start*
function startNewAttempt() {
  if (playsRemaining() === 0) return;

  // Count the play now
  day.playCount = (day.playCount || 0) + 1;

  // Reset per-attempt state
  day.rows = [];
  day.reveals = [];
  day.msg = '';
  day.finished = false;
  day.expired = false;
  day.attemptStartedAt = Date.now();
  day.lastActivityAt = day.attemptStartedAt;
  store.save(state);

  // Reset in-memory grid + UI
  rowRef.value = 0;
  colRef.value = 0;
  guesses = Array.from({ length: maxRows }, () => Array.from({ length: size }, () => ''));
  draw();
  setMessage('');
  verseBox.style.display = 'none'; // hide verse until finish

  setInputLocked(false);    // unlock typing
  renderQuotaMessage();     // reflect decremented plays
}

// Called once when the game transitions to "finished"
function onGameFinished() {
  // Count already happened at start. Lock input; show verse via existing flow.
  setInputLocked(true);
  renderQuotaMessage();

  // Briefly show the completed state & verse, then clear the grid (no auto-start)
  setTimeout(() => {
    // Keep the verse visible so players can still read it after clear
    clearGrid({ keepVerse: true });

    // After clear: enable "New Game" if plays remain
    if (newGameBtn) newGameBtn.disabled = (playsRemaining() === 0);
  }, FINISH_CLEAR_DELAY_MS);
}


// Expire an in-progress attempt after 30 minutes idle
function expireAttemptIfIdle() {
  if (!day.attemptStartedAt || day.finished || day.expired) return;

  const last = day.lastActivityAt || day.attemptStartedAt;
  if ((Date.now() - last) >= IDLE_TIMEOUT_MS) {
    day.expired = true;
    store.save(state);

    // Lock input, inform the user, and clear the grid (hide verse since it wasn’t solved)
    setInputLocked(true);
    clearGrid({ keepVerse: false });
    renderQuotaMessage();

    setMessage('Your previous game expired after 30 minutes of inactivity. Click “New Game” to try again.');
    showToast(toastEl, 'Game expired after 30 minutes of inactivity.');
  }
}

// Update last-activity timestamp
function bumpActivity() {
  if (!day.attemptStartedAt || day.finished || day.expired) return;
  day.lastActivityAt = Date.now();
  store.save(state);
}

// Wrap setFinished to trigger finish handling (no counting here)
const setFinished = {
  set(v) {
    const prev = !!day.finished;
    day.finished = !!v;
    store.save(state);
    if (!prev && day.finished) {
      onGameFinished();
    }
  },
  get() { return !!day.finished; }
};

// ---------- UI init ----------
initBoard(boardEl, { rows: maxRows, cols: size });
draw();
if (day.msg) setMessage(day.msg);

// Keep verse visible if a previous attempt finished
if (day.finished) revealVerse();

// On load, check if an attempt has gone idle and should expire
expireAttemptIfIdle();

// Show countdown you already have
startCountdown(countdownEl);

// Initial quota UI + input lock depending on current state
renderQuotaMessage();
setInputLocked(hasActiveAttempt() || playsRemaining() === 0);

// ---------- Input wiring ----------
const markStart = makeStartMarker(todayKey);

// Gate all input through a small guard so finished/locked state is respected
function processKey(rawKey) {
  if (inputLocked) return;
  // record activity for idle timer
  bumpActivity();

  const key = rawKey && rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;
  handleInput(key, ctx());
}

initKeyboard(kbdEl, (key) => processKey(key));
window.addEventListener('keydown', (e) => processKey(e.key));

// Periodic idle check (in case tab stays open)
setInterval(expireAttemptIfIdle, 30 * 1000); // check every 30s

// Also re-check when returning to the tab
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    expireAttemptIfIdle();
    renderQuotaMessage();
    setInputLocked(hasActiveAttempt() || playsRemaining() === 0);
  }
});

// ---------- Submit wrapper (unchanged) ----------
function onSubmit() {
  const result = submit({
    row: rowRef.value, col: colRef.value, size, maxRows,
    guesses, target, todayKey, kbdEl,
    setMessage, revealVerse, persistRows, persistReveals, setFinished
  });

  if (result.advanced) {
    rowRef.value = result.nextRow;
    colRef.value = 0;
  }
}

// ---------- Context object for handleInput ----------
function ctx() {
  return { rowRef, colRef, size, guesses, draw, persistRows, onSubmit, markStart, setFinished };
}

// ---------- Help toggle ----------
helpBtn.addEventListener('click', () => {
  helpBox.style.display = (helpBox.style.display === 'block') ? 'none' : 'block';
});

// ---------- "New Game" button wiring ----------
newGameBtn.addEventListener('click', () => {
  // Only allow starting if not active and plays remain
  if (hasActiveAttempt()) return;
  if (playsRemaining() === 0) return;

  startNewAttempt();
});

// ---------- Sharing ----------
shareBtn.addEventListener('click', async () => {
  const text = buildShareGrid(todayKey, day.reveals, day.finished);
  try {
    if (navigator.share) {
      await navigator.share({ text });
      track(EVT.SHARE, { puzzle_id: todayKey, method: 'web_share' });
      return;
    }
  } catch {}
  try {
    await navigator.clipboard.writeText(text);
    showToast(toastEl, 'Copied result to clipboard!');
    track(EVT.SHARE, { puzzle_id: todayKey, method: 'clipboard' });
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(toastEl, 'Copied result to clipboard!');
    track(EVT.SHARE, { puzzle_id: todayKey, method: 'textarea' });
  }
});

// ---------- PWA Service Worker (subpath-safe for GitHub Pages) ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .catch(err => console.warn('SW register failed:', err));
  });
}
function setInputLocked(v) {
  inputLocked = !!v;
  if (kbdEl) kbdEl.style.pointerEvents = v ? 'none' : 'auto';
  if (newGameBtn) {
    const active = hasActiveAttempt();
    newGameBtn.disabled = active || (playsRemaining() === 0);
    newGameBtn.style.display = active ? 'none' : 'inline-flex'; // <-- hide while active
  }
}
