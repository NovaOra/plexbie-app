// Whether a key's words fit on one line in a given width, from their length: Archivo's
// bold (keys) and semibold (pills, segments) run a little under 0.6em a character. Rough
// on purpose, with room to spare (a phone ellipsizes a line that only just fits), so the
// call errs towards proportion, stacking or the short label, never a clipped label.
export const EM_KEY = 0.62;
export const EM_PILL = 0.6;

/** How wide a key's words and padding are, at the phone's text size (capped as Text caps it). */
export function keyWidth(label: string, fontScale: number, { size = 16, padding = 40, em = EM_KEY } = {}) {
  return label.length * size * em * Math.min(fontScale, 2) + padding;
}
