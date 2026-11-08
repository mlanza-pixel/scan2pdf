/* Private fixture context. Installed before app modules; never enabled by URL alone. */
(() => {
  const token = new URL(location.href).searchParams.get('diagnosticRun');
  if (!token || !/^[a-f0-9-]{36}$/.test(token) || parent === window) return;
  try { if (!parent.__docuScanDiagnosticRuns?.has(token)) return; } catch { return; }
  const context = { token, dbName: `docuscan-selftest-${token}`, errors: [], prompts: [], nextPrompt: 'Diagnostic sample' };
  window.__docuScanDiagnosticContext = context;
  window.prompt = (message, fallback) => { context.prompts.push(String(message)); return context.nextPrompt ?? fallback ?? ''; };
  window.confirm = () => true;
  window.alert = message => { context.errors.push(`Unexpected alert: ${message}`); };
  window.addEventListener('error', event => context.errors.push(event.message));
  window.addEventListener('unhandledrejection', event => context.errors.push(String(event.reason?.message || event.reason)));
})();
