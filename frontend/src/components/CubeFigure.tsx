import type { FigureId } from "@/lib/content";
import { PERSONA_CLUSTERS, isoCluster, isoCube } from "@/lib/cubes";

/**
 * A persona, as a cube cluster.
 *
 * WHAT THIS REPLACED AND WHY THIS SHAPE. The client asked to "get rid of the
 * stick figures and make it be something else". The wireframe humanoids are
 * gone — `WireframeFigures.tsx` and `lib/figures.ts` with them — and the
 * something else is deliberately NOT a new invention. The seed is now a
 * formation of cubes and the graph is now those same cubes dispersed; giving
 * the personas a third, unrelated visual language would have left the page
 * saying three things in three accents. So an archetype is a cube cluster too,
 * built out of the same `isoCube` projection as the seed sigil and the graph
 * fallback, in its own accent colour. The page reads as one object from the
 * seed through the graph to the cast.
 *
 * Each cluster's silhouette is authored to say what the archetype does — the
 * reasoning is written out over `PERSONA_CLUSTERS` in `lib/cubes.ts`.
 *
 * DECORATIVE. Every instance sits beside the persona's real name and
 * description as text, so the drawing carries no unique information and is
 * hidden from assistive tech. Same contract the wireframes had.
 *
 * Server component. This is what ships in the server HTML, so the cast is
 * present with JS off and under reduced motion.
 *
 * ADDRESSABLE SUB-ELEMENTS. The Agents section breathes these figures, and a
 * `<use>` shadow tree has no elements script can reach — the same constraint
 * that forced the old `InlineFigure` to exist. So every cube is emitted as a
 * real `<g>`:
 *
 *   .pf-cube   every cube in the cluster
 *   .pf-key    the keystone cube, which is what the shard flight morphs into
 *              and what the idle loop swells
 *   .pf-joint  the small accent pip on each keystone-adjacent cube, shimmered
 *              out of phase by the idle loop
 *
 * The Orchestrator additionally gets `.orch-spire` on its vertical stack and
 * `.orch-crown` on the single cube at the top, because the summon beat lifts
 * the one and flares the other, and the arriving seed lands on the crown.
 */

const TOP = 1;
const RIGHT = 0.6;
const LEFT = 0.34;

/**
 * Projection scale and the box every persona is drawn in.
 *
 * ONE SHARED BOX, FITTED TO THE UNION. All five clusters are drawn in the same
 * viewBox so they render at a consistent apparent size beside each other; a
 * per-figure box would silently scale each one to fill its own frame and the
 * Wildcard, which is mostly empty space by design, would come out the same
 * size as the dense Loyalist.
 *
 * The numbers are measured, not guessed. Projecting every corner of every cube
 * of every cluster at `ISO_SCALE` gives:
 *
 *   orchestrator   x -29.7 .. 25.8    y -50.2 .. 53.8
 *   strategist     x -39.6 .. 57.4    y -42.2 .. 29.8
 *   skeptic        x -25.8 .. 43.5    y -37.8 .. 29.8
 *   loyalist       x -25.8 .. 25.8    y -45.8 .. 29.8
 *   wildcard       x -53.5 .. 43.5    y -45.8 .. 37.8
 *   ------------------------------------------------
 *   union          x -53.5 .. 57.4    y -50.2 .. 53.8   (111 x 104)
 *
 * so a 120-square centred on (2, 2) holds every figure with a few units of
 * margin and nothing clipped. The first pass used a 180-square, which was
 * safe and also meant the drawings occupied under half their own box — the
 * Strategist rendered at about 30px inside a 64px slot and read as a smudge.
 */
const ISO_SCALE = 16;
const VIEW_BOX = "-58 -58 120 120";

/**
 * The keystone cube's outline as a `<path>` `d`, for the shard morph.
 *
 * `isoCube` returns outlines as SVG POLYGON point strings, because that is
 * what every static cube here is drawn with and a polygon is cheaper than a
 * path. The shard is the one exception: MorphSVGPlugin animates a `d`, so the
 * same six points have to be re-expressed as an explicit closed path. Doing
 * the conversion here rather than making `isoCube` emit both keeps one shape
 * with one representation and one place that translates it.
 */
export function keystonePath(id: FigureId, scale = ISO_SCALE): string {
  const c = PERSONA_CLUSTERS[id];
  const [x, y, z] = c.cells[c.key];
  const pts = isoCube(x, y, z, 1.14, 0.5, scale).outline.split(" ");
  return `M${pts[0]} ${pts.slice(1).map((q) => `L${q}`).join(" ")} Z`;
}

export function CubeFigure({
  id,
  className = "",
  /** Tone for every face. Defaults to the page's single accent value. */
  tone = "var(--ink-accent)",
  cubeClass = "pf-cube",
  keyClass = "pf-key",
  jointClass = "pf-joint",
  style,
}: {
  id: FigureId;
  className?: string;
  tone?: string;
  cubeClass?: string;
  keyClass?: string;
  jointClass?: string;
  style?: React.CSSProperties;
}) {
  const cluster = PERSONA_CLUSTERS[id];
  const scale = ISO_SCALE;

  // `isoCluster` sorts by painter depth, so the array order is the draw order
  // — but that reorders the cells, and the keystone is identified by its index
  // in the ORIGINAL list. Projecting each cell individually and carrying its
  // original index through the sort keeps both facts.
  const drawn = cluster.cells
    .map(([x, y, z], i) => ({
      i,
      cube: isoCube(
        x,
        y,
        z,
        cluster.big.includes(i) ? 1.14 : 0.86,
        i / Math.max(1, cluster.cells.length - 1),
        scale,
      ),
    }))
    .sort((a, b) => a.cube.depth - b.cube.depth);

  // The spire is every cube on the Orchestrator's vertical axis: same lattice
  // x and z as the crown. Derived, not a hardcoded index list, so editing the
  // cluster cannot silently detach the summon beat from the shape.
  const crown = cluster.cells[cluster.key];
  const onAxis = (i: number) =>
    id === "orchestrator" &&
    cluster.cells[i][0] === crown[0] &&
    cluster.cells[i][2] === crown[2];

  return (
    <svg
      viewBox={VIEW_BOX}
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
      style={style}
    >
      {drawn.map(({ i, cube }) => {
        const isKey = i === cluster.key;
        const classes = [
          cubeClass,
          isKey ? keyClass : "",
          onAxis(i) ? "orch-spire" : "",
          isKey && id === "orchestrator" ? "orch-crown" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <g key={i} className={classes} data-cube={i}>
            <polygon points={cube.top} fill={tone} fillOpacity={TOP} />
            <polygon points={cube.right} fill={tone} fillOpacity={RIGHT} />
            <polygon points={cube.left} fill={tone} fillOpacity={LEFT} />
            <polygon
              points={cube.outline}
              fill="none"
              stroke={tone}
              strokeOpacity="0.85"
              strokeWidth="0.9"
              strokeLinejoin="round"
            />
            {/* One pip per cube, on the top face's near corner. These are what
                shimmer: small, bright, and spread across the whole cluster, so
                the figure reads as alive without anything actually moving. */}
            {i % 2 === 0 && (
              <circle
                className={jointClass}
                cx={Number(cube.top.split(" ")[2].split(",")[0])}
                cy={Number(cube.top.split(" ")[2].split(",")[1])}
                r="1.7"
                fill="#ffffff"
                fillOpacity="0.82"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * The tiny mark, for places a full cluster would be grey mush.
 *
 * `SeedCore`'s job through v5: the light at the top of the Orchestrator's
 * staff, the core inside the agent you chat to, the point the wordmark's dots
 * fly out of. Three cubes rather than thirty, because at 16px a formation is
 * noise and a single readable corner-of-a-cube is not.
 */
export function CubeMark({
  uid,
  className = "",
  tone,
}: {
  uid: string;
  className?: string;
  /** Defaults to the lineage's own light-to-mid grey ramp. */
  tone?: string;
}) {
  const g = `cm-${uid}`;
  const fill = tone ?? `url(#${g})`;
  const cubes = isoCluster(
    [
      [0, 0, 0],
      [1, 0, 0],
      [0, 1, 0],
    ],
    { scale: 13, size: 1 },
  );

  return (
    <svg
      viewBox="-24 -24 48 48"
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      {!tone && (
        <defs>
          {/* Matches `CubeSigil`'s SEED ramp exactly — Ignition, not the
              graph's greys. This mark is the lineage: the graph's central
              node, the light on the Orchestrator's staff, the core inside the
              agent in Chat, the point the wordmark's dots come out of. It is
              the same object as the full sigil at a smaller size and the two
              crossfade directly into each other at the end of every handoff,
              so a mismatch here would be visible on the one frame the whole
              illusion depends on. It is also the reason the graph can be
              neutral without the throughline getting lost in it. */}
          <linearGradient id={g} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#ffb08a" />
            <stop offset="42%" stopColor="var(--seed-a)" />
            <stop offset="100%" stopColor="var(--seed-b)" />
          </linearGradient>
        </defs>
      )}
      {cubes.map((c, i) => (
        <g key={i}>
          <polygon points={c.top} fill={fill} fillOpacity={TOP} />
          <polygon points={c.right} fill={fill} fillOpacity={0.66} />
          <polygon points={c.left} fill={fill} fillOpacity={0.4} />
          <polygon
            points={c.outline}
            fill="none"
            stroke="#ffffff"
            strokeOpacity="0.3"
            strokeWidth="0.7"
          />
        </g>
      ))}
    </svg>
  );
}
