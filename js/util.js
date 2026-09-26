export const APP_VERSION = '1.0.0';

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 10);
}

export function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

// Volume = Σ(weight × actualReps); computed on the fly, never stored.
export function volume(entry) {
  if (!entry.sets) return 0;
  return entry.sets.reduce((sum, s) => sum + num(s.weight) * num(s.actualReps), 0);
}

export function workoutVolume(w) {
  return w.entries.reduce((sum, e) => sum + volume(e), 0);
}

export function workoutSetCount(w) {
  return w.entries.reduce((sum, e) => sum + (e.sets ? e.sets.length : 0), 0);
}

export function fmtNum(n) {
  return Math.round(n).toLocaleString();
}

export function fmtDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  });
}

export function fmtTime(ts) {
  return ts ? new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '';
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}
