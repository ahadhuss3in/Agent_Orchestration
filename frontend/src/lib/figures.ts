/**
 * Wireframe humanoid geometry, extracted from the v1 <symbol> sprite so the
 * exact same line art can be rendered two different ways:
 *
 *   - as a <symbol> instanced with <use> (cheap, used everywhere a figure is
 *     just decoration)
 *   - inline, one <path> per stroke (needed wherever GSAP has to touch the
 *     individual strokes: the intro's hand-drawn stroke-dashoffset reveal and
 *     the Agents section's mitosis, neither of which can reach inside a
 *     <use> shadow tree)
 *
 * The art is unchanged from v1 — <line x1 y1 x2 y2> elements were rewritten
 * as the equivalent "M x1 y1 L x2 y2" path data, nothing was redrawn.
 */

import type { FigureId } from "@/lib/content";

export type FigureGeometry = {
  /** Intrinsic drawing box. Each figure has its own width; all are 210 tall. */
  w: number;
  h: number;
  /** Stroked outline circles (heads). */
  outlines: { cx: number; cy: number; r: number }[];
  /** Stroked path data, in draw order. */
  strokes: string[];
  /** Filled joint dots. */
  joints: { cx: number; cy: number; r: number }[];
  /**
   * Index into `strokes` of the limb the Agents mitosis flings outward /
   * morphs from. Chosen per figure so the shard reads as an arm.
   */
  limb: number;
};

export const FIGURES: Record<FigureId, FigureGeometry> = {
  // THE ORCHESTRATOR — tall, upright, one arm raised, holding a staff
  orchestrator: {
    w: 120,
    h: 210,
    outlines: [{ cx: 56, cy: 26, r: 13 }],
    strokes: [
      "M43 19 L56 10 L69 19",
      "M56 39 L56 50",
      "M32 54 L80 54",
      "M56 50 L56 118",
      "M32 54 L18 76 L14 44",
      "M80 54 L94 80 L90 112",
      "M38 118 L74 118",
      "M38 118 L33 156 L35 198",
      "M74 118 L79 156 L77 198",
      "M26 200 L44 198",
      "M68 198 L86 200",
      "M98 14 L98 196",
      "M40 66 L56 76 L72 66",
    ],
    joints: [
      { cx: 98, cy: 12, r: 5 },
      { cx: 32, cy: 54, r: 2.6 },
      { cx: 80, cy: 54, r: 2.6 },
      { cx: 14, cy: 44, r: 2.6 },
      { cx: 90, cy: 112, r: 2.6 },
      { cx: 38, cy: 118, r: 2.6 },
      { cx: 74, cy: 118, r: 2.6 },
      { cx: 56, cy: 76, r: 2.2 },
    ],
    limb: 4,
  },

  // THE STRATEGIST — lean, hand to chin, weight on one leg
  strategist: {
    w: 100,
    h: 210,
    outlines: [{ cx: 52, cy: 28, r: 11 }],
    strokes: [
      "M52 39 L50 52",
      "M32 56 L70 56",
      "M50 52 L48 120",
      "M32 56 L24 86 L40 74 L44 38",
      "M70 56 L78 88 L70 116",
      "M34 120 L64 120",
      "M34 120 L28 158 L30 198",
      "M64 120 L68 158 L66 198",
      "M22 200 L38 198",
      "M58 198 L74 200",
    ],
    joints: [
      { cx: 32, cy: 56, r: 2.4 },
      { cx: 70, cy: 56, r: 2.4 },
      { cx: 44, cy: 38, r: 2.4 },
      { cx: 34, cy: 120, r: 2.4 },
      { cx: 64, cy: 120, r: 2.4 },
    ],
    limb: 3,
  },

  // THE SKEPTIC — shorter, wide stance, arms folded
  skeptic: {
    w: 110,
    h: 210,
    outlines: [{ cx: 55, cy: 34, r: 12 }],
    strokes: [
      "M55 46 L55 58",
      "M30 62 L80 62",
      "M55 58 L55 124",
      "M30 62 L26 88 L72 94",
      "M80 62 L84 88 L38 94",
      "M36 124 L74 124",
      "M36 124 L22 160 L18 198",
      "M74 124 L88 160 L92 198",
      "M10 200 L26 198",
      "M84 198 L100 200",
    ],
    joints: [
      { cx: 30, cy: 62, r: 2.4 },
      { cx: 80, cy: 62, r: 2.4 },
      { cx: 26, cy: 88, r: 2.4 },
      { cx: 84, cy: 88, r: 2.4 },
      { cx: 36, cy: 124, r: 2.4 },
      { cx: 74, cy: 124, r: 2.4 },
    ],
    limb: 3,
  },

  // THE LOYALIST — compact, symmetrical, arms at side, feet together
  loyalist: {
    w: 90,
    h: 210,
    outlines: [{ cx: 45, cy: 38, r: 11 }],
    strokes: [
      "M45 49 L45 60",
      "M27 64 L63 64",
      "M45 60 L45 126",
      "M27 64 L22 94 L26 122",
      "M63 64 L68 94 L64 122",
      "M33 126 L57 126",
      "M33 126 L32 162 L33 198",
      "M57 126 L58 162 L57 198",
      "M26 200 L40 198",
      "M50 198 L64 200",
    ],
    joints: [
      { cx: 27, cy: 64, r: 2.4 },
      { cx: 63, cy: 64, r: 2.4 },
      { cx: 33, cy: 126, r: 2.4 },
      { cx: 57, cy: 126, r: 2.4 },
    ],
    limb: 3,
  },

  // THE WILDCARD — asymmetric, leaning, one arm thrown up
  wildcard: {
    w: 110,
    h: 210,
    outlines: [{ cx: 46, cy: 30, r: 11 }],
    strokes: [
      "M47 41 L52 54",
      "M30 60 L74 58",
      "M52 54 L58 122",
      "M30 60 L14 44 L20 20",
      "M74 58 L88 84 L76 106",
      "M44 122 L76 120",
      "M44 122 L26 154 L34 196",
      "M76 120 L86 156 L74 196",
      "M24 198 L42 194",
      "M66 196 L84 198",
    ],
    joints: [
      { cx: 30, cy: 60, r: 2.4 },
      { cx: 74, cy: 58, r: 2.4 },
      { cx: 20, cy: 20, r: 2.8 },
      { cx: 44, cy: 122, r: 2.4 },
      { cx: 76, cy: 120, r: 2.4 },
    ],
    limb: 3,
  },
};

export function viewBoxOf(id: FigureId) {
  const f = FIGURES[id];
  return `0 0 ${f.w} ${f.h}`;
}
