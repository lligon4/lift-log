import { get, getAll, put, del, getMeta, setMeta } from '../db.js';
import {
  uid, todayISO, workoutVolume, fmtNum, fmtDate, fmtTime, esc, debounce, toast,
  entrySeconds, fmtClock, clockFromDigits, entrySummary,
} from '../util.js';
import { openPicker } from './picker.js';
import { groupTemplates, saveWorkoutAsTemplate } from './templates.js';

// Entries come in three shapes: strength sets, timed sets, and a single duration
// (cardio/yoga). An entry keeps its shape even if its exercise's type changes later.
const shapeOfType = (type) => (type === 'strength' || type === 'timed' ? type : 'duration');
const shapeOf = (entry) => (entry.timed ? 'timed' : entry.sets ? 'strength' : 'duration');

function blankEntry(exerciseId, shape) {
  if (shape === 'strength') return { exerciseId, sets: [{ weight: '', targetReps: '', actualReps: '', done: false }] };
  if (shape === 'timed') return { exerciseId, timed: true, sets: [{ durationSec: '', done: false }] };
  return { exerciseId, durationSec: '', distanceMi: '' };
}

// Start from what was done last time: same number of sets, same weights/times,
// last time's reps as today's target. Cardio/yoga start blank.
function entryFromLast(exerciseId, shape, last) {
  if (shape === 'strength') {
    return {
      exerciseId,
      sets: last.sets.map((s) => ({
        weight: s.weight, targetReps: s.targetReps || s.actualReps, actualReps: '', done: false,
      })),
    };
  }
  if (shape === 'timed') {
    return { exerciseId, timed: true, sets: last.sets.map((s) => ({ durationSec: s.durationSec, done: false })) };
  }
  return blankEntry(exerciseId, shape);
}

// Suggest the template after the one used last, cycling within its group
// (Push -> Pull -> Push, Upper -> Lower -> Upper).
function nextTemplate(groups, workouts) {
  const all = groups.flatMap(([, list]) => list);
  if (!all.length) return null;
  const last = workouts
    .filter((w) => w.finishedAt && all.some((t) => t.id === w.templateId))
    .sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt || 0) - (a.startedAt || 0))[0];
  if (!last) return all[0];
  const group = groups.find(([, list]) => list.some((t) => t.id === last.templateId))[1];
  return group[(group.findIndex((t) => t.id === last.templateId) + 1) % group.length];
}

// Route: #/log            -> active workout (or "Start workout")
//        #/log/<id>       -> edit an existing (finished) workout
export async function render(root, params = []) {
  const editId = params[0];
  let workout = null;
  let exercises = new Map();
  let templates = []; // only loaded for the start screen

  async function loadExercises() {
    exercises = new Map((await getAll('exercises')).map((e) => [e.id, e]));
  }

  async function loadWorkout() {
    if (editId) return get('workouts', editId);
    const activeId = await getMeta('activeWorkoutId');
    if (!activeId) return null;
    const w = await get('workouts', activeId);
    if (!w) await setMeta('activeWorkoutId', null);
    return w || null;
  }

  // No-op once the workout is discarded, so a pending debounced save can't resurrect it.
  const save = () => (workout ? put('workouts', workout) : Promise.resolve());
  const saveSoon = debounce(save, 250);
  // Flush pending edits if the tab is hidden/closed mid-debounce.
  const flush = () => { if (workout && document.visibilityState === 'hidden') save(); };
  document.addEventListener('visibilitychange', flush);
  window.addEventListener('hashchange', () => document.removeEventListener('visibilitychange', flush), { once: true });

  // ---------- rendering ----------

  function setRow(s, si) {
    return `
      <div class="set-row${s.done ? ' done' : ''}" data-si="${si}">
        <span class="set-num">${si + 1}</span>
        <input type="text" inputmode="decimal" data-field="weight" value="${esc(s.weight)}" placeholder="lb" aria-label="Set ${si + 1} weight">
        <input type="text" inputmode="numeric" data-field="targetReps" value="${esc(s.targetReps)}" placeholder="—" aria-label="Set ${si + 1} target reps">
        <input type="text" inputmode="numeric" data-field="actualReps" value="${esc(s.actualReps)}" placeholder="—" aria-label="Set ${si + 1} actual reps"${
          s.actualReps !== '' && s.targetReps !== '' && Number(s.actualReps) < Number(s.targetReps) ? ' class="short"' : ''}>
        <label class="done-box"><input type="checkbox" data-field="done"${s.done ? ' checked' : ''} aria-label="Set ${si + 1} done"></label>
        <button class="icon-btn" data-act="del-set" aria-label="Delete set ${si + 1}">×</button>
      </div>`;
  }

  function timedRow(s, si) {
    return `
      <div class="set-row timed${s.done ? ' done' : ''}" data-si="${si}">
        <span class="set-num">${si + 1}</span>
        <input type="text" inputmode="numeric" data-field="durationSec" data-clock value="${esc(fmtClock(s.durationSec))}" placeholder="0:00" aria-label="Set ${si + 1} time">
        <label class="done-box"><input type="checkbox" data-field="done"${s.done ? ' checked' : ''} aria-label="Set ${si + 1} done"></label>
        <button class="icon-btn" data-act="del-set" aria-label="Delete set ${si + 1}">×</button>
      </div>`;
  }

  function card(entry, ei) {
    const ex = exercises.get(entry.exerciseId) || { name: '(deleted exercise)' };
    const head = `
      <div class="card-head">
        <h3><button class="title-btn" data-act="swap" aria-label="Change exercise (${esc(ex.name)})">${esc(ex.name)}<span class="caret" aria-hidden="true">▾</span></button></h3>
        ${entry.sets ? `<span class="vol" data-vol>${esc(entrySummary(entry))}</span>` : ''}
        <button class="btn ghost sm danger" data-act="del-entry" aria-label="Remove ${esc(ex.name)}">Remove</button>
      </div>`;
    if (entry.timed) {
      return `
        <section class="card" data-ei="${ei}">
          ${head}
          <div class="set-row timed labels"><span>Set</span><span>Time</span><span>✓</span><span></span></div>
          ${entry.sets.map((s, si) => timedRow(s, si)).join('')}
          <button class="btn ghost full" data-act="add-set">+ Set</button>
        </section>`;
    }
    if (entry.sets) {
      return `
        <section class="card" data-ei="${ei}">
          ${head}
          <div class="set-row labels"><span>Set</span><span>lb</span><span>Target</span><span>Actual</span><span>✓</span><span></span></div>
          ${entry.sets.map((s, si) => setRow(s, si)).join('')}
          <button class="btn ghost full" data-act="add-set">+ Set</button>
        </section>`;
    }
    return `
      <section class="card" data-ei="${ei}">
        ${head}
        <div class="row2">
          <label>Time<input type="text" inputmode="numeric" data-field="durationSec" data-clock value="${esc(fmtClock(entrySeconds(entry)))}" placeholder="0:00"></label>
          <label>Distance (mi)<input type="text" inputmode="decimal" data-field="distanceMi" value="${esc(entry.distanceMi ?? '')}" placeholder="optional"></label>
        </div>
      </section>`;
  }

  function templateButton(t, next = false) {
    const names = t.exerciseIds.map((id) => exercises.get(id)?.name).filter(Boolean);
    return `
      <li><button class="list-btn tpl-btn" data-start="${esc(t.id)}">
        <span class="grow">
          <span><strong>${esc(t.name)}</strong>${next ? ' <span class="tag accent">Next up</span>' : ''}</span>
          <span class="muted small clamp">${esc(names.join(', ')) || 'No exercises'}</span>
        </span>
        <span class="muted small">${names.length}</span>
      </button></li>`;
  }

  async function drawStart() {
    const [tpls, workouts] = await Promise.all([getAll('templates'), getAll('workouts')]);
    templates = tpls;
    const groups = groupTemplates(templates);
    const next = nextTemplate(groups, workouts);
    root.innerHTML = `
      <header class="page-head"><h1>Log</h1><span class="muted small">${fmtDate(todayISO())}</span></header>
      ${next ? `
        <ul class="list next-up">${templateButton(next, true)}</ul>
        ${groups.map(([g, list]) => `
          <h2 class="group-head">${esc(g)}</h2>
          <ul class="list">${list.map((t) => templateButton(t)).join('')}</ul>`).join('')}
        <button class="btn secondary full start-empty" data-act="start-empty">Empty workout</button>
        <a class="btn ghost full" href="#/templates">Manage templates</a>`
      : `
        <div class="start">
          <button class="btn primary big" data-act="start-empty">Start workout</button>
          <p><a class="btn ghost" href="#/templates">Create a template</a></p>
        </div>`}`;
  }

  function draw() {
    if (!workout) return drawStart();
    root.innerHTML = `
      <header class="page-head">
        <h1>${editId ? 'Edit workout' : 'Workout'}</h1>
        <span class="muted small">${workout.startedAt ? `Started ${fmtTime(workout.startedAt)}` : ''}</span>
      </header>
      <div class="row2 meta-row">
        <label>Date<input type="date" data-wfield="date" value="${esc(workout.date)}"></label>
        <div class="total"><span class="muted small">Total volume</span><strong data-total>${fmtNum(workoutVolume(workout))} lb</strong></div>
      </div>
      ${workout.entries.map(card).join('') || '<p class="empty">No exercises yet.</p>'}
      <button class="btn secondary full" data-act="pick">+ Add exercise</button>
      <label class="notes">Notes<textarea data-wfield="notes" rows="2" placeholder="How did it feel?">${esc(workout.notes)}</textarea></label>
      ${workout.entries.length ? '<button class="btn ghost full" data-act="save-tpl">Save as template</button>' : ''}
      <div class="actions sticky-actions">
        ${editId
          ? '<button class="btn primary full" data-act="done-edit">Done</button>'
          : `<button class="btn ghost" data-act="discard">Discard</button>
             <button class="btn primary grow" data-act="finish">Finish workout</button>`}
      </div>`;
  }

  function refreshTotals(ei) {
    const cardEl = root.querySelector(`.card[data-ei="${ei}"] [data-vol]`);
    if (cardEl) cardEl.textContent = entrySummary(workout.entries[ei]);
    const total = root.querySelector('[data-total]');
    if (total) total.textContent = `${fmtNum(workoutVolume(workout))} lb`;
  }

  // Most recent entry for this exercise in any other workout, if it has the same shape.
  async function lastEntry(exerciseId, shape) {
    const others = (await getAll('workouts'))
      .filter((w) => w.id !== workout.id)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt || 0) - (a.startedAt || 0));
    for (const w of others) {
      const e = w.entries.find((x) => x.exerciseId === exerciseId);
      if (e) return shapeOf(e) === shape ? e : null;
    }
    return null;
  }

  async function newEntry(exerciseId) {
    const shape = shapeOfType(exercises.get(exerciseId).type);
    const last = await lastEntry(exerciseId, shape);
    return last ? entryFromLast(exerciseId, shape, last) : blankEntry(exerciseId, shape);
  }

  // Keeps everything typed so far when the new exercise records the same kind of data.
  async function swapExercise(ei, exerciseId) {
    const entry = workout.entries[ei];
    if (entry.exerciseId === exerciseId) return;
    const ex = exercises.get(exerciseId);
    if (shapeOfType(ex.type) === shapeOf(entry)) {
      entry.exerciseId = exerciseId;
    } else {
      if (!confirm(`${ex.name} is tracked differently, so this exercise's inputs will be cleared. Continue?`)) return;
      workout.entries[ei] = await newEntry(exerciseId);
    }
    await save();
    draw();
  }

  async function addEntry(exerciseId) {
    workout.entries.push(await newEntry(exerciseId));
    await save();
    draw();
    const cards = root.querySelectorAll('.card');
    const last = cards[cards.length - 1];
    last?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    last?.querySelector('input')?.focus({ preventScroll: true });
  }

  // ---------- events ----------

  async function startWorkout(templateId) {
    workout = { id: uid(), date: todayISO(), startedAt: Date.now(), finishedAt: null, notes: '', entries: [] };
    if (templateId) workout.templateId = templateId;
    await save();
    await setMeta('activeWorkoutId', workout.id);
  }

  root.onclick = async (ev) => {
    const startBtn = ev.target.closest('[data-start]');
    if (startBtn) {
      const tpl = templates.find((t) => t.id === startBtn.dataset.start);
      if (!tpl) return;
      await startWorkout(tpl.id);
      for (const id of tpl.exerciseIds) {
        if (exercises.get(id) && !exercises.get(id).archived) workout.entries.push(await newEntry(id));
      }
      await save();
      draw();
      return;
    }
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const cardEl = btn.closest('.card');
    const ei = cardEl ? Number(cardEl.dataset.ei) : -1;

    if (act === 'start-empty') {
      await startWorkout();
      draw();
      openPicker(exercises, addEntry);
    } else if (act === 'pick') {
      openPicker(exercises, addEntry);
    } else if (act === 'swap') {
      openPicker(exercises, (id) => swapExercise(ei, id));
    } else if (act === 'save-tpl') {
      await save();
      await saveWorkoutAsTemplate(workout);
    } else if (act === 'add-set') {
      const entry = workout.entries[ei];
      const prev = entry.sets[entry.sets.length - 1];
      entry.sets.push(entry.timed
        ? { durationSec: prev?.durationSec ?? '', done: false }
        : { weight: prev?.weight ?? '', targetReps: prev?.targetReps ?? '', actualReps: '', done: false });
      await save();
      draw();
      const rows = root.querySelectorAll(`.card[data-ei="${ei}"] .set-row:not(.labels)`);
      rows[rows.length - 1]?.querySelector(entry.timed ? '[data-field=durationSec]' : '[data-field=actualReps]')?.focus();
    } else if (act === 'del-set') {
      const si = Number(btn.closest('.set-row').dataset.si);
      workout.entries[ei].sets.splice(si, 1);
      if (!workout.entries[ei].sets.length) workout.entries.splice(ei, 1);
      await save();
      draw();
    } else if (act === 'del-entry') {
      const name = exercises.get(workout.entries[ei].exerciseId)?.name || 'this exercise';
      if (!confirm(`Remove ${name} from this workout?`)) return;
      workout.entries.splice(ei, 1);
      await save();
      draw();
    } else if (act === 'finish') {
      if (!workout.entries.length) {
        if (!confirm('No exercises logged. Discard this workout?')) return;
        const id = workout.id;
        workout = null;
        await del('workouts', id);
      } else {
        workout.finishedAt = Date.now();
        await save();
        toast('Workout saved');
      }
      await setMeta('activeWorkoutId', null);
      location.hash = '#/history';
    } else if (act === 'discard') {
      if (!confirm('Discard this workout? This cannot be undone.')) return;
      const id = workout.id;
      workout = null;
      await del('workouts', id);
      await setMeta('activeWorkoutId', null);
      await draw();
    } else if (act === 'done-edit') {
      await save();
      toast('Changes saved');
      location.hash = '#/history';
    }
  };

  root.oninput = (ev) => {
    const t = ev.target;
    if (t.dataset.wfield) {
      workout[t.dataset.wfield] = t.value;
      saveSoon();
      return;
    }
    const field = t.dataset.field;
    if (!field || field === 'done') return;
    const ei = Number(t.closest('.card').dataset.ei);
    const entry = workout.entries[ei];
    const target = entry.sets ? entry.sets[Number(t.closest('.set-row').dataset.si)] : entry;
    if ('clock' in t.dataset) {
      const { text, sec } = clockFromDigits(t.value);
      t.value = text;
      target[field] = sec;
      delete target.durationMin; // v1 field, superseded by durationSec
    } else {
      target[field] = t.value.trim();
    }
    if (entry.sets && !entry.timed) {
      const actual = t.closest('.set-row').querySelector('[data-field=actualReps]');
      actual.classList.toggle('short', target.actualReps !== '' && target.targetReps !== '' && Number(target.actualReps) < Number(target.targetReps));
    }
    refreshTotals(ei);
    saveSoon();
  };

  root.onchange = (ev) => {
    const t = ev.target;
    // Tidy "0:90" into "1:30" once the field is left.
    if ('clock' in t.dataset) { t.value = fmtClock(clockFromDigits(t.value).sec); return; }
    if (t.dataset.field !== 'done') return;
    const row = t.closest('.set-row');
    const ei = Number(t.closest('.card').dataset.ei);
    const entry = workout.entries[ei];
    const s = entry.sets[Number(row.dataset.si)];
    s.done = t.checked;
    // Checking a set off with no actual reps means "hit the target".
    if (s.done && !entry.timed && s.actualReps === '' && s.targetReps !== '') {
      s.actualReps = s.targetReps;
      row.querySelector('[data-field=actualReps]').value = s.actualReps;
    }
    row.classList.toggle('done', s.done);
    refreshTotals(ei);
    save();
  };

  await loadExercises();
  workout = await loadWorkout();
  if (editId && !workout) {
    root.innerHTML = '<p class="empty">Workout not found.</p>';
    return;
  }
  await draw();
}
