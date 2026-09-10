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
 * COLOUR: IGNITION, IN BOTH STATES.
 *
 * This component draws two things out of the same cell list — the clustered
 * seed and the dispersed graph — and for one pass they were deliberately
 * different, the seed warm and the graph neutral, on the argument that what
 * the seed BECOMES is structure and structure belongs to the monochrome world.
 * The client's read on the built version: "the exploded seed view in graph is
 * still plain and monotone", and then "I want all seed instance to appear
 * colored in a way that that is the life in everything."
 *
 * They are right, and the argument was too clever. Every node in that graph is
 * something the seed produced — a person, an organization, a place pulled out
 * of one sentence. Draining the colour out of them said "and then it died".
 * Both states now carry Ignition, which also keeps this flat fallback matching
 * the WebGL scene it stands in for; that scene's own note explains the heat
 * ramp in more detail.
 *
 * Everything else on the page stays black and white. One coloured lineage
 * running through a neutral world is the design; the graph is part of the
 * lineage, not part of the world.
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
  const side = "var(--seed-b)";

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
        {/* Three stops, matching the WebGL scene's heat ramp: warm gold into
            coral into crimson. Two stops over thirty-four cubes gives a field
            that is one colour with a slight lean; three gives it a real
            internal range, so the mass reads as many objects lit by the same
            fire rather than as a tinted blob. */}
        <linearGradient id={g} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffb03d" />
          <stop offset="46%" stopColor="var(--seed-a)" />
          <stop offset="100%" stopColor="var(--seed-b)" />
        </linearGradient>
        <radialGradient id={halo} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--seed-a)" stopOpacity="0.34" />
          <stop offset="52%" stopColor="var(--seed-b)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="var(--seed-b)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx="0" cy="0" r="118" fill={`url(#${halo})`} />

      {/* The relationships are what the seed produced too, so the web is warm
          as well — a shade under the nodes it joins, so it reads behind them
          rather than competing. */}
      {edges && (
        <g stroke="#ff8a5c" strokeOpacity="0.42" strokeWidth="0.9">
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
