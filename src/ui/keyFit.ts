// Whether a key's words fit on one line in a given width, from their length: Archivo's
// bold (keys) runs about 0.56em a character and its semibold (pills, segments) about 0.52em.
// Rough on purpose, with room to spare, so the call errs towards stacking (or the short
// label) rather than a label that wraps or clips.
export const EM_KEY = 0.58;
export const EM_PILL = 0.54;

/** How wide a key's words and padding are, at the phone's text size (capped as Text caps it). */
export function keyWidth(label: string, fontScale: number, { size = 16, padding = 40, em = EM_KEY } = {}) {
  return label.length * size * em * Math.min(fontScale, 2) + padding;
}
