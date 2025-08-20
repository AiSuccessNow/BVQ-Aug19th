// /src/main.js
import { track, initInstallAnalytics } from './analytics.js';
import { EVT } from './analytics/events.js';
import { WORDS } from './words.js';
import { dateKey, dailyIndex } from './date.js';
import * as store from './state.js';
import { initBoard, drawLetters } from './ui/board.js';
import { initKeyboard } from './ui/keyboard.js';
import { buildShareGrid, showToast, startCountdown, makeStartMarker, submit, handleInput } from './game.js';

/* ---- Error surfacing ---- */
window.onerror = (msg, src, line, col, err) => {
  console.error('[AppError]', msg, src, line, col, err);
  try { showToast(document.getElementById('toast'), String(msg)); } catch {}
};
window.onunhandledrejection = (e) => {
  console.error('[UnhandledRejection]', e.reason);
  try { showToast(document.getElementById('toast'), 'Something went wrong.'); } catch {}
};

/* ---- DOM (safe) ---- */
const $ = (id) => document.getElementById(id);

const boardEl     = $('board');
const kbdEl       = $('kbd');
const msgEl       = $('msg');
const countdownEl = $('countdown');
const helpBtn     = $('helpBtn');
const helpBox     = $('helpBox');
const verseBox    = $('verseBox');
const shareBtn    = $('shareBtn');
const toastEl     = $('toast');

/* Ensure footer controls exist (self-healing if missing in HTML) */
function ensureNewGameButton() {
  let btn = $('newGameBtn');
  if (!btn) {
    btn = document.createElement('button');
    btn.id = 'newGameBtn';
    btn.className = 'btn primary';
    btn.type = 'button';
    btn.textContent = 'New Game';
    const btnRow =
      (shareBtn && shareBtn.parentElement) ||
      document.querySelector('.site-footer .btns') ||
      document.body;
    btnRow.appendChild(btn);
  }
  return btn;
}
function ensureQuotaMsgEl() {
  let el = $('quotaMsg');
  if (!el) {
    el = document.createElement('div');
    el.id = 'quotaMsg';
    el.className = 'quota-msg';
    const btnRow =
      (shareBtn && shareBtn.parentElement) ||
      document.querySelector('.site-footer .btns') ||
      document.body;
    btnRow.appendChild(el);
  }
  return el;
}

const newGameBtn = ensureNewGameButton();
const quotaMsgEl = ensureQuotaMsgEl();

/* ---- Analytics ---- */
initInstallAnalytics((which) => {
  if (which === 'INSTALL_SHOWN') track(EVT.INSTALL_SHOWN);
  if (which === 'INSTALLED')     track(EVT.INSTALLED);
});
document.addEventListener('DOMContentLoaded', () => {
  track(EVT.APP_LOADED, { build: 'BVQ-v1.0.0', lang: navigator.language });
});

/* ---- State (per day) ---- */
const maxRows  = 6, size = 5;
const todayKey = dateKey();
const state    = store.load();
const day      = store.ensureDay(state, todayKey);

/* Daily target word */
const idx    = dailyIndex(new Date(), WORDS.length);
const target = WORDS[idx];

/* ---- Daily quota: count on START ---- */
const MAX_PLAYS = 3;
const IDLE_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
const FINISH_CLEAR_DELAY_MS = 1200;     // show result briefly before clearing

// Initialize new fields if missing
if (typeof day.playCount !== 'number')        day.playCount = 0;
if (typeof day.attemptStartedAt !== 'number') day.attemptStartedAt = 0;
if (typeof day.lastActivityAt !== 'number')   day.lastActivityAt = 0;
if (typeof day.expired !== 'boolean')         day.expired = false;
store.save(state);

function playsRemaining() { return Math.max(0, MAX_PLAYS - (day.playCount || 0)); }
function nextResetDate()  { const d = new Date(); d.setHours(24, 0, 0, 0); return d; }
function formatTime(d)    { return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); }
function hasActiveAttempt() {
  if (!day.attemptStartedAt) return false;
  if (day.finished || day.expired) return false;
  const last = day.lastActivityAt || day.attemptStartedAt;
  return (Date.now() - last) < IDLE_TIMEOUT_MS;
}

/* ---- Grid state (restore prior input) ---- */
let rowRef = { value: Math.min(maxRows, day.rows?.length || 0) };
let colRef = { value: 0 };
let guesses = Array.from({ length: maxRows }, (_, r) => {
  const saved = day.rows?.[r] || [];
  return Array.from({ length: size }, (_, c) => saved[c] || '');
});

/* ---- Helpers (UI + persist) ---- */
function setMessage(t) {
  if (msgEl) msgEl.textContent = t;
  day.msg = t; store.save(state);
}
function draw() { drawLetters(guesses); }
function persistRows(next) { day.rows = next.map(r => r.slice()); store.save(state); }
function persistReveals(r, result) {
  day.reveals = day.reveals || [];
  day.reveals[r] = result.slice();
  store.save(state);
}
function revealVerse() {
  if (!verseBox) return;
  verseBox.style.display = 'block';
  verseBox.textContent = `${target.r} — ${target.v}`;
}
function clearGrid({ keepVerse = true } = {}) {
  day.rows = [];
  day.reveals = [];
  store.save(state);

  rowRef.value = 0;
  colRef.value = 0;
  guesses = Array.from({ length: maxRows }, () => Array.from({ length: size }, () => ''));
  draw();

  if (!keepVerse && verseBox) verseBox.style.display = 'none';
}

/* ---- Input locking & controls ---- */
let inputLocked = false;
function setInputLocked(v) {
  inputLocked = !!v;
  if (kbdEl) kbdEl.style.pointerEvents = v ? 'none' : 'auto';
  if (newGameBtn) newGameBtn.disabled = hasActiveAttempt() || (playsRemaining() === 0);
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

/* ---- Attempt lifecycle ---- */
// Counts a play at start; prepares a fresh board (same daily target)
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
  if (verseBox) verseBox.style.display = 'none'; // hide verse until finished

  setInputLocked(false);
  renderQuotaMessage();
}

// Called once when transitioning to finished
function onGameFinished() {
  setInputLocked(true);
  renderQuotaMessage();

  // Briefly show completed grid + verse, then clear board (no auto-start)
  setTimeout(() => {
    clearGrid({ keepVerse: true }); // keep verse visible
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

    setInputLocked(true);
    clearGrid({ keepVerse: false }); // no verse on expiry
    renderQuotaMessage();

    setMessage('Your previous game expired after 30 minutes of inactivity. Click “New Game” to try again.');
    try { showToast(toastEl, 'Game expired after 30 minutes of inactivity.'); } catch {}
  }
}

// Update last-activity timestamp on interaction
function bumpActivity() {
  if (!day.attemptStartedAt || day.finished || day.expired) return;
  day.lastActivityAt = Date.now();
  store.save(state);
}

// Wrap setFinished to fire finish handling (counting already done on start)
const setFinished = {
  set(v) {
    const prev = !!day.finished;
    day.finished = !!v;
    store.save(state);
    if (!prev && day.finished) onGameFinished();
  },
  get() { return !!day.finished; }
};

/* ---- UI init ---- */
if (boardEl) {
  initBoard(boardEl, { rows: maxRows, cols: size });
  draw();
}
if (day.msg) setMessage(day.msg);
if (day.finished) revealVerse();
expireAttemptIfIdle();
if (countdownEl) startCountdown(countdownEl);
renderQuotaMessage();
setInputLocked(hasActiveAttempt() || playsRemaining() === 0);

/* ---- Input wiring ---- */
const markStart = makeStartMarker(todayKey);

function processKey(rawKey) {
  if (inputLocked) return;
  bumpActivity();
  const key = rawKey && rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;
  handleInput(key, ctx());
}

if (kbdEl) initKeyboard(kbdEl, (key) => processKey(key));
window.addEventListener('keydown', (e) => processKey(e.key));

setInterval(expireAttemptIfIdle, 30 * 1000); // periodic idle check
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    expireAttemptIfIdle();
    renderQuotaMessage();
    setInputLocked(hasActiveAttempt() || playsRemaining() === 0);
  }
});

/* ---- Submit wrapper ---- */
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

/* ---- Context for handleInput ---- */
function ctx() {
  return { rowRef, colRef, size, guesses, draw, persistRows, onSubmit, markStart, setFinished };
}

/* ---- Help toggle ---- */
if (helpBtn && helpBox) {
  helpBtn.addEventListener('click', () => {
    helpBox.style.display = (helpBox.style.display === 'block') ? 'none' : 'block';
  });
}

/* ---- New Game button ---- */
newGameBtn.addEventListener('click', () => {
  if (hasActiveAttempt()) return;
  if (playsRemaining() === 0) return;
  startNewAttempt();
});

/* ---- Sharing ---- */
if (shareBtn) {
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
}

/* ---- PWA Service Worker ---- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .catch(err => console.warn('SW register failed:', err));
  });
}
