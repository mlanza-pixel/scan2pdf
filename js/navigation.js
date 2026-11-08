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

  listeners.forEach(fn => fn({ from: prev, to: workspace, skipHistory: !!opts.skipHistory }));
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
  // DS-16 fix: Browser back/forward button support with pushState.
  // When the user navigates via browser Back/Forward, popstate fires.
  // We read the hash and switch to that workspace WITHOUT pushing a new
  // history entry (the browser already did the navigation).
  window.addEventListener('popstate', () => {
    const hash = window.location.hash.replace('#', '');
    goto(WORKSPACES.includes(hash) ? hash : 'home', { skipHistory: true, force: true });
  });
  // Reflect initial hash (don't push — this is the initial load)
  const initial = window.location.hash.replace('#', '');
  if (!initial) history.replaceState({ workspace: 'home' }, '', '#home');
  if (WORKSPACES.includes(initial)) goto(initial, { skipHistory: true });
  // DS-16 fix: Use pushState (not replaceState) for user-initiated navigations.
  // This creates real browser history entries so Back/Forward work.
  // If the hash already matches (browser-initiated via popstate), don't push.
  onWorkspaceChange(({ to, skipHistory }) => {
    const targetHash = '#' + to;
    if (!skipHistory && window.location.hash !== targetHash) {
      // User clicked a workspace button — push a new history entry
      history.pushState({ workspace: to }, '', targetHash);
    }
    // If hash already matches, it was a browser Back/Forward — don't push
  });
}
