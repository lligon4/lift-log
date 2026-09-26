import { seedIfEmpty } from './seed.js';
import * as log from './views/log.js';
import * as history from './views/history.js';
import * as exercises from './views/exercises.js';
import * as settings from './views/settings.js';

const routes = { log, history, exercises, settings };
let root = document.getElementById('view');

async function route() {
  // Fresh container per route so one view's root.onX handlers never leak into the next.
  const fresh = root.cloneNode(false);
  root.replaceWith(fresh);
  root = fresh;

  const [name = 'log', ...params] = location.hash.replace(/^#\/?/, '').split('/');
  const view = routes[name] || log;
  document.querySelectorAll('.tabbar a').forEach((a) => {
    a.classList.toggle('active', a.dataset.route === (routes[name] ? name : 'log'));
  });
  root.innerHTML = '';
  try {
    await view.render(root, params);
  } catch (err) {
    console.error(err);
    root.innerHTML = `<p class="empty">Something went wrong: ${err.message}</p>`;
  }
  window.scrollTo(0, 0);
}

async function boot() {
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persisted().then((p) => p || navigator.storage.persist()).catch(() => {});
  }
  await seedIfEmpty();
  window.addEventListener('hashchange', route);
  if (!location.hash) location.replace('#/log');
  await route();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e));
  }
}

boot();
