// /src/state.js
const LS_KEY = 'bibleversequest_status_v1';

export function load() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
  catch { return {}; }
}

export function save(state) {
  localStorage.setItem(LS_KEY, JSON.stringify(state));
}

export function ensureDay(state, todayKey) {
  if (!state[todayKey]) state[todayKey] = { finished:false, rows:[], msg:'', reveals:[] };
  return state[todayKey];
}
