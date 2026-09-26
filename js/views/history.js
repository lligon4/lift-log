import { getAll, del, getMeta } from '../db.js';
import {
  volume, workoutVolume, workoutSetCount, fmtNum, fmtDate, fmtTime, esc, toast,
} from '../util.js';

function durationText(w) {
  if (!w.startedAt || !w.finishedAt) return '';
  const min = Math.round((w.finishedAt - w.startedAt) / 60000);
  if (min < 1) return '';
  return min >= 60 ? `${Math.floor(min / 60)}h ${min % 60}m` : `${min}m`;
}

function entryDetail(entry, ex) {
  const name = esc(ex?.name || '(deleted exercise)');
  if (entry.sets) {
    const sets = entry.sets.map((s) => {
      const short = s.actualReps !== '' && s.targetReps !== '' && Number(s.actualReps) < Number(s.targetReps);
      return `<li class="${short ? 'short' : ''}">${esc(s.weight || 0)} × ${esc(s.actualReps || '–')}/${esc(s.targetReps || '–')}</li>`;
    }).join('');
    return `
      <div class="detail-entry">
        <div class="detail-name">${name}<span class="muted small">${fmtNum(volume(entry))} lb</span></div>
        <ol class="set-list">${sets}</ol>
      </div>`;
  }
  const parts = [];
  if (entry.durationMin !== '' && entry.durationMin != null) parts.push(`${esc(entry.durationMin)} min`);
  if (entry.distanceMi !== '' && entry.distanceMi != null) parts.push(`${esc(entry.distanceMi)} mi`);
  return `
    <div class="detail-entry">
      <div class="detail-name">${name}<span class="muted small">${parts.join(' · ') || '—'}</span></div>
    </div>`;
}

export async function render(root) {
  async function draw() {
    const [workouts, exList, activeId] = await Promise.all([
      getAll('workouts'), getAll('exercises'), getMeta('activeWorkoutId'),
    ]);
    const exercises = new Map(exList.map((e) => [e.id, e]));
    const list = workouts
      .filter((w) => w.id !== activeId)
      .sort((a, b) => b.date.localeCompare(a.date) || (b.startedAt || 0) - (a.startedAt || 0));

    root.innerHTML = `
      <header class="page-head"><h1>History</h1><span class="muted small">${list.length} workout${list.length === 1 ? '' : 's'}</span></header>
      ${activeId ? '<a class="banner" href="#/log">Workout in progress — tap to resume</a>' : ''}
      ${list.length ? '' : '<p class="empty">No finished workouts yet.</p>'}
      <ul class="list history">
        ${list.map((w) => {
          const names = [...new Set(w.entries.map((e) => exercises.get(e.exerciseId)?.name || '?'))];
          const sets = workoutSetCount(w);
          const vol = workoutVolume(w);
          return `
            <li data-id="${esc(w.id)}">
              <details>
                <summary>
                  <div class="h-top">
                    <strong>${fmtDate(w.date)}</strong>
                    <span class="muted small">${[fmtTime(w.startedAt), durationText(w)].filter(Boolean).join(' · ')}</span>
                  </div>
                  <div class="h-names">${esc(names.join(', ')) || '<span class="muted">Empty workout</span>'}</div>
                  <div class="h-stats muted small">${sets} set${sets === 1 ? '' : 's'} · ${fmtNum(vol)} lb</div>
                </summary>
                <div class="detail">
                  ${w.entries.map((e) => entryDetail(e, exercises.get(e.exerciseId))).join('')}
                  ${w.notes ? `<p class="notes-text">${esc(w.notes)}</p>` : ''}
                  <div class="actions">
                    <button class="btn ghost sm danger" data-act="delete">Delete</button>
                    <a class="btn secondary sm" href="#/log/${esc(w.id)}">Edit</a>
                  </div>
                </div>
              </details>
            </li>`;
        }).join('')}
      </ul>`;
  }

  root.onclick = async (ev) => {
    const btn = ev.target.closest('[data-act=delete]');
    if (!btn) return;
    const id = btn.closest('[data-id]').dataset.id;
    if (!confirm('Delete this workout? This cannot be undone.')) return;
    await del('workouts', id);
    toast('Workout deleted');
    await draw();
  };

  await draw();
}
