import { getAll, put } from '../db.js';
import { MUSCLE_GROUPS, EQUIPMENT } from '../seed.js';
import { uid, esc, toast } from '../util.js';

const TYPES = [['strength', 'Strength (sets × reps)'], ['timed', 'Timed sets (e.g. plank)'], ['cardio', 'Cardio (time/distance)'], ['flex', 'Yoga / mobility (time)']];

function options(list, selected) {
  return list.map((o) => {
    const [value, label] = Array.isArray(o) ? o : [o, o];
    return `<option value="${esc(value)}"${value === selected ? ' selected' : ''}>${esc(label)}</option>`;
  }).join('');
}

// Exercises | Templates switch shown at the top of both screens.
export function segmentsHTML(active) {
  const seg = (route, label) => `<a href="#/${route}"${active === route ? ' class="active" aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="segments">${seg('exercises', 'Exercises')}${seg('templates', 'Templates')}</nav>`;
}

// Shared by this view and the log view's exercise picker.
export function exerciseFormHTML(defaults = {}) {
  return `
    <form class="ex-form stack">
      <label>Name<input name="name" required autocomplete="off" value="${esc(defaults.name || '')}"></label>
      <label>Type<select name="type">${options(TYPES, defaults.type || 'strength')}</select></label>
      <div class="row2">
        <label>Muscle group<select name="muscleGroup">${options(MUSCLE_GROUPS, defaults.muscleGroup || 'Chest')}</select></label>
        <label>Equipment<select name="equipment">${options(EQUIPMENT, defaults.equipment || 'dumbbell')}</select></label>
      </div>
      <div class="actions">
        <button type="button" class="btn ghost" data-act="cancel-form">Cancel</button>
        <button type="submit" class="btn primary">Save exercise</button>
      </div>
    </form>`;
}

export async function createExerciseFromForm(form) {
  const f = new FormData(form);
  const name = f.get('name').trim();
  if (!name) return null;
  const ex = {
    id: uid(),
    name,
    type: f.get('type'),
    muscleGroup: f.get('muscleGroup'),
    equipment: f.get('equipment'),
    custom: true,
    archived: false,
  };
  await put('exercises', ex);
  return ex;
}

export async function render(root) {
  let showArchived = false;
  let adding = false;

  async function draw() {
    const all = (await getAll('exercises')).sort((a, b) => a.name.localeCompare(b.name));
    const visible = all.filter((e) => showArchived || !e.archived);
    const groups = MUSCLE_GROUPS.map((g) => [g, visible.filter((e) => (e.muscleGroup || 'Other') === g)])
      .filter(([, list]) => list.length);

    root.innerHTML = `
      <header class="page-head">
        <h1>Exercises</h1>
        <button class="btn primary sm" data-act="add">+ New</button>
      </header>
      ${segmentsHTML('exercises')}
      ${adding ? `<div class="card">${exerciseFormHTML()}</div>` : ''}
      <label class="check-inline"><input type="checkbox" data-act="toggle-archived"${showArchived ? ' checked' : ''}> Show archived</label>
      ${groups.map(([g, list]) => `
        <h2 class="group-head">${esc(g)}</h2>
        <ul class="list">
          ${list.map((e) => `
            <li class="list-row${e.archived ? ' archived' : ''}" data-id="${esc(e.id)}">
              <div class="grow">
                <div>${esc(e.name)}${e.custom ? ' <span class="tag">custom</span>' : ''}</div>
                <div class="muted small">${esc(e.type)} · ${esc(e.equipment)}</div>
              </div>
              <button class="btn ghost sm" data-act="rename">Rename</button>
              <button class="btn ghost sm" data-act="archive">${e.archived ? 'Restore' : 'Archive'}</button>
            </li>`).join('')}
        </ul>`).join('')}
    `;
  }

  root.onclick = async (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const id = btn.closest('[data-id]')?.dataset.id;
    if (act === 'add') { adding = true; await draw(); root.querySelector('input[name=name]').focus(); }
    else if (act === 'cancel-form') { adding = false; await draw(); }
    else if (act === 'rename' || act === 'archive') {
      const all = await getAll('exercises');
      const ex = all.find((e) => e.id === id);
      if (!ex) return;
      if (act === 'rename') {
        const name = prompt('Rename exercise', ex.name);
        if (!name || !name.trim()) return;
        ex.name = name.trim();
      } else {
        ex.archived = !ex.archived;
      }
      await put('exercises', ex);
      await draw();
    }
  };

  root.onchange = async (ev) => {
    if (ev.target.dataset.act === 'toggle-archived') {
      showArchived = ev.target.checked;
      await draw();
    }
  };

  root.onsubmit = async (ev) => {
    ev.preventDefault();
    const ex = await createExerciseFromForm(ev.target);
    if (ex) {
      adding = false;
      toast(`Added ${ex.name}`);
      await draw();
    }
  };

  await draw();
}
