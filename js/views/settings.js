import { exportAll, importAll, getAll } from '../db.js';
import { APP_VERSION, todayISO, esc, toast } from '../util.js';

export async function render(root) {
  const [workouts, exercises] = await Promise.all([getAll('workouts'), getAll('exercises')]);
  let persisted = null;
  try { persisted = await navigator.storage?.persisted?.(); } catch { /* unsupported */ }

  root.innerHTML = `
    <header class="page-head"><h1>Settings</h1></header>

    <section class="card stack">
      <h2>Backup</h2>
      <p class="muted small">Your data lives only on this device. Export regularly and keep the file somewhere safe (Files, Drive, email to yourself).</p>
      <p class="small">${workouts.length} workouts · ${exercises.length} exercises</p>
      <button class="btn primary full" data-act="export">Export to JSON</button>
    </section>

    <section class="card stack">
      <h2>Restore</h2>
      <label class="radio"><input type="radio" name="mode" value="merge" checked> Merge (keep existing, add/overwrite by id)</label>
      <label class="radio"><input type="radio" name="mode" value="replace"> Replace (wipe everything first)</label>
      <label class="btn secondary full file-btn">Import JSON file<input type="file" accept="application/json,.json" hidden></label>
    </section>

    <section class="card stack small">
      <h2>About</h2>
      <p>Version ${esc(APP_VERSION)}</p>
      <p>Persistent storage: ${persisted === null ? 'unknown' : persisted ? 'granted' : 'not granted — install to home screen to protect your data'}</p>
    </section>`;

  root.onclick = async (ev) => {
    if (!ev.target.closest('[data-act=export]')) return;
    const data = await exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fitness-tracker-${todayISO()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  root.onchange = async (ev) => {
    const input = ev.target;
    if (input.type !== 'file' || !input.files.length) return;
    const mode = root.querySelector('input[name=mode]:checked').value;
    try {
      const data = JSON.parse(await input.files[0].text());
      if (mode === 'replace' && !confirm('Replace ALL existing data with this file?')) return;
      const res = await importAll(data, mode);
      toast(`Imported ${res.workouts} workouts, ${res.exercises} exercises`);
      await render(root);
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    } finally {
      input.value = '';
    }
  };
}
