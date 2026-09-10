"use client";

/**
 * The one channel between the scroll controller and the WebGL scene.
 *
 * `SeedJourney` owns the scroll maths — it has for several versions, and the
 * swallow window in it is tuned against measured numbers that took real work
 * to get right. The 3D scene owns where the cubes actually are. Neither can
 * import the other: the scene is behind `next/dynamic` with `ssr: false` and
 * must not be pulled into the page's first-paint bundle, and the controller
 * runs whether the scene ever loads or not.
 *
 * So they share a plain mutable object instead of a context or a store
 * library. Both sides touch it inside their own animation frame, at most once
 * per frame, and nothing here ever triggers a React render — a `useState` on
 * a value that changes every frame would be a re-render per frame of the whole
 * subtree, which is the thing to avoid rather than the thing to build.
 *
 * DIRECTION OF FLOW, so this stays legible:
 *
 *   SeedJourney ->  `frame`      where the cluster should be, in CSS pixels,
 *                                and how far through the seed -> graph leg
 *   GraphRelay  ->  `frame.depart` how far through LEAVING the graph is
 *   scene       ->  `cubeScreen` where the story cubes ACTUALLY landed, in
 *                                CSS pixels, after projection
 *   scene       ->  `live`       whether a real scene is mounted at all
 *
 * The controller reads `cubeScreen` to aim the swallow. If no scene ever
 * mounts (no WebGL, reduced motion, narrow viewport) `live` stays false and
 * the controller falls back to its own `frame` coordinate, which is where the
 * cluster would have been. Every consumer therefore has a correct answer with
 * or without WebGL, which is the property the rest of this page is built on.
 *
 * TWO WRITERS, DISJOINT FIELDS, AND THAT IS THE POINT. `SeedJourney` and
 * `GraphRelay` are two scrubbed drivers whose ranges abut, and both scrub with
 * a 0.5s lag, so for about half a second of scrolling they are both running.
 * The page has already been bitten once by letting them both write the same
 * property (the graph orb's opacity, see the note in `SeedJourney.place`), so
 * `depart` is written by `GraphRelay` and by nothing else — `SeedJourney` does
 * not touch it and `resetStage` is the only other thing that ever sets it.
 */

import { SEED_CUBES, STORY_CUBES } from "./cubes";

export type StageFrame = {
  /** Viewport x of the cluster's centre, CSS px. */
  x: number;
  /** Viewport y of the cluster's centre, CSS px. */
  y: number;
  /** 1 at full size, shrinking as it converges on the graph's centre. */
  scale: number;
  /** Master scrub progress, 0..1, across the whole Seed -> Graph journey. */
  p: number;
  /** 0..1 dispersal: 0 is the clustered formation, 1 is the graph layout. */
  spread: number;
  /**
   * 0..1 DEPARTURE: 0 is the graph held at full size, 1 is the graph gone.
   *
   * Written only by `GraphRelay`, from inside the same per-frame `place()`
   * that positions the flyer, so the big graph receding and the small sigil
   * travelling are literally the same frame of the same driver rather than two
   * animations that happen to overlap. At 1 the scene stops rendering
   * entirely — see `CubeScene`.
   */
  depart: number;
  /** How hard the cluster is pulsing this frame, 0..1. */
  pulse: number;
  /** Per-story-cube swallow amount, 0..1, indexed like `STORY_CUBES`. */
  eaten: number[];
};

export type Stage = {
  frame: StageFrame;
  /** Projected viewport position of each story cube, CSS px. */
  cubeScreen: [number, number][];
  /** True only while a real WebGL scene is mounted and rendering. */
  live: boolean;
};

export const stage: Stage = {
  frame: {
    x: 0,
    y: 0,
    scale: 1,
    p: 0,
    spread: 0,
    depart: 0,
    pulse: 0,
    eaten: STORY_CUBES.map(() => 0),
  },
  cubeScreen: STORY_CUBES.map(() => [0, 0] as [number, number]),
  live: false,
};

/** Reset between matchMedia contexts so a resize cannot leave stale pixels. */
export function resetStage() {
  stage.frame.x = 0;
  stage.frame.y = 0;
  stage.frame.scale = 1;
  stage.frame.p = 0;
  stage.frame.spread = 0;
  stage.frame.depart = 0;
  stage.frame.pulse = 0;
  stage.frame.eaten = STORY_CUBES.map(() => 0);
  stage.cubeScreen = STORY_CUBES.map(() => [0, 0] as [number, number]);
}

/* ------------------------------------------------------------------ *
 * Selection and promotion — the interactive half
 * ------------------------------------------------------------------ */

import type { FigureId } from "./content";

/**
 * Which entity cube is selected, and what each has been promoted to.
 *
 * This half DOES drive React state, because it changes on a click rather than
 * on a frame and the archetype panel is real DOM that has to re-render. The
 * scene subscribes so a promotion can recolour a mesh without React owning the
 * material.
 */
export type Promotions = Partial<Record<number, FigureId>>;

type Listener = () => void;

let selected: number | null = null;
let promotions: Promotions = {};
const listeners = new Set<Listener>();

export const selection = {
  get cube() {
    return selected;
  },
  get promotions() {
    return promotions;
  },
  select(i: number | null) {
    if (selected === i) return;
    selected = i;
    listeners.forEach((l) => l());
  },
  promote(i: number, as: FigureId | null) {
    const next = { ...promotions };
    if (as === null) delete next[i];
    else next[i] = as;
    promotions = next;
    listeners.forEach((l) => l());
  },
  reset() {
    selected = null;
    promotions = {};
    listeners.forEach((l) => l());
  },
  subscribe(l: Listener) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/**
 * A short, stable label for a node.
 *
 * Entity cubes carry the seed line they ate; everything else is just a node in
 * the graph, and saying so is more honest than inventing a name for it.
 */
export function cubeLabel(i: number): string {
  const slot = STORY_CUBES.indexOf(i as (typeof STORY_CUBES)[number]);
  if (slot >= 0) return `ENTITY ${String(slot + 1).padStart(2, "0")}`;
  return `NODE ${String(i + 1).padStart(2, "0")}`;
}

export const CUBE_COUNT = SEED_CUBES.length;
