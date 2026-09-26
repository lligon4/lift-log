import { get, getAll, put, del, getMeta, setMeta } from '../db.js';
import { MUSCLE_GROUPS } from '../seed.js';
import {
  uid, todayISO, volume, workoutVolume, fmtNum, fmtDate, fmtTime, esc, debounce, toast,
} from '../util.js';
import { exerciseFormHTML, createExerciseFromForm } from './exercises.js';

// Route: #/log            -> active workout (or "Start workout")
//        #/log/<id>       -> edit an existing (finished) workout
export async function render(root, params = []) {
  const editId = params[0];
  let workout = null;
  let exercises = new Map();

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

  function card(entry, ei) {
    const ex = exercises.get(entry.exerciseId) || { name: '(deleted exercise)', type: entry.sets ? 'strength' : 'cardio' };
    const head = `
      <div class="card-head">
        <h3>${esc(ex.name)}</h3>
        ${entry.sets ? `<span class="vol" data-vol>${fmtNum(volume(entry))} lb</span>` : ''}
        <button class="btn ghost sm danger" data-act="del-entry" aria-label="Remove ${esc(ex.name)}">Remove</button>
      </div>`;
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
          <label>Duration (min)<input type="text" inputmode="decimal" data-field="durationMin" value="${esc(entry.durationMin)}"></label>
          <label>Distance (mi)<input type="text" inputmode="decimal" data-field="distanceMi" value="${esc(entry.distanceMi ?? '')}" placeholder="optional"></label>
        </div>
      </section>`;
  }

  function draw() {
    if (!workout) {
      root.innerHTML = `
        <header class="page-head"><h1>Log</h1></header>
        <div class="start">
          <p class="muted">${fmtDate(todayISO())}</p>
          <button class="btn primary big" data-act="start">Start workout</button>
        </div>`;
      return;
    }
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
      <div class="actions sticky-actions">
        ${editId
          ? '<button class="btn primary full" data-act="done-edit">Done</button>'
          : `<button class="btn ghost" data-act="discard">Discard</button>
             <button class="btn primary grow" data-act="finish">Finish workout</button>`}
      </div>`;
  }

  function refreshTotals(ei) {
    const cardEl = root.querySelector(`.card[data-ei="${ei}"] [data-vol]`);
    if (cardEl) cardEl.textContent = `${fmtNum(volume(workout.entries[ei]))} lb`;
    const total = root.querySelector('[data-total]');
    if (total) total.textContent = `${fmtNum(workoutVolume(workout))} lb`;
  }

  // ---------- exercise picker (full-screen sheet) ----------

  function openPicker() {
    const sheet = document.createElement('div');
    sheet.className = 'sheet';
    document.body.appendChild(sheet);
    document.body.classList.add('no-scroll');
    let query = '';
    let creating = false;

    const close = () => { sheet.remove(); document.body.classList.remove('no-scroll'); };
    window.addEventListener('hashchange', close, { once: true });

    function drawSheet() {
      const q = query.toLowerCase();
      const list = [...exercises.values()]
        .filter((e) => !e.archived && e.name.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name));
      const groups = MUSCLE_GROUPS.map((g) => [g, list.filter((e) => (e.muscleGroup || 'Other') === g)])
        .filter(([, l]) => l.length);
      sheet.querySelector('.sheet-body').innerHTML = creating
        ? exerciseFormHTML({ name: query })
        : `${groups.map(([g, l]) => `
            <h2 class="group-head">${esc(g)}</h2>
            <ul class="list">${l.map((e) => `
              <li><button class="list-btn" data-pick="${esc(e.id)}">${esc(e.name)}<span class="muted small">${esc(e.equipment)}</span></button></li>`).join('')}
            </ul>`).join('') || '<p class="empty">No matches.</p>'}
           <button class="btn ghost full" data-act="new-ex">+ Create "${esc(query) || 'new exercise'}"</button>`;
    }

    sheet.innerHTML = `
      <div class="sheet-head">
        <input type="search" placeholder="Search exercises" aria-label="Search exercises" autocomplete="off">
        <button class="btn ghost sm" data-act="close">Close</button>
      </div>
      <div class="sheet-body"></div>`;
    drawSheet();

    const search = sheet.querySelector('input[type=search]');
    search.addEventListener('input', () => { query = search.value; creating = false; drawSheet(); });

    sheet.addEventListener('click', async (ev) => {
      const pick = ev.target.closest('[data-pick]');
      const act = ev.target.closest('[data-act]')?.dataset.act;
      if (pick) { close(); await addEntry(pick.dataset.pick); }
      else if (act === 'close') close();
      else if (act === 'new-ex') { creating = true; drawSheet(); sheet.querySelector('input[name=name]').focus(); }
      else if (act === 'cancel-form') { creating = false; drawSheet(); }
    });

    sheet.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const ex = await createExerciseFromForm(ev.target);
      if (!ex) return;
      exercises.set(ex.id, ex);
      close();
      await addEntry(ex.id);
    });
  }

  async function addEntry(exerciseId) {
    const ex = exercises.get(exerciseId);
    workout.entries.push(ex.type === 'strength'
      ? { exerciseId, sets: [{ weight: '', targetReps: '', actualReps: '', done: false }] }
      : { exerciseId, durationMin: '', distanceMi: '' });
    await save();
    draw();
    const cards = root.querySelectorAll('.card');
    const last = cards[cards.length - 1];
    last?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    last?.querySelector('input')?.focus({ preventScroll: true });
  }

  // ---------- events ----------

  root.onclick = async (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const cardEl = btn.closest('.card');
    const ei = cardEl ? Number(cardEl.dataset.ei) : -1;

    if (act === 'start') {
      workout = { id: uid(), date: todayISO(), startedAt: Date.now(), finishedAt: null, notes: '', entries: [] };
      await save();
      await setMeta('activeWorkoutId', workout.id);
      draw();
      openPicker();
    } else if (act === 'pick') {
      openPicker();
    } else if (act === 'add-set') {
      const sets = workout.entries[ei].sets;
      const prev = sets[sets.length - 1];
      sets.push({ weight: prev?.weight ?? '', targetReps: prev?.targetReps ?? '', actualReps: '', done: false });
      await save();
      draw();
      const rows = root.querySelectorAll(`.card[data-ei="${ei}"] .set-row:not(.labels)`);
      rows[rows.length - 1]?.querySelector('[data-field=actualReps]')?.focus();
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
      draw();
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
    if (entry.sets) {
      const si = Number(t.closest('.set-row').dataset.si);
      const s = entry.sets[si];
      s[field] = t.value.trim();
      const actual = t.closest('.set-row').querySelector('[data-field=actualReps]');
      actual.classList.toggle('short', s.actualReps !== '' && s.targetReps !== '' && Number(s.actualReps) < Number(s.targetReps));
    } else {
      entry[field] = t.value.trim();
    }
    refreshTotals(ei);
    saveSoon();
  };

  root.onchange = (ev) => {
    const t = ev.target;
    if (t.dataset.field !== 'done') return;
    const row = t.closest('.set-row');
    const ei = Number(t.closest('.card').dataset.ei);
    const s = workout.entries[ei].sets[Number(row.dataset.si)];
    s.done = t.checked;
    // Checking a set off with no actual reps means "hit the target".
    if (s.done && s.actualReps === '' && s.targetReps !== '') {
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
  draw();
}
