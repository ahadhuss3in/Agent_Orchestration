/**
 * The four stops of `--grad-recap` as numbers, so JS can sample the Spectrum
 * sweep at an arbitrary position. Used by the Recap cards and by the particle
 * wordmark, which colours each dot by where it sits along the word.
 *
 * Kept out of any component module so importing it does not drag a whole
 * client component into someone else's bundle.
 */
const SPECTRUM = [
  [255, 106, 61], // #ff6a3d
  [242, 183, 5], //  #f2b705
  [0, 194, 122], //  #00c27a
  [47, 107, 255], // #2f6bff
] as const;

export function spectrumAt(t: number) {
  const clamped = Math.min(1, Math.max(0, t));
  const seg = clamped * (SPECTRUM.length - 1);
  const i = Math.min(SPECTRUM.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = SPECTRUM[i];
  const b = SPECTRUM[i + 1];
  const mix = (n: 0 | 1 | 2) => Math.round(a[n] + (b[n] - a[n]) * f);
  return `rgb(${mix(0)}, ${mix(1)}, ${mix(2)})`;
}
