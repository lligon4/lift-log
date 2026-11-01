import { get, getAll, put, del } from '../db.js';
import { uid, esc, debounce, toast } from '../util.js';
import { segmentsHTML } from './exercises.js';
import { openPicker } from './picker.js';

const DEFAULT_GROUP = 'My templates';

// Drawn arrows: the arrow characters render as colour emoji on some platforms.
const UP = 'M12 19V5M5 12l7-7 7 7';
const DOWN = 'M12 5v14M5 12l7 7 7-7';
const arrow = (d) => `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const byOrder = (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name);

// [[group, templates]] in template order, groups in order of first appearance.
export function groupTemplates(templates) {
  const groups = new Map();
  [...templates].sort(byOrder).forEach((t) => {
    const g = t.group || DEFAULT_GROUP;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(t);
  });
  return [...groups];
}

const nextOrder = (templates) => Math.max(-1, ...templates.map((t) => t.order ?? 0)) + 1;

// Saves the workout's exercises (in order, no repeats) as a template. Offers the
// template it was started from as the name; reusing a name overwrites that template.
export async function saveWorkoutAsTemplate(workout) {
  const exerciseIds = [...new Set(workout.entries.map((e) => e.exerciseId))];
  if (!exerciseIds.length) { toast('Add an exercise first'); return null; }
  const templates = await getAll('templates');
  const source = templates.find((t) => t.id === workout.templateId);
  const name = prompt('Template name', source?.name || '')?.trim();
  if (!name) return null;
  const existing = templates.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (existing && !confirm(`Replace the exercises in "${existing.name}" with this workout's?`)) return null;
  const tpl = existing
    ? { ...existing, exerciseIds }
    : { id: uid(), name, group: source?.group || DEFAULT_GROUP, exerciseIds, order: nextOrder(templates) };
  await put('templates', tpl);
  toast(existing ? `Updated ${tpl.name}` : `Saved ${tpl.name}`);
  return tpl;
}

// Route: #/templates       -> list
//        #/templates/<id>  -> editor
export async function render(root, params = []) {
  const exercises = new Map((await getAll('exercises')).map((e) => [e.id, e]));
  const exName = (id) => exercises.get(id)?.name || '(deleted exercise)';
  return params[0] ? renderEditor(root, params[0], exercises, exName) : renderList(root, exName);
}

async function renderList(root, exName) {
  const templates = await getAll('templates');
  root.innerHTML = `
    <header class="page-head">
      <h1>Templates</h1>
      <button class="btn primary sm" data-act="new">+ New</button>
    </header>
    ${segmentsHTML('templates')}
    ${templates.length ? '' : '<p class="empty">No templates yet. Create one here, or save a workout as a template.</p>'}
    ${groupTemplates(templates).map(([g, list]) => `
      <h2 class="group-head">${esc(g)}</h2>
      <ul class="list">
        ${list.map((t) => `
          <li class="list-row">
            <a class="grow tpl-link" href="#/templates/${esc(t.id)}">
              <div>${esc(t.name)}</div>
              <div class="muted small clamp">${t.exerciseIds.length} exercise${t.exerciseIds.length === 1 ? '' : 's'} · ${esc(t.exerciseIds.map(exName).join(', '))}</div>
            </a>
            <a class="btn ghost sm" href="#/templates/${esc(t.id)}">Edit</a>
          </li>`).join('')}
      </ul>`).join('')}`;

  root.onclick = async (ev) => {
    if (!ev.target.closest('[data-act=new]')) return;
    const tpl = { id: uid(), name: 'New template', group: DEFAULT_GROUP, exerciseIds: [], order: nextOrder(templates) };
    await put('templates', tpl);
    location.hash = `#/templates/${tpl.id}`;
  };
}

async function renderEditor(root, id, exercises, exName) {
  const tpl = await get('templates', id);
  if (!tpl) {
    root.innerHTML = '<p class="empty">Template not found. <a href="#/templates">Back to templates</a></p>';
    return;
  }
  const groups = [...new Set((await getAll('templates')).map((t) => t.group || DEFAULT_GROUP))];
  let deleted = false;
  // No-op once deleted, so a pending debounced save can't bring the template back.
  const save = () => (deleted ? Promise.resolve() : put('templates', tpl));
  const saveSoon = debounce(save, 250);

  function drawList() {
    const ids = tpl.exerciseIds;
    root.querySelector('[data-count]').textContent = `Exercises (${ids.length})`;
    root.querySelector('.tpl-exercises').innerHTML = ids.map((exId, i) => {
      const ex = exercises.get(exId);
      return `
        <li class="list-row" data-i="${i}">
          <span class="set-num">${i + 1}</span>
          <div class="grow">${esc(exName(exId))}${ex?.archived ? ' <span class="tag">archived</span>' : ''}</div>
          <button class="icon-btn" data-act="up"${i === 0 ? ' disabled' : ''} aria-label="Move ${esc(exName(exId))} up">${arrow(UP)}</button>
          <button class="icon-btn" data-act="down"${i === ids.length - 1 ? ' disabled' : ''} aria-label="Move ${esc(exName(exId))} down">${arrow(DOWN)}</button>
          <button class="icon-btn" data-act="remove" aria-label="Remove ${esc(exName(exId))}">×</button>
        </li>`;
    }).join('') || '<li class="empty">No exercises yet.</li>';
  }

  root.innerHTML = `
    <header class="page-head">
      <h1>Edit template</h1>
      <a class="btn ghost sm" href="#/templates">Done</a>
    </header>
    <div class="card stack">
      <label>Name<input data-tfield="name" value="${esc(tpl.name)}" autocomplete="off"></label>
      <label>Group<input data-tfield="group" value="${esc(tpl.group || '')}" list="tpl-groups" autocomplete="off" placeholder="${esc(DEFAULT_GROUP)}"></label>
      <datalist id="tpl-groups">${groups.map((g) => `<option value="${esc(g)}"></option>`).join('')}</datalist>
    </div>
    <h2 class="group-head" data-count></h2>
    <ol class="list tpl-exercises"></ol>
    <button class="btn secondary full" data-act="add">+ Add exercise</button>
    <button class="btn ghost full danger" data-act="delete">Delete template</button>`;
  drawList();

  root.oninput = (ev) => {
    const field = ev.target.dataset.tfield;
    if (!field) return;
    tpl[field] = ev.target.value.trim();
    saveSoon();
  };

  // Don't leave a blank name or group behind once the field is left.
  root.onchange = (ev) => {
    const t = ev.target;
    if (!t.dataset.tfield || t.value.trim()) return;
    tpl[t.dataset.tfield] = t.dataset.tfield === 'name' ? 'Untitled' : DEFAULT_GROUP;
    t.value = tpl[t.dataset.tfield];
    save();
  };

  root.onclick = async (ev) => {
    const btn = ev.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act;
    const ids = tpl.exerciseIds;
    const i = Number(btn.closest('[data-i]')?.dataset.i);
    if (act === 'add') {
      openPicker(exercises, async (exId) => { ids.push(exId); await save(); drawList(); });
      return;
    }
    if (act === 'delete') {
      if (!confirm(`Delete the "${tpl.name}" template? Workouts already logged from it are kept.`)) return;
      deleted = true;
      await del('templates', tpl.id);
      toast(`Deleted ${tpl.name}`);
      location.hash = '#/templates';
      return;
    }
    if (act === 'up' && i > 0) [ids[i - 1], ids[i]] = [ids[i], ids[i - 1]];
    else if (act === 'down' && i < ids.length - 1) [ids[i], ids[i + 1]] = [ids[i + 1], ids[i]];
    else if (act === 'remove') ids.splice(i, 1);
    else return;
    await save();
    drawList();
    // Keep focus on the moved row's button so repeated taps keep moving the same exercise.
    if (act !== 'remove') {
      const to = act === 'up' ? i - 1 : i + 1;
      root.querySelector(`[data-i="${to}"] [data-act="${act}"]:not([disabled])`)?.focus();
    }
  };
}
