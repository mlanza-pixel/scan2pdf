/* =====================================================================
   navigation.js — workspace switching, history, and state preservation.
   Six workspaces: home, studio, sign, tools, library, help.
   Switching is non-destructive (workspaces are display:none'd rather
   than unmounted) so in-progress edits are preserved.
   ===================================================================== */

const WORKSPACES = ['home', 'studio', 'sign', 'tools', 'library', 'help'];

const state = {
  active: 'home',
  history: ['home'],
};

const listeners = new Set();

export function getActive() { return state.active; }
export function getHistory() { return state.history.slice(); }

export function goto(workspace, opts = {}) {
  if (!WORKSPACES.includes(workspace)) {
    console.warn('Unknown workspace:', workspace);
    return;
  }
  if (workspace === state.active && !opts.force) return;
  const prev = state.active;
  state.active = workspace;
  if (!opts.skipHistory) state.history.push(workspace);

  document.querySelectorAll('.workspace').forEach(el => {
    const isActive = el.dataset.workspace === workspace;
    el.classList.toggle('is-active', isActive);
    if (isActive) el.setAttribute('tabindex', '0'); else el.removeAttribute('tabindex');
  });
  document.querySelectorAll('.bottom-nav__item').forEach(el => {
    el.classList.toggle('is-active', el.dataset.goto === workspace);
    el.setAttribute('aria-current', el.dataset.goto === workspace ? 'page' : 'false');
  });

  // Scroll to top of main when navigating (matches native app behavior)
  window.scrollTo({ top: 0, behavior: opts.animated ? 'smooth' : 'auto' });

  listeners.forEach(fn => fn({ from: prev, to: workspace }));
}

export function back() {
  if (state.history.length <= 1) return;
  state.history.pop();
  const prev = state.history[state.history.length - 1];
  goto(prev, { skipHistory: true });
}

export function onWorkspaceChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function initNavigation() {
  // Wire up all elements with [data-goto]
  document.addEventListener('click', (e) => {
    const trigger = e.target.closest('[data-goto]');
    if (!trigger) return;
    e.preventDefault();
    goto(trigger.dataset.goto);
  });
  // Keyboard support for cards / nav items
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const trigger = e.target.closest('[data-goto]');
    if (!trigger) return;
    e.preventDefault();
    goto(trigger.dataset.goto);
  });
  // Browser back button support
  window.addEventListener('popstate', () => {
    const hash = window.location.hash.replace('#', '');
    if (WORKSPACES.includes(hash)) goto(hash, { skipHistory: true });
  });
  // Reflect initial hash
  const initial = window.location.hash.replace('#', '');
  if (WORKSPACES.includes(initial)) goto(initial, { skipHistory: true });
  // Sync hash on change
  onWorkspaceChange(({ to }) => {
    if (window.location.hash !== '#' + to) {
      history.replaceState(null, '', '#' + to);
    }
  });
}
