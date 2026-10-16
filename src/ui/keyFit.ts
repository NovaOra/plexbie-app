// Whether a key's words fit on one line in a given width, from their length: Archivo's
// bold runs about 0.6em a character. Rough on purpose, with room to spare, so the call
// errs towards stacking (or the short label) rather than a label that wraps or clips.
const EM = 0.6;

/** How wide a key's words and padding are, at the phone's text size (capped as Text caps it). */
export function keyWidth(label: string, fontScale: number, { size = 16, padding = 40 } = {}) {
  return label.length * size * EM * Math.min(fontScale, 2) + padding;
}
