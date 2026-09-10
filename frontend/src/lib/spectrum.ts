/**
 * A four-stop TONAL ramp as numbers, so JS can sample it at an arbitrary
 * position. Used by the Recap cards, one slice per pipeline step.
 *
 * WHAT THIS USED TO BE. Four hues — the Spectrum sweep — one per section, so
 * the Recap row read as the whole page's colour legend passing by in order.
 * The page is monochrome now and there is no legend, so this is four steps of
 * grey climbing toward white, which lets the row of seven cards say something
 * the hue version could not: the pipeline gets brighter as it runs, and step
 * 07 is where it arrives.
 *
 * IT DOES NOT START AT BLACK, and that is the constraint that set the bottom
 * stop. Each card's slice becomes its `--ga` / `--gb`, which draw the 3px
 * `.panel-topline` along the card's own top edge on `--paper-raised`. #8a8a8a
 * is 5.34:1 against that surface — clearly visible as a rule. A darker first
 * stop would have left card 01 looking like the only one with no topline at
 * all, which reads as a rendering fault rather than as a ramp.
 *
 * Kept out of any component module so importing it does not drag a whole
 * client component into someone else's bundle.
 */
const SPECTRUM = [
  [138, 138, 138], // #8a8a8a
  [180, 180, 180], // #b4b4b4
  [216, 216, 216], // #d8d8d8
  [255, 255, 255], // #ffffff
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
