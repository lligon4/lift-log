export const APP_VERSION = '1.1.0';

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

// Durations are stored as whole seconds (durationSec). v1 entries stored decimal minutes
// in durationMin; read those through here so old data keeps working.
export function entrySeconds(x) {
  if (x.durationSec !== '' && x.durationSec != null) return x.durationSec;
  if (x.durationMin !== '' && x.durationMin != null) return Math.round(num(x.durationMin) * 60);
  return '';
}

// 75 -> "1:15", 3725 -> "1:02:05", '' -> ''
export function fmtClock(sec) {
  if (sec === '' || sec == null) return '';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

// Timer-style entry from a numeric keypad: digits fill in from the right, so typing
// "130" gives "1:30". Returns the text to show and the seconds it means.
export function clockFromDigits(text) {
  const d = text.replace(/\D/g, '').replace(/^0+/, '').slice(0, 6);
  if (!d) return { text: '', sec: '' };
  const p = d.padStart(3, '0');
  const s = p.slice(-2);
  const rest = p.slice(0, -2);
  const h = rest.length > 2 ? rest.slice(0, -2) : '';
  const m = rest.length > 2 ? rest.slice(-2) : rest;
  return {
    text: h ? `${h}:${m}:${s}` : `${m}:${s}`,
    sec: Number(h || 0) * 3600 + Number(m) * 60 + Number(s),
  };
}

export function entrySummary(entry) {
  if (entry.timed) return fmtClock(entry.sets.reduce((sum, s) => sum + num(s.durationSec), 0));
  return `${fmtNum(volume(entry))} lb`;
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
