/* Test fixtures get volatile settings; normal app behavior retains native storage. */
class MemoryState {
  #values = new Map();
  getItem(key) { return this.#values.get(String(key)) ?? null; }
  setItem(key, value) { this.#values.set(String(key), String(value)); }
  removeItem(key) { this.#values.delete(String(key)); }
  clear() { this.#values.clear(); }
  key(index) { return [...this.#values.keys()][index] ?? null; }
  get length() { return this.#values.size; }
}
export const localState = window.__docuScanDiagnosticContext ? new MemoryState() : window.localStorage;
if (window.__docuScanDiagnosticContext) {
  localState.setItem('docuscan-pro.tutorial-state', JSON.stringify({termsAccepted:true,tutorialSeen:true}));
}
