// /src/main.js
import { track, initInstallAnalytics } from './analytics.js';
import { EVT } from './analytics/events.js';
import { WORDS } from './words.js';
import { dateKey, dailyIndex } from './date.js';
import * as store from './state.js';
import { initBoard, drawLetters } from './ui/board.js';
import { initKeyboard } from './ui/keyboard.js';
import { buildShareGrid, showToast, startCountdown, makeStartMarker, submit, handleInput } from './game.js';

// DOM
const boardEl = document.getElementById('board');
const kbdEl   = document.getElementById('kbd');
const msgEl   = document.getElementById('msg');
const countdownEl = document.getElementById('countdown');
const helpBtn = document.getElementById('helpBtn');
const helpBox = document.getElementById('helpBox');
const verseBox = document.getElementById('verseBox');
const shareBtn = document.getElementById('shareBtn');
const toastEl = document.getElementById('toast');

// Analytics
initInstallAnalytics((which) => {
  if (which === 'INSTALL_SHOWN') track(EVT.INSTALL_SHOWN);
  if (which === 'INSTALLED') track(EVT.INSTALLED);
});
document.addEventListener('DOMContentLoaded', () => {
  track(EVT.APP_LOADED, { build: 'BVQ-v1.0.0', lang: navigator.language });
});

// State (per day)
const maxRows = 6, size = 5;
const todayKey = dateKey();
const state = store.load();
const day = store.ensureDay(state, todayKey);
const idx = dailyIndex(new Date(), WORDS.length);
const target = WORDS[idx];

// Grid state (restore prior input)
let rowRef = { value: Math.min(maxRows, day.rows?.length || 0) };
let colRef = { value: 0 };
let guesses = Array.from({ length: maxRows }, (_, r) => {
  const saved = day.rows?.[r] || [];
  return Array.from({ length: size }, (_, c) => saved[c] || '');
});

// Helpers to mutate UI + persist
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
const setFinished = {
  set(v) { day.finished = !!v; store.save(state); },
  get() { return !!day.finished; }
};

// UI init
initBoard(boardEl, { rows: maxRows, cols: size });
draw();
if (day.msg) setMessage(day.msg);
if (day.finished) revealVerse();
startCountdown(countdownEl);

// Input wiring
const markStart = makeStartMarker(todayKey);
initKeyboard(kbdEl, (key) => handleInput(key, ctx()));
window.addEventListener('keydown', (e) => {
  handleInput(e.key.length === 1 ? e.key.toUpperCase() : e.key, ctx());
});

// Submit wrapper
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

// Context object for handleInput
function ctx() {
  return { rowRef, colRef, size, guesses, draw, persistRows, onSubmit, markStart, setFinished };
}

// Help toggle
helpBtn.addEventListener('click', () => {
  helpBox.style.display = (helpBox.style.display === 'block') ? 'none' : 'block';
});

// Sharing
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

// PWA Service Worker (subpath-safe for GitHub Pages)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .catch(err => console.warn('SW register failed:', err));
  });
}
