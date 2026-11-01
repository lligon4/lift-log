import { MUSCLE_GROUPS } from '../seed.js';
import { esc } from '../util.js';
import { exerciseFormHTML, createExerciseFromForm } from './exercises.js';

// Full-screen exercise picker, shared by the log view and the template editor.
// `exercises` is the caller's id -> exercise Map; a newly created exercise is added to it.
// onPick(exerciseId) runs after the sheet closes.
export function openPicker(exercises, onPick) {
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
    if (pick) { close(); await onPick(pick.dataset.pick); }
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
    await onPick(ex.id);
  });
}
