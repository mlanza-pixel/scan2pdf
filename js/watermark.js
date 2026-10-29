/* =====================================================================
   watermark.js — domain logic for watermark configuration. Kept tiny
   and pure; the actual insertion is performed by pdf-editor.insertWatermark.
   ===================================================================== */

export const DIRECTIONS = ['diagonal', 'horizontal'];

export const DEFAULTS = {
  text: 'DRAFT',
  direction: 'diagonal',
  opacity: 50, // 0..100
};

export function normalizeConfig(cfg) {
  const text = (cfg?.text ?? DEFAULTS.text).toString().slice(0, 80);
  const direction = DIRECTIONS.includes(cfg?.direction) ? cfg.direction : DEFAULTS.direction;
  let opacity = Number(cfg?.opacity ?? DEFAULTS.opacity);
  if (Number.isNaN(opacity)) opacity = DEFAULTS.opacity;
  opacity = Math.max(0, Math.min(100, opacity));
  return { text, direction, opacity };
}

export function describe(cfg) {
  if (!cfg || !cfg.text) return 'No watermark';
  return `"${cfg.text}" • ${cfg.direction === 'diagonal' ? 'Diagonal ↗' : 'Horizontal'} • ${cfg.opacity}% opacity`;
}
