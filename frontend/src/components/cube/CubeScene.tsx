"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  SEED_CUBES,
  GRAPH_EDGES_3D,
  STORY_CUBES,
  ARCHETYPE_TONE,
} from "@/lib/cubes";
import { stage, selection } from "@/lib/stage3d";

/**
 * THE SEED, THE GRAPH, AND THE THING YOU CAN PICK UP.
 *
 * This module is only ever reached through `next/dynamic` with `ssr: false`,
 * from `CubeStage`, and only after that component has confirmed there is a
 * WebGL context to be had and that motion is allowed. Nothing in here runs on
 * the server, nothing in here is in the first-paint bundle, and if it never
 * loads the page is still finished — see `CubeStage` for what ships instead.
 *
 * WHAT IT DOES, in the order the reader meets it:
 *
 *   1. CLUSTER. Thirty-four cubes hold the authored formation from
 *      `lib/cubes.ts`. The whole group is parked at a viewport pixel
 *      coordinate that `SeedJourney` computes and writes to `stage.frame` —
 *      the same descent, from 28vh to 56vh drifting inward, that the sigil
 *      travelled through v5. The scroll maths did not move; only what is
 *      standing at the end of it did.
 *
 *   2. ENTITIES. Five specific cubes are the story cubes. As each seed line is
 *      pulled in, `stage.frame.eaten` rises for that slot and THAT ONE CUBE
 *      swells, brightens and spins up. The scene also projects those five
 *      cubes back to viewport pixels every frame and writes them to
 *      `stage.cubeScreen`, which is what the controller aims the line at — so
 *      a line does not fly at the cluster, it flies at the cube that is about
 *      to become that entity, and it keeps doing so while the cube moves.
 *
 *   3. DISPERSAL. Past the handoff the group's `spread` runs to 1 and every
 *      cube — not just the five — lerps out of the formation into its own
 *      position in the graph layout, with edges drawn between them. This is
 *      the same "seed becomes the graph" beat the page always had, as real
 *      geometry instead of an SVG constellation.
 *
 *   4. DRAG. Once settled, any cube can be picked up and moved on the plane
 *      facing the camera, independently of every other cube. Edges are one
 *      `LineSegments` whose vertex buffer is rewritten from the live cube
 *      positions every frame, so an edge follows a dragged node for free
 *      rather than needing to be told about it.
 *
 *   5. PROMOTION. Clicking a cube selects it; the archetype panel that
 *      `CubeStage` renders in real DOM beside the canvas assigns one of the
 *      four archetypes to it. A promoted cube takes that archetype's own
 *      accent, gains an emissive lift and holds a slow spin, so the graph
 *      ends up showing at a glance which nodes were woken up and as what.
 *
 * POINTER EVENTS ARE NOT ON THIS CANVAS. The canvas covers the viewport and
 * must never eat a click meant for the copy underneath it, so it stays
 * `pointer-events: none` for its whole life. Interaction arrives from a
 * separate, deliberately bounded hit area that `CubeStage` owns and this
 * module raycasts by hand. That is also why R3F's own event system is unused
 * here: it binds to the canvas, which is exactly the element that must not be
 * hit-testable.
 */

/* ------------------------------------------------------------------ *
 * Constants
 * ------------------------------------------------------------------ */

const FOV = 42;
const CAM_Z = 28;

/** On-screen height of the clustered formation, CSS px, at spread 0. */
const CLUSTER_PX = 300;
/** Lattice height the formation actually occupies. */
const FORM_H = 9.6;
/** On-screen width of the dispersed graph, CSS px, at spread 1. */
const GRAPH_PX = 700;
/** Lattice width the graph layout occupies. */
const GRAPH_W = 13.2;

/**
 * TWO PALETTES, AND THE SCROLL CROSSFADES BETWEEN THEM.
 *
 * This is the page's colour story in four constants. The clustered formation
 * is THE SEED, and the seed is the one deliberately coloured object on an
 * otherwise black-and-white page — so it burns Ignition, exactly as it does in
 * the flat `CubeSigil` a reader has already seen in the hero. As `spread` runs
 * to 1 and the cluster comes apart into the graph, every cube crossfades to
 * the neutral pair: what the seed BECOMES is structure, and structure belongs
 * to the neutral world the rest of the page lives in.
 *
 * The whole argument of the section, in the material: one coloured moment goes
 * in, typed grey structure comes out, and the one thing that stays warm is the
 * node at the centre — which is the seed itself, drawn as `CubeMark`, and
 * which then detaches and carries the colour on to the Orchestrator.
 *
 * The neutral pair's spread is deliberately wide (#e8 to #6a). A narrow one
 * would leave the graph looking like a flat silhouette at the small on-screen
 * sizes it passes through.
 */
const SEED_A = new THREE.Color("#ff6a3d");
const SEED_B = new THREE.Color("#e6265a");
const NODE_A = new THREE.Color("#e8e8e8");
const NODE_B = new THREE.Color("#6a6a6a");
/** Edges: dimmer than the dimmest node, so the web reads behind them. They
 *  only exist once the graph exists, so they are never anything but grey. */
const EDGE_COLOR = new THREE.Color("#8a8a8a");
/** What a cube turns as a story line goes into it. The brightest thing on
 *  screen for a moment, which is what "this one just took the text" needs. */
const EATEN_COLOR = new THREE.Color("#ffd9c2");
/** The selected node's lift. Small, and toward white — see the note below. */
const SELECT_COLOR = new THREE.Color("#ffffff");

/* ------------------------------------------------------------------ *
 * The cubes
 * ------------------------------------------------------------------ */

type CubeRuntime = {
  mesh: THREE.Mesh;
  /** Where the user has dragged this cube, in group-local units. */
  drag: THREE.Vector3;
  /** Live group-local position, republished every frame for the edges. */
  at: THREE.Vector3;
  /** Current material colour, lerped toward its target. */
  color: THREE.Color;
  spin: number;
};

function Formation({
  hit,
  onHover,
}: {
  hit: React.RefObject<HTMLDivElement | null>;
  onHover: (grabbing: boolean) => void;
}) {
  const group = useRef<THREE.Group>(null);
  const { camera, size, gl } = useThree();

  // One geometry and one edge geometry for all thirty-four. Per-cube size is
  // applied through `mesh.scale`, so nothing here allocates per cube.
  const box = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const edgeGeo = useMemo(() => new THREE.EdgesGeometry(box), [box]);

  /**
   * The shared cube-wireframe material. One instance for all thirty-four.
   *
   * It stays a `useMemo` because it is read during render — it is handed
   * straight to the `<lineSegments>` inside every cube — and a ref cannot be
   * read during render. The departure fade below therefore does NOT write to
   * this binding; it reaches the same material through `runtime`, which is a
   * ref and is the sanctioned way to touch a live scene object per frame. Same
   * object either way, and the write happens where the rest of the frame's
   * mutation already happens.
   */
  const edgeMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.3,
      }),
    [],
  );

  const runtime = useRef<CubeRuntime[]>([]);
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  /**
   * The viewport point the graph is pinned to while it recedes, latched on the
   * first frame of the departure and cleared when it reverses. See the long
   * note beside `g.position.set` for why this exists.
   */
  const hold = useRef<{ x: number; y: number } | null>(null);

  // ---- the edge buffer ----
  const edges = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(GRAPH_EDGES_3D.length * 6), 3),
    );
    return g;
  }, []);
  const edgeLines = useRef<THREE.LineSegments>(null);

  // ---- drag state ----
  const drag = useRef<{
    i: number;
    plane: THREE.Plane;
    grab: THREE.Vector3;
    moved: number;
    id: number;
  } | null>(null);
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const scratch = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    runtime.current = SEED_CUBES.map((c, i) => ({
      mesh: meshRefs.current[i] as THREE.Mesh,
      drag: new THREE.Vector3(),
      at: new THREE.Vector3(c.p[0], c.p[1], c.p[2]),
      color: SEED_A.clone().lerp(SEED_B, c.t),
      spin: 0,
    })).filter((r) => r.mesh);
  }, []);

  /* ---------------- hand-rolled hit testing ---------------- */

  useEffect(() => {
    const el = hit.current;
    const g = group.current;
    if (!el || !g) return;

    /**
     * Pointer -> normalised device coords.
     *
     * Against the CANVAS box, not the hit area's. The hit area is a smaller
     * region floated over the canvas so that only the graph is grabbable, but
     * the projection the raycaster has to invert is the canvas's own — using
     * the hit area's rect here would put every ray in the wrong place by
     * exactly the difference between the two boxes, which is the classic
     * version of this bug.
     */
    const toNdc = (e: PointerEvent) => {
      const canvas = el.parentElement?.querySelector("canvas");
      const r = (canvas ?? el).getBoundingClientRect();
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      return ndc;
    };

    const pick = (e: PointerEvent) => {
      ray.setFromCamera(toNdc(e), camera);
      const meshes = runtime.current.map((r) => r.mesh);
      const hits = ray.intersectObjects(meshes, false);
      if (hits.length === 0) return -1;
      return meshes.indexOf(hits[0].object as THREE.Mesh);
    };

    const onDown = (e: PointerEvent) => {
      const i = pick(e);
      if (i < 0) {
        selection.select(null);
        return;
      }
      // A plane through the cube, facing the camera. Dragging on it keeps the
      // cube exactly under the cursor at any depth, which a fixed z = 0 plane
      // would not: a cube sitting at z = +1.5 would visibly slide out from
      // under the pointer as it moved.
      const world = runtime.current[i].mesh.getWorldPosition(new THREE.Vector3());
      const normal = camera.getWorldDirection(new THREE.Vector3()).negate();
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, world);

      ray.setFromCamera(toNdc(e), camera);
      const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(plane, p)) return;

      drag.current = {
        i,
        plane,
        grab: p.clone().sub(world),
        moved: 0,
        id: e.pointerId,
      };
      el.setPointerCapture(e.pointerId);
      onHover(true);
      e.preventDefault();
    };

    const onMove = (e: PointerEvent) => {
      const d = drag.current;
      if (!d) {
        onHover(pick(e) >= 0);
        return;
      }
      ray.setFromCamera(toNdc(e), camera);
      const p = new THREE.Vector3();
      if (!ray.ray.intersectPlane(d.plane, p)) return;
      p.sub(d.grab);

      // World -> group-local, because everything the cubes are positioned in
      // is group space and the group carries a live scale, rotation and
      // viewport-derived translation.
      const local = group.current?.worldToLocal(p.clone());
      if (!local) return;

      const c = SEED_CUBES[d.i];
      const base = new THREE.Vector3(c.g[0], c.g[1], c.g[2]);
      const next = local.sub(base);
      d.moved += next.distanceTo(runtime.current[d.i].drag);
      runtime.current[d.i].drag.copy(next);
    };

    const onUp = (e: PointerEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d) return;
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
      // Barely moved: this was a click, not a drag.
      if (d.moved < 0.08) selection.select(d.i);
      onHover(false);
    };

    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onUp);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onUp);
    };
  }, [camera, hit, ndc, ray, onHover]);

  /* ---------------- the frame ---------------- */

  const tmp = useMemo(() => new THREE.Vector3(), []);
  const target = useMemo(() => new THREE.Color(), []);
  /** Scratch for the neutral end of the seed -> node crossfade. */
  const node = useMemo(() => new THREE.Color(), []);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g || runtime.current.length === 0) return;

    const f = stage.frame;
    const clamped = Math.min(0.05, dt);

    // ---- viewport pixels -> world units ----
    //
    // Exact at z = 0, which is the plane the formation is centred on. Cubes
    // with real depth pick up a little honest perspective either side of it.
    //
    // THE CANVAS IS NOT THE VIEWPORT. `stage.frame` is in VIEWPORT pixels,
    // because that is the space `SeedJourney` measures every element in. The
    // canvas is inside `<main>`, which carries `lg:pl-[88px]` for the HUD
    // rail — so at 1440 the canvas box starts at x = 88 and is 1352 wide, and
    // treating a viewport x as a canvas x silently put the whole formation 88
    // pixels to the right of everything it was supposed to be aligned with.
    // Measured, that was the settled graph sitting ~150px right of the centre
    // of the box it was filling.
    //
    // The canvas's own rect is read once per frame and subtracted. It is a
    // read with no interleaved write — nothing in this frame has touched the
    // DOM — so it cannot force a second layout pass, and it stays correct
    // through the sticky box's whole life without having to assume the rail
    // width or that the box is pinned at top: 0.
    const rect = gl.domElement.getBoundingClientRect();
    const visibleH = 2 * Math.tan((FOV * Math.PI) / 360) * CAM_Z;
    const perPx = visibleH / Math.max(1, size.height);

    const spread = f.spread;
    const clusterScale = (CLUSTER_PX / FORM_H) * perPx;
    const graphScale = (GRAPH_PX / GRAPH_W) * perPx;

    /**
     * THE DEPARTURE, and this is the whole of it in the scene.
     *
     * `GraphRelay` writes `f.depart` from inside the same per-frame function
     * that positions the flyer, so this scale is not merely "also happening"
     * during the handoff — it is the same frame of the same driver. The group
     * shrinks about its own origin, which is `f.x, f.y`, which is the graph's
     * centre, which is the node the flyer detached from: the graph collapses
     * back toward the point the object left through rather than drifting off
     * somewhere unrelated.
     *
     * 0.82 rather than all the way to zero because the fade below is what
     * finishes it. A group scaled to literally 0 has a degenerate matrix and
     * three.js will warn about it; a group at 18% that is also at 0 opacity is
     * gone by every measure that matters and by none that complain.
     */
    const depart = f.depart;
    const s =
      (clusterScale + (graphScale - clusterScale) * spread) *
      f.scale *
      (1 - 0.82 * depart);

    /**
     * THE RECEDE HAPPENS IN ONE PLACE. IT DOES NOT DRIFT.
     *
     * Client, on the first version of this: "it shrinks but then the actual
     * graph also moved down" — the shrink and an ordinary scroll-linked
     * translation were happening at the same time, which reads as the page
     * dragging the graph away rather than as the graph withdrawing.
     *
     * `f.x` / `f.y` are VIEWPORT pixels written by `SeedJourney`, and its
     * final value is derived from the live rect of `.graph-visual`'s centre —
     * which is ordinary page content and therefore rises as the page scrolls.
     * So the moment anything let that value keep updating during the
     * departure, the graph would slide upward while shrinking. Latching the
     * centre on the first frame of the recede pins it to the viewport for the
     * whole of it: the graph shrinks and fades exactly where it was, the flyer
     * is the only thing that travels, and normal scrolling resumes carrying
     * content only after there is nothing left here to move.
     *
     * The latch clears when `depart` returns to 0, so scrolling back up
     * un-pins it and the graph re-expands into its live position — the same
     * "everything reverses because it is a pure function of scroll" property
     * the rest of this page's scrubbed motion has.
     */
    if (depart > 0) {
      if (!hold.current) hold.current = { x: f.x, y: f.y };
    } else if (hold.current) {
      hold.current = null;
    }
    const cx = hold.current ? hold.current.x : f.x;
    const cy = hold.current ? hold.current.y : f.y;

    g.position.set(
      (cx - rect.left - size.width / 2) * perPx,
      -(cy - rect.top - size.height / 2) * perPx,
      0,
    );
    g.scale.setScalar(s);

    // The whole cluster turns slowly while it is still a cluster, and stops
    // as it becomes the graph — a graph you are about to drag nodes around in
    // must not be rotating underneath you.
    g.rotation.y += clamped * 0.22 * (1 - spread) + clamped * 0.02;
    g.rotation.x = 0.12 * (1 - spread);

    // ---- per cube ----
    const promotions = selection.promotions;
    const sel = selection.cube;

    for (let i = 0; i < runtime.current.length; i++) {
      const rt = runtime.current[i];
      const c = SEED_CUBES[i];
      const slot = STORY_CUBES.indexOf(i as (typeof STORY_CUBES)[number]);
      const eaten = slot >= 0 ? (f.eaten[slot] ?? 0) : 0;

      // Position: formation -> graph, plus whatever the user dragged it by.
      tmp.set(
        c.p[0] + (c.g[0] - c.p[0]) * spread,
        c.p[1] + (c.g[1] - c.p[1]) * spread,
        c.p[2] + (c.g[2] - c.p[2]) * spread,
      );
      tmp.addScaledVector(rt.drag, spread);
      rt.mesh.position.copy(tmp);
      rt.at.copy(tmp);

      // Size: the cluster pulses as a whole when it swallows, and the specific
      // cube being fed swells well past the rest of the formation, which is
      // the entire "the text went into THAT one" read.
      const grow = 1 + 0.34 * eaten + 0.1 * f.pulse * (1 - spread);
      const promoted = promotions[i];
      const size = c.s * grow * (promoted ? 1.2 : 1) * (sel === i ? 1.16 : 1);
      rt.mesh.scale.setScalar(size);

      // Spin: idle tumble, spun up hard by a swallow and held by a promotion.
      rt.spin += clamped * (0.25 + eaten * 4.5 + (promoted ? 0.9 : 0));
      rt.mesh.rotation.set(
        c.rot[0] + rt.spin * 0.5,
        c.rot[1] + rt.spin,
        c.rot[2] + rt.spin * 0.3,
      );

      // SEED -> NODE, crossfaded by the same `spread` that pulls the cluster
      // apart. Ignition while it is the seed, grey once it is a graph node.
      // Both ends use the cube's own `c.t` position along its pair, so the
      // per-cube variation that gives the formation its form survives the
      // crossfade rather than collapsing at the halfway point.
      //
      // A promoted node takes its archetype's step off the four-step grey ramp
      // in `ARCHETYPE_TONE`. Four steps are readable side by side, but they
      // are deliberately NOT asked to carry the archetype on their own: the
      // promoted cube is also a fifth bigger, holds a spin the others do not,
      // and the panel that did the promoting names it in text and re-announces
      // it through `aria-live`. The brightness is the glanceable summary, not
      // the record. Promotion only happens after the graph has settled, so it
      // never fights the crossfade — by then `spread` is 1.
      if (promoted) target.set(ARCHETYPE_TONE[promoted] ?? "#f0f0f0");
      else {
        target.copy(SEED_A).lerp(SEED_B, c.t);
        node.copy(NODE_A).lerp(NODE_B, c.t);
        target.lerp(node, spread);
      }
      if (eaten > 0) target.lerp(EATEN_COLOR, eaten * 0.8);
      // A light touch toward white for the selected node, not a wash. This was
      // 0.22 because a heavier one used to wash a promoted cube's hue out;
      // with a value ramp the constraint is if anything tighter — pushing a
      // mid-grey archetype most of the way to white would make selection and
      // promotion the same signal — so it stays where it was and the selected
      // cube's 1.16x size does the rest of the work.
      if (sel === i) target.lerp(SELECT_COLOR, 0.22);

      rt.color.lerp(target, Math.min(1, clamped * 9));
      const mat = rt.mesh.material as THREE.MeshStandardMaterial;
      mat.color.copy(rt.color);
      mat.emissive.copy(rt.color);
      mat.emissiveIntensity =
        0.22 + eaten * 0.9 + (promoted ? 0.5 : 0) + (sel === i ? 0.35 : 0);
    }

    // ---- edges follow whatever the cubes did ----
    if (edgeLines.current) {
      const attr = edges.getAttribute("position") as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let e = 0; e < GRAPH_EDGES_3D.length; e++) {
        const [a, b] = GRAPH_EDGES_3D[e];
        const pa = runtime.current[a]?.at;
        const pb = runtime.current[b]?.at;
        if (!pa || !pb) continue;
        arr.set([pa.x, pa.y, pa.z, pb.x, pb.y, pb.z], e * 6);
      }
      attr.needsUpdate = true;
      edges.computeBoundingSphere();
      const m = edgeLines.current.material as THREE.LineBasicMaterial;
      // Edges do not exist until the cluster is coming apart. Squaring the
      // spread holds them off until the cubes are visibly separating, rather
      // than drawing a web through the middle of a solid formation. The
      // departure takes them out on the same curve as the cubes they join, so
      // the web never outlives the nodes.
      m.opacity = 0.42 * spread * spread * (1 - depart);
    }

    // ---- publish where the story cubes actually are ----
    // Projected from the live world matrix, so this is the truth after the
    // group's rotation, scale and viewport translation, not a prediction of
    // it. `SeedJourney` reads these to aim each line.
    for (let k = 0; k < STORY_CUBES.length; k++) {
      const rt = runtime.current[STORY_CUBES[k]];
      if (!rt) continue;
      rt.mesh.getWorldPosition(scratch).project(camera);
      // Back into VIEWPORT pixels, which is the space the controller aims in.
      stage.cubeScreen[k] = [
        ((scratch.x + 1) / 2) * size.width + rect.left,
        ((1 - scratch.y) / 2) * size.height + rect.top,
      ];
    }

    // ---- the departure fade, and the hard stop ----
    //
    // Kept in the scene graph rather than done as a CSS fade on the canvas,
    // for two reasons. The canvas element belongs to the renderer, and writing
    // to something a hook handed back is both lint-blocked and genuinely
    // fragile. And a per-frame style write on the element this same frame
    // reads a rect from is a forced-layout hazard that does not need to exist:
    // everything here is already inside the render loop.
    //
    // `transparent` is toggled rather than left on. Thirty-four transparent
    // boxes have to be depth-sorted and drawn without depth writes, which for
    // the 99% of this page's life where `depart` is 0 buys nothing and costs
    // correctness — a cube behind another would blend through it. So the
    // materials stay opaque until the recede actually starts, and `needsUpdate`
    // is set only on the frame the flag flips.
    const fading = depart > 0;
    for (let i = 0; i < runtime.current.length; i++) {
      const mat = runtime.current[i].mesh.material as THREE.MeshStandardMaterial;
      if (mat.transparent !== fading) {
        mat.transparent = fading;
        mat.depthWrite = !fading;
        mat.needsUpdate = true;
      }
      mat.opacity = 1 - depart;
    }
    // The wireframes, reached by walking down from the GROUP rather than from
    // the memo that created the material — see the note beside `edgeMat` — and
    // from the group rather than from `runtime`, because `runtime.current` is
    // populated inside an effect and the lint rules treat anything reached
    // through it as effect-owned. `g` is the live scene node this frame is
    // already rotating and scaling, so it is the natural handle for this too.
    //
    // One write covers all thirty-four: every cube's `<lineSegments>` shares
    // the single `edgeMat` instance, so the first one found IS the material.
    const firstCube = g.children.find((o) => o.type === "Mesh");
    const wireMat = firstCube?.children[0] as THREE.LineSegments | undefined;
    if (wireMat) {
      (wireMat.material as THREE.LineBasicMaterial).opacity = 0.3 * (1 - depart);
    }

    // THE HARD STOP, and it is the part that makes "the graph is still open
    // two sections later" unreachable rather than merely unlikely. At
    // depart = 1 the group is not merely transparent, it is culled from the
    // render entirely — so even if some later change left a stray opacity
    // write, or a driver died mid-scrub, there is a second and independent
    // reason for nothing to be on screen. It comes back the instant the scroll
    // does, because `depart` is a pure function of scroll position and
    // reverses with it.
    g.visible = depart < 1;
  });

  useEffect(() => {
    stage.live = true;
    return () => {
      stage.live = false;
    };
  }, []);

  useEffect(
    () => () => {
      box.dispose();
      edgeGeo.dispose();
      edgeMat.dispose();
      edges.dispose();
    },
    [box, edgeGeo, edgeMat, edges],
  );

  return (
    <group ref={group}>
      <lineSegments ref={edgeLines} geometry={edges} frustumCulled={false}>
        <lineBasicMaterial
          color={EDGE_COLOR}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </lineSegments>

      {SEED_CUBES.map((c, i) => (
        <mesh
          key={c.i}
          ref={(m) => {
            meshRefs.current[i] = m;
          }}
          geometry={box}
          position={c.p}
          scale={c.s}
        >
          <meshStandardMaterial
            color={SEED_A}
            emissive={SEED_A}
            emissiveIntensity={0.22}
            roughness={0.42}
            metalness={0.12}
            flatShading
          />
          {/* Every cube keeps its own wireframe outline. The page's whole
              visual language is line-on-black; a cube with no edge reads as a
              blob at small sizes and the formation loses its structure. */}
          <lineSegments geometry={edgeGeo} material={edgeMat} />
        </mesh>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ *
 * The canvas
 * ------------------------------------------------------------------ */

export default function CubeScene({
  hitRef,
  interactive,
  onReady,
}: {
  hitRef: React.RefObject<HTMLDivElement | null>;
  interactive: boolean;
  onReady?: () => void;
}) {
  const [grabbing, setGrabbing] = useState(false);
  const [running, setRunning] = useState(true);

  // Nothing renders for a viewport nobody is looking at — the same discipline
  // every ambient loop on this page already follows. `frameloop: never` stops
  // R3F's rAF entirely rather than just skipping work inside it.
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => setRunning(e.isIntersecting),
      { rootMargin: "12% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (interactive && hitRef.current) {
      hitRef.current.style.cursor = grabbing ? "grabbing" : "grab";
    }
  }, [grabbing, interactive, hitRef]);

  return (
    <div ref={wrap} className="absolute inset-0">
      <Canvas
        // POINTER EVENTS OFF, ALWAYS. See the note at the top of the file.
        className="pointer-events-none"
        frameloop={running ? "always" : "never"}
        // Capped rather than uncapped: a 3x phone screen would otherwise be
        // shading nine times the fragments for no visible gain on a scene made
        // of flat-shaded boxes.
        dpr={[1, 1.6]}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        camera={{ fov: FOV, position: [0, 0, CAM_Z], near: 0.1, far: 200 }}
        onCreated={() => onReady?.()}
      >
        <ambientLight intensity={0.55} />
        <directionalLight position={[6, 9, 8]} intensity={1.5} />
        {/* The fill light was a cyan bounce, which on a monochrome page is the
            one light that could put a hue back into every cube no matter what
            the materials said. Neutral white at the same intensity keeps the
            two-sided modelling — the thing the second light is actually for —
            without tinting the shadow side. */}
        <directionalLight position={[-8, -3, -6]} intensity={0.5} color="#ffffff" />
        <Formation hit={hitRef} onHover={setGrabbing} />
      </Canvas>
    </div>
  );
}
