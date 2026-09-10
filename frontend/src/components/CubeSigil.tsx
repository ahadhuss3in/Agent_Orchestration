import { isoSeed, isoGraph, isoGraphPoint, GRAPH_EDGES_3D } from "@/lib/cubes";

/**
 * The seed, drawn flat.
 *
 * This replaces `Orb`, the astrolabe sigil, everywhere the seed appears as a
 * mark rather than as the interactive set piece: the hero, the relay flyer
 * that carries the lineage into the Agents section, the inline sigil on narrow
 * viewports, and — the important one — every fallback path where no WebGL
 * scene will ever exist.
 *
 * It is the SAME OBJECT as the 3D one, not a drawing of it. Both come out of
 * `SEED_CUBES`; this one runs it through `isoCube` and paints three faces per
 * cube, back to front. Change a cell in `lib/cubes.ts` and the mark and the
 * mesh change together, because there is only one list.
 *
 * Server component, no `'use client'`, no script. That is deliberate and it is
 * the whole reason the fallback story holds up: this renders in the server
 * HTML, so the seed is present and legible before any JavaScript arrives, with
 * JS disabled entirely, and under `prefers-reduced-motion: reduce` where the
 * WebGL scene is never even imported.
 *
 * COLOUR, v4.1, AND IT DEPENDS WHICH OBJECT THIS IS DRAWING.
 *
 * This component draws two different things out of the same cell list, and the
 * page now treats them differently on purpose:
 *
 *   THE SEED (default)   Ignition. The seed is the page's protagonist and the
 *                        one deliberately coloured object in an otherwise
 *                        strictly black-and-white page — see the note at the
 *                        top of `globals.css`. It is warm in the hero, warm
 *                        travelling down the Seed section, warm as the mark on
 *                        the Orchestrator's staff.
 *   THE GRAPH (`graph`)  monochrome. What the seed becomes is structure, and
 *                        structure is part of the neutral world: thirty-four
 *                        typed nodes and their relationships, drawn in the
 *                        same greys as every other diagram on the page. The
 *                        one thing that stays warm in it is the central node,
 *                        which is the seed itself and is drawn by `CubeMark`,
 *                        not here.
 *
 * That split is the whole story of the page in two palettes: one coloured
 * moment goes in, neutral structure comes out, and the coloured thing carries
 * on through it.
 */

/** Face shading. One tone, three values, so the form reads without a light. */
const TOP = 1;
const RIGHT = 0.68;
const LEFT = 0.42;

export function CubeSigil({
  uid,
  className = "",
  /** Draw the dispersed graph layout instead of the clustered formation. */
  graph = false,
  /** Draw the connecting edges. Only meaningful with `graph`. */
  edges = false,
}: {
  /** Unique per instance: SVG gradient ids are document-global. */
  uid: string;
  className?: string;
  graph?: boolean;
  edges?: boolean;
}) {
  const g = `cs-${uid}`;
  const halo = `csh-${uid}`;
  // The formation spans roughly -4..+4 in projected units at scale 1; 13 units
  // of viewBox per lattice unit puts it comfortably inside a 240 box with room
  // for the satellites and the halo, which is the same 240 box `Orb` used —
  // so every existing `className` that sized the sigil still sizes it.
  const scale = graph ? 16 : 20;
  const cubes = graph ? isoGraph(scale) : isoSeed(scale);
  /** The two shaded faces. Neutral for the graph, Ignition for the seed. */
  const side = graph ? "#9c9c9c" : "var(--seed-b)";

  return (
    <svg
      viewBox="-120 -120 240 240"
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      <defs>
        {/* Hard values rather than the section's --ga / --gb: this object
            crosses every section, and picking up whichever tone it is
            currently flying over would make it dim in Simulation and bright in
            Seed for no reason a reader could name. It looks the same
            everywhere, which is what makes it recognisable as one object. */}
        <linearGradient id={g} x1="0%" y1="0%" x2="100%" y2="100%">
          {graph ? (
            <>
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="42%" stopColor="#e0e0e0" />
              <stop offset="100%" stopColor="#9c9c9c" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#ffb08a" />
              <stop offset="42%" stopColor="var(--seed-a)" />
              <stop offset="100%" stopColor="var(--seed-b)" />
            </>
          )}
        </linearGradient>
        <radialGradient id={halo} cx="50%" cy="50%" r="50%">
          {graph ? (
            <>
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.2" />
              <stop offset="52%" stopColor="#ffffff" stopOpacity="0.08" />
              <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="var(--seed-a)" stopOpacity="0.34" />
              <stop offset="52%" stopColor="var(--seed-b)" stopOpacity="0.14" />
              <stop offset="100%" stopColor="var(--seed-b)" stopOpacity="0" />
            </>
          )}
        </radialGradient>
      </defs>

      <circle cx="0" cy="0" r="118" fill={`url(#${halo})`} />

      {edges && (
        <g stroke="#8a8a8a" strokeOpacity="0.42" strokeWidth="0.9">
          {GRAPH_EDGES_3D.map(([a, b], i) => {
            const p1 = isoGraphPoint(a, scale);
            const p2 = isoGraphPoint(b, scale);
            return (
              <line key={i} x1={p1[0]} y1={p1[1]} x2={p2[0]} y2={p2[1]} />
            );
          })}
        </g>
      )}

      {/* Back to front. `isoSeed`/`isoGraph` already sorted by painter depth,
          so this is a plain map and never a per-cube z fight. */}
      {cubes.map((c, i) => (
        <g key={i}>
          <polygon points={c.top} fill={`url(#${g})`} fillOpacity={TOP} />
          <polygon points={c.right} fill={side} fillOpacity={RIGHT} />
          <polygon points={c.left} fill={side} fillOpacity={LEFT} />
          <polygon
            points={c.outline}
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.22"
            strokeWidth="0.5"
          />
        </g>
      ))}
    </svg>
  );
}
