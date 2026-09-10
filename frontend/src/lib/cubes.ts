/**
 * THE CUBE LANGUAGE.
 *
 * One geometry module, no framework, no `'use client'` — because the exact
 * same numbers have to be readable from three places that cannot share a
 * runtime:
 *
 *   1. the WebGL scene (`components/cube/CubeScene.tsx`), which instances a
 *      real mesh per cell and drags them around;
 *   2. the static isometric SVG (`components/CubeSigil.tsx`,
 *      `components/CubeFigure.tsx`), which is what ships to a server render,
 *      to `prefers-reduced-motion: reduce`, and to any device without WebGL;
 *   3. the Agents section's shard flight, which needs the outline of a single
 *      cube face as a path it can morph.
 *
 * If the fallback were drawn from its own separate art it would drift away
 * from the 3D version the first time either was touched. It is drawn from
 * this, projected, so it cannot.
 *
 * WHY A HAND-AUTHORED CELL LIST AND NOT A GENERATOR. The client asked for "a
 * crazy thing made up of many small cubes" and was explicit that it must not
 * look AI generated. A procedural cloud — noise thresholded into a blob, or
 * cubes scattered on a sphere — is exactly what that phrase is describing and
 * rejecting: it has no silhouette, because every direction looks the same.
 * `SEED_CELLS` below is therefore composed by hand, level by level, as a
 * specific object: a heavy asymmetric base that overhangs to the left, a waist
 * that pinches down to three cells, a spine that leans right as it climbs, a
 * broken spur that breaks off the shoulder and keeps going past the top, and
 * four detached satellites holding position off the mass. It reads as a
 * fractured monolith caught mid-collapse, and it reads differently from every
 * side, which is the actual test.
 *
 * The only thing that is generated is the per-cell variation — size, spin,
 * sub-cell offset — and it is generated from a fixed seed so the object is
 * byte-identical on the server and in the browser. That matters twice: the
 * static SVG is server-rendered and would otherwise hydrate-mismatch, and the
 * 3D scene and the SVG fallback have to be recognisably the same object.
 */

import type { FigureId } from "./content";

/* ------------------------------------------------------------------ *
 * Deterministic noise
 * ------------------------------------------------------------------ */

/** mulberry32. Small, fast, and identical in every JS engine. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Rounded to 4 decimals everywhere a number reaches the DOM.
 *
 * Same reasoning as the fixed precision in the old `Orb`: the last bit of a
 * raw float can differ between the server's engine and the browser's, and in
 * an SVG attribute that is a hydration mismatch on every single cube.
 */
const r4 = (n: number) => Math.round(n * 10000) / 10000;

/* ------------------------------------------------------------------ *
 * The seed formation
 * ------------------------------------------------------------------ */

export type Cell = [x: number, y: number, z: number];

/**
 * The formation, authored level by level from the bottom up.
 *
 * `y` is the level. Each entry is the list of `[x, z]` cells occupied at that
 * level. Read down the list and you can see the silhouette: 7 wide at the
 * base, pinching to 3 at the waist, leaning right up the spine, then a spur
 * that carries on alone.
 */
const LEVELS: { y: number; cells: [number, number][] }[] = [
  // Base. Heavy, and deliberately not centred on the spine above it — the
  // overhang to -x is what stops the object reading as a tower on a plinth.
  { y: -3, cells: [[-2, 0], [-2, 1], [-1, 0], [-1, 1], [0, 0], [0, -1], [1, 0]] },
  { y: -2, cells: [[-2, 1], [-1, 0], [0, 0], [0, 1], [1, -1], [2, 0]] },
  // The waist. Three cells. Everything above it is cantilevered off this.
  { y: -1, cells: [[-1, 1], [0, 0], [0, -1], [1, 0]] },
  { y: 0, cells: [[0, 0], [0, 1], [1, 0]] },
  // The spine, leaning +x as it climbs.
  { y: 1, cells: [[0, 0], [1, 0], [1, -1]] },
  { y: 2, cells: [[0, 0], [1, 0], [2, -1]] },
  { y: 3, cells: [[1, 0], [2, -1]] },
  // The spur. Breaks off the shoulder and keeps going with nothing under it.
  { y: 4, cells: [[2, -1], [3, -1]] },
  { y: 5, cells: [[3, -1]] },
];

/** Detached. Holding station off the mass, so the object has an atmosphere. */
const SATELLITES: Cell[] = [
  [-3, 2, -1],
  [3, 1, 2],
  [-2, -2, 2],
  [2, -3, -2],
  [-1, 4, 1],
];

const RAW_CELLS: Cell[] = [
  ...LEVELS.flatMap(({ y, cells }) =>
    cells.map(([x, z]) => [x, y, z] as Cell),
  ),
  ...SATELLITES,
];

/** One cube in the formation, with everything both renderers need. */
export type Cube = {
  /** Stable index. This is the identity a story line is attached to. */
  i: number;
  /** Position in the clustered formation, in cube-widths. */
  p: [number, number, number];
  /** Edge length, in cube-widths. */
  s: number;
  /** Resting rotation, radians, XYZ. */
  rot: [number, number, number];
  /** Where this cube goes once the cluster becomes the graph. */
  g: [number, number, number];
  /** 0..1 along the accent ramp — drives the Ignition gradient mix. */
  t: number;
};

/**
 * Cubes that a seed story line flies into and merges with.
 *
 * Chosen by hand out of the formation rather than taken off the front of the
 * array, because they have to be visually distinguishable from each other from
 * the camera's angle: one satellite, one on the base overhang, one at the
 * waist, one on the spine, one out on the spur. A reader watching five lines
 * get eaten sees five clearly different places on the object light up, which
 * is what makes "this cube is this entity" land at all.
 *
 * There are deliberately far more cubes than lines. The rest are the mass and
 * the silhouette right up until the graph beat, where every one of them
 * becomes a node.
 */
export const STORY_CUBES = [30, 3, 15, 21, 26] as const;

function buildCubes(): Cube[] {
  const rand = rng(0x5eed1701);

  // The graph layout. A flattened shell rather than a ball: the reader is
  // looking at this thing head-on and a true sphere projects to a disc with
  // everything piled in the middle. Golden-angle placement spreads the nodes
  // without the visible rings a naive lat/long loop produces, and the radius
  // is pushed outward by index so the centre stays open for the node the seed
  // itself becomes.
  const n = RAW_CELLS.length;
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));

  return RAW_CELLS.map((p, i) => {
    // Size. Most cells are small; a handful are keystones at nearly double.
    // The mix is what stops the object reading as a voxel grid.
    const roll = rand();
    const s =
      roll > 0.9 ? 0.92 + rand() * 0.34 : roll > 0.62 ? 0.6 + rand() * 0.2 : 0.34 + rand() * 0.22;

    // Sub-cell offset. Every cube is nudged off its lattice point by up to a
    // third of a cell, which is the single change that does the most to kill
    // the grid read while keeping the authored silhouette intact.
    const jx = (rand() - 0.5) * 0.66;
    const jy = (rand() - 0.5) * 0.66;
    const jz = (rand() - 0.5) * 0.66;

    // Graph position.
    const a = i * GOLDEN;
    const rad = 1.1 + Math.sqrt(i / n) * 5.4;
    const gx = Math.cos(a) * rad;
    const gy = Math.sin(a) * rad * 0.66;
    // Depth spread, and it is deliberately shallow. This is a graph seen
    // head-on, and a deep one puts some nodes close enough to the camera that
    // perspective alone makes them three times the size of an identical node
    // at the back — which reads as "that node is important" rather than "that
    // node is nearer", and it is not. Enough depth to be honestly 3D, not
    // enough to encode a meaning that is not there.
    const gz = (rand() - 0.5) * 2.2;

    return {
      i,
      p: [r4(p[0] + jx), r4(p[1] + jy), r4(p[2] + jz)],
      s: r4(s),
      rot: [
        r4((rand() - 0.5) * 0.9),
        r4((rand() - 0.5) * 1.4),
        r4((rand() - 0.5) * 0.9),
      ],
      g: [r4(gx), r4(gy), r4(gz)],
      t: r4(rand()),
    };
  });
}

/**
 * Both layouts, re-centred on their own centroid.
 *
 * WHY THIS IS NOT OPTIONAL. Everything that positions this object — the
 * viewport coordinate `SeedJourney` computes, the graph visual's centre that
 * the handoff converges on, the centred viewBox every static SVG is drawn in —
 * treats the origin as the middle of the object. The formation is authored
 * from a base at y = -3 up to a spur at y = +5, and the graph layout is a
 * golden-angle spiral whose mean lands wherever the spiral happens to stop.
 * Neither has its centroid anywhere near zero.
 *
 * Measured before this: the settled graph sat about 150px right and 145px
 * above the centre of the box it was supposed to be filling, which is exactly
 * the offset between the spiral's centroid and the origin. Re-centring once,
 * here, fixes it for the mesh, the isometric still and the handoff at the same
 * time, because all three read these same numbers.
 */
function centred(cubes: Cube[]): Cube[] {
  const mean = (pick: (c: Cube) => [number, number, number], axis: 0 | 1 | 2) =>
    cubes.reduce((sum, c) => sum + pick(c)[axis], 0) / cubes.length;

  const pc = [mean((c) => c.p, 0), mean((c) => c.p, 1), mean((c) => c.p, 2)];
  const gc = [mean((c) => c.g, 0), mean((c) => c.g, 1), mean((c) => c.g, 2)];

  return cubes.map((c) => ({
    ...c,
    p: [r4(c.p[0] - pc[0]), r4(c.p[1] - pc[1]), r4(c.p[2] - pc[2])],
    g: [r4(c.g[0] - gc[0]), r4(c.g[1] - gc[1]), r4(c.g[2] - gc[2])],
  }));
}

export const SEED_CUBES: Cube[] = centred(buildCubes());

/* ------------------------------------------------------------------ *
 * Graph edges
 * ------------------------------------------------------------------ */

/**
 * Which nodes are joined once the cluster has dispersed.
 *
 * Built from the graph positions, not hand-listed, because the positions are
 * generated and a hand list would silently rot the moment a cell was added.
 * Each node takes its two nearest neighbours plus, for every third node, one
 * deliberately long reach across the constellation — without those the result
 * is a uniform mesh with no structure to read.
 *
 * Pairs are normalised low-index-first and de-duplicated, so an edge is never
 * drawn twice at double opacity.
 */
export const GRAPH_EDGES_3D: [number, number][] = (() => {
  const out = new Set<string>();
  const d2 = (a: Cube, b: Cube) =>
    (a.g[0] - b.g[0]) ** 2 + (a.g[1] - b.g[1]) ** 2 + (a.g[2] - b.g[2]) ** 2;

  SEED_CUBES.forEach((c, i) => {
    const near = SEED_CUBES.map((o, j) => ({ j, d: j === i ? Infinity : d2(c, o) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, 2);
    near.forEach(({ j }) => out.add(i < j ? `${i}:${j}` : `${j}:${i}`));

    if (i % 3 === 0) {
      const far = (i * 7 + 5) % SEED_CUBES.length;
      if (far !== i) out.add(i < far ? `${i}:${far}` : `${far}:${i}`);
    }
  });

  return Array.from(out).map((k) => k.split(":").map(Number) as [number, number]);
})();

/* ------------------------------------------------------------------ *
 * Persona clusters
 * ------------------------------------------------------------------ */

/**
 * Each archetype as its own small cube cluster.
 *
 * This is what replaced the wireframe stick figures. The client asked for the
 * figures to become "something else"; making that something else a THIRD
 * visual language, unrelated to the cubes the seed and the graph are now made
 * of, would have left the page telling three stories. So a persona is a cube
 * cluster too — smaller, in that archetype's own accent, and shaped so the
 * silhouette says what the archetype does:
 *
 *   orchestrator  a spire with a single crown cube, alone at the top. It is
 *                 the one figure that is not on the menu, and it is the only
 *                 one built around a vertical axis. The crown is also where
 *                 the seed lands at the end of the Graph -> Agents handoff.
 *   strategist    a staircase climbing forward. Sequence, moves ahead.
 *   skeptic       a solid block with its top half shifted off true and one
 *                 cell missing underneath. Something does not line up.
 *   loyalist      a closed square with a raised rim. Nothing gets in.
 *   wildcard      off-axis, nothing touching anything, no shared plane.
 */
export type PersonaCluster = {
  cells: Cell[];
  /** Index into `cells` of the cube the shard flight morphs into. */
  key: number;
  /** Indices drawn a size up, for weight. */
  big: number[];
};

export const PERSONA_CLUSTERS: Record<FigureId, PersonaCluster> = {
  orchestrator: {
    cells: [
      [-1, -2, 0], [0, -2, 0], [1, -2, 0], [0, -2, -1],
      [0, -1, 0], [0, -1, -1],
      [0, 0, 0],
      [0, 1, 0],
      [0, 2, 0],
    ],
    key: 8,
    big: [8, 0],
  },
  strategist: {
    // A stair, and it climbs STEEPLY on purpose. The first version stepped one
    // cell forward per level, which in isometric is +13.9 right and only 8 up
    // per tread — a 30-degree slope that read as a flat diagonal bar at card
    // size rather than as something ascending. Doubling up the lower treads
    // gives it mass and the four-level rise gives it a silhouette that is as
    // tall as it is wide.
    cells: [
      [-1, -2, 0], [-1, -2, -1],
      [0, -1, 0], [0, -1, -1],
      [1, 0, -1],
      [1, 1, -1],
      [2, 2, -1],
    ],
    key: 6,
    big: [6, 0],
  },
  skeptic: {
    cells: [
      [-1, -1, 0], [0, -1, 0], [0, -1, -1],
      [-1, 0, 0], [0, 0, -1],
      [0, 1, -1], [1, 1, -1],
    ],
    key: 6,
    big: [6],
  },
  loyalist: {
    cells: [
      [-1, -1, -1], [0, -1, -1], [-1, -1, 0], [0, -1, 0],
      [-1, 0, -1], [0, 0, 0],
      [-1, 1, -1], [0, 1, -1], [-1, 1, 0], [0, 1, 0],
    ],
    key: 9,
    big: [9, 0],
  },
  wildcard: {
    cells: [
      [-2, -1, 1],
      [0, -2, -1],
      [1, 0, 1],
      [-1, 1, -1],
      [2, 2, 0],
      [0, 1, 2],
    ],
    key: 4,
    big: [4],
  },
};

/* ------------------------------------------------------------------ *
 * Archetype accents
 * ------------------------------------------------------------------ */

/**
 * One TONE per assignable archetype. Four steps of grey, not four hues.
 *
 * WHAT THIS USED TO BE AND WHY IT CHANGED. Through v3 these were four visibly
 * different hues — Wire blue, Signal cyan, Aurum gold, Pulse mint — and the
 * argument for them was that a promoted node should be identifiable at a
 * glance without a legend. The page is monochrome now, so that argument has to
 * be met a different way, and the honest answer is that it was never
 * colour-only in the first place and should not have leaned on colour as hard
 * as it did:
 *
 *   SHAPE     every archetype already has its own authored cube cluster
 *             (`PERSONA_CLUSTERS` above) whose silhouette says what it does —
 *             a climbing stair, an off-true block, a closed square, six cells
 *             touching nothing. That is the primary identifier everywhere a
 *             figure is drawn, and it always was.
 *   TEXT      the name is beside the figure on every card, in the transcript,
 *             and in the promotion panel's `aria-live` readout.
 *   VALUE     these four steps, which is what is left for the one place shape
 *             cannot help: a promoted cube in the 3D graph, where every node
 *             is the same box.
 *
 * The steps are evenly spaced and none of them is near either end of the
 * scale, so no archetype reads as "the important one" — the ramp is an
 * identifier, not a ranking. Measured on --paper-raised #141414, as graphics
 * rather than as text: #f0f0f0 17.6:1, #cdcdcd 12.0:1, #ababab 7.9:1,
 * #888888 5.2:1. All four clear the 3:1 a non-text graphic needs with room,
 * and the dimmest is still legible as a value against the brightest.
 *
 * Lives here, in the geometry module, rather than in the WebGL scene: the
 * Agents section tones its persona clusters from this too, and it must not
 * have to pull three.js into its bundle to learn how bright a Skeptic is.
 *
 * The Orchestrator is not one of the four on purpose. It is not assignable —
 * it is a system role the engine supplies — and it sits at pure white, off the
 * top of the ramp, which is the same "outside the menu" statement its gold
 * used to make.
 */
export const ARCHETYPE_TONE: Record<string, string> = {
  strategist: "#f0f0f0",
  skeptic: "#cdcdcd",
  loyalist: "#ababab",
  wildcard: "#888888",
  orchestrator: "#ffffff",
};

/* ------------------------------------------------------------------ *
 * Isometric projection — how every static fallback is drawn
 * ------------------------------------------------------------------ */

/** Half-width and half-height of a unit cube's top face on screen. */
const ISO_W = Math.cos(Math.PI / 6);
const ISO_H = Math.sin(Math.PI / 6);

export type IsoCube = {
  /** Painter's-algorithm depth. Sort ASCENDING and draw in that order. */
  depth: number;
  /** The three visible faces, as SVG polygon point strings. */
  top: string;
  left: string;
  right: string;
  /** Outline of the whole cube, for the shard morph target. */
  outline: string;
  /** 0..1 accent ramp position. */
  t: number;
};

/**
 * Project one cube to three visible faces in an isometric view.
 *
 * `sx = (x - z) * cos30`, `sy = (x + z) * sin30 - y`, which is the standard
 * 2:1-ish isometric with +x going down-right, +z down-left and +y straight up.
 * Only three faces of a cube are ever visible from a fixed isometric camera,
 * so only three are emitted — half the polygons of a naive six-face draw.
 *
 * The painter's depth is `x + z - y`. Verified against the two cases that
 * actually matter rather than assumed: a cube one level higher must paint
 * BEFORE the one under it (it is further from the viewer), and a cube at
 * larger x or larger z must paint AFTER (it is nearer). `x + z - y` orders
 * both correctly in one ascending sort.
 */
export function isoCube(
  x: number,
  y: number,
  z: number,
  size: number,
  t = 0.5,
  scale = 1,
): IsoCube {
  const h = size / 2;
  // The eight corners, projected. Named for the lattice axis they sit on.
  const P = (dx: number, dy: number, dz: number) => {
    const sx = (x + dx - (z + dz)) * ISO_W * scale;
    const sy = ((x + dx + z + dz) * ISO_H - (y + dy)) * scale;
    return [r4(sx), r4(sy)] as const;
  };

  const tNW = P(-h, h, -h);
  const tNE = P(h, h, -h);
  const tSE = P(h, h, h);
  const tSW = P(-h, h, h);
  const bNE = P(h, -h, -h);
  const bSE = P(h, -h, h);
  const bSW = P(-h, -h, h);

  const pt = (a: readonly [number, number]) => `${a[0]},${a[1]}`;
  const poly = (...a: (readonly [number, number])[]) => a.map(pt).join(" ");

  return {
    depth: x + z - y,
    top: poly(tNW, tNE, tSE, tSW),
    // +x face, catching the light.
    right: poly(tNE, tSE, bSE, bNE),
    // +z face, in shadow.
    left: poly(tSW, tSE, bSE, bSW),
    // The six-point silhouette of the whole cube.
    outline: poly(tNW, tNE, bNE, bSE, bSW, tSW),
    t,
  };
}

/** A whole cell list projected and sorted back-to-front, ready to draw. */
export function isoCluster(
  cells: Cell[],
  opts: { scale?: number; size?: number; big?: number[]; bigSize?: number } = {},
): IsoCube[] {
  const { scale = 1, size = 0.86, big = [], bigSize = 1.14 } = opts;
  return cells
    .map(([x, y, z], i) =>
      isoCube(x, y, z, big.includes(i) ? bigSize : size, i / Math.max(1, cells.length - 1), scale),
    )
    .sort((a, b) => a.depth - b.depth);
}

/** The seed formation, projected. Shared by the sigil and the 3D fallback. */
export function isoSeed(scale = 1): IsoCube[] {
  return SEED_CUBES.map((c) =>
    isoCube(c.p[0], c.p[1], c.p[2], c.s, c.t, scale),
  ).sort((a, b) => a.depth - b.depth);
}

/** The dispersed graph layout, projected. Used by the no-WebGL graph still. */
export function isoGraph(scale = 1): (IsoCube & { i: number })[] {
  return SEED_CUBES.map((c) => ({
    ...isoCube(c.g[0], c.g[1], c.g[2], Math.max(0.42, c.s * 0.8), c.t, scale),
    i: c.i,
  })).sort((a, b) => a.depth - b.depth);
}

/** Screen-space centre of a graph node, for drawing the static edges. */
export function isoGraphPoint(i: number, scale = 1): [number, number] {
  const c = SEED_CUBES[i];
  const [x, y, z] = c.g;
  return [
    r4((x - z) * ISO_W * scale),
    r4(((x + z) * ISO_H - y) * scale),
  ];
}
