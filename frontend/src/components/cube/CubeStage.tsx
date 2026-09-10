"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ARCHETYPES, type FigureId } from "@/lib/content";
import { CUBE_COUNT, cubeLabel, selection, stage } from "@/lib/stage3d";
import { ARCHETYPE_TONE } from "@/lib/cubes";

/**
 * THE GATE.
 *
 * Everything expensive about the 3D seed is on the far side of this component,
 * and this component's only real job is deciding whether the far side is
 * reached at all.
 *
 * WHAT SHIPS WHEN IT IS NOT. Nothing. That is the point and it is why the
 * fallback is not built here: the finished, legible seed and the finished,
 * legible graph are already in the server-rendered markup of `SeedSection` and
 * `GraphSection` as `<CubeSigil>` — the same cube formation, projected
 * isometrically to flat SVG. So the no-WebGL, reduced-motion, JS-off and
 * narrow-viewport paths are not a degraded mode that has to be built and
 * maintained separately; they are the DEFAULT state of the page, and all this
 * component ever does on the WebGL path is fade that default out and put a
 * live canvas over the top of it. That is the same "the markup's default is
 * always the finished state" discipline the rest of this codebase runs on.
 *
 * THREE THINGS DISQUALIFY THE CANVAS, checked in this order:
 *
 *   prefers-reduced-motion: reduce   a scroll-driven, continuously rendering
 *                                    WebGL scene is not something that can be
 *                                    made "calmer"; it is the category of
 *                                    thing the setting exists to switch off.
 *   viewport under 1024px            the seed journey's travel mechanic is
 *                                    already off below this width — there is
 *                                    no room beside the copy for anything to
 *                                    travel through at 375px — so a canvas
 *                                    would render a stationary object at real
 *                                    GPU cost for no narrative gain. This is
 *                                    also the low-end-device guard in
 *                                    practice.
 *   no WebGL context                 probed by actually asking for one and
 *                                    checking what comes back, not by sniffing
 *                                    a user agent.
 *
 * All three are live: a `matchMedia` change or a resize across 1024 flips the
 * mode and the canvas is mounted or torn down accordingly, so a reader who
 * turns reduced motion on mid-page gets the static seed immediately.
 */

const CubeScene = dynamic(() => import("./CubeScene"), {
  ssr: false,
  loading: () => null,
});

/** Ask for a context and see what happens. Cheap, and thrown away at once. */
function hasWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const c = document.createElement("canvas");
    const gl =
      c.getContext("webgl2") ??
      c.getContext("webgl") ??
      c.getContext("experimental-webgl");
    if (!gl) return false;
    // Some browsers hand back a context that immediately reports itself lost.
    const lost = (gl as WebGLRenderingContext).isContextLost?.();
    return !lost;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ *
 * Selection, as React state
 * ------------------------------------------------------------------ */

function useSelection() {
  return useSyncExternalStore(
    selection.subscribe,
    () => selection.cube,
    () => null,
  );
}

/**
 * A single frozen object for the server snapshot.
 *
 * `useSyncExternalStore` compares snapshots by identity, so returning a fresh
 * `{}` from `getServerSnapshot` on every call makes React believe the store
 * changed on every render and it warns about (and would spin in) an infinite
 * loop. One shared empty object is the whole fix. It is never a real value on
 * this path anyway: this component returns null on the server.
 */
const NO_PROMOTIONS: Record<number, FigureId> = Object.freeze({});

function usePromotions() {
  return useSyncExternalStore(
    selection.subscribe,
    () => selection.promotions,
    () => NO_PROMOTIONS,
  );
}

/* ------------------------------------------------------------------ *
 * The component
 * ------------------------------------------------------------------ */

export function CubeStage() {
  const [enabled, setEnabled] = useState(false);
  const [ready, setReady] = useState(false);
  const [settled, setSettled] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const hitRef = useRef<HTMLDivElement>(null);
  const columnRef = useRef<HTMLDivElement>(null);

  const sel = useSelection();
  const promotions = usePromotions();

  // ---- eligibility, kept live ----
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const wide = window.matchMedia("(min-width: 1024px)");
    // Probed once. The answer cannot change for the life of the document, and
    // creating a throwaway context on every resize would be wasteful.
    const gl = hasWebGL();

    const evaluate = () => setEnabled(!reduce.matches && wide.matches && gl);
    evaluate();
    reduce.addEventListener("change", evaluate);
    wide.addEventListener("change", evaluate);
    return () => {
      reduce.removeEventListener("change", evaluate);
      wide.removeEventListener("change", evaluate);
    };
  }, []);

  // ---- has the graph finished forming? ----
  //
  // Polled on rAF rather than pushed from the scene, because it is a single
  // boolean that flips once and a per-frame React update would be the exact
  // thing `lib/stage3d.ts` exists to avoid. The loop stops the moment the
  // stage is disabled.
  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const tick = () => {
      const on = stage.frame.spread > 0.97;
      const col = columnRef.current;
      // IS THE GRAPH STILL HELD, AND STILL WHOLE?
      //
      // Two conditions, and the first one is the exact one rather than a
      // proxy. `GraphRelay` publishes how far into leaving the graph is, so
      // the controls can be offered for precisely as long as there is an
      // intact graph to use and withdrawn the moment it starts to recede —
      // rather than being timed against a guessed multiple of the viewport
      // height that has to be re-tuned every time the departure window moves.
      // Offering a drag on a graph that is already shrinking out from under
      // the cursor is the failure this closes.
      //
      // The rect test stays as the second condition because `depart` is only
      // ever written on the wide, motion-allowed branch; without it a build
      // where the relay never ran would leave the panel up forever.
      //
      // 0.45 rather than a hair above zero, and it is a deliberate trade. The
      // departure now opens about 60px past the settle point — that is what
      // stops the zone feeling stuck — so a threshold near zero would give the
      // controls a 60px window and make them flash past. At depart = 0.45 the
      // graph is still at 63% of its size and 55% opacity: unmistakably the
      // graph, and perfectly draggable. So the controls are offered for the
      // whole of the early, barely-perceptible part of the recede and withdraw
      // once it is genuinely going, which is the honest reading of "this is
      // yours to move until you decide to move on".
      const leaving = stage.frame.depart > 0.45;
      const held =
        !leaving &&
        (col ? col.getBoundingClientRect().bottom > window.innerHeight : false);
      // Functional updates, and identity-stable when nothing changed, so these
      // are no-op renders for every frame but the two that actually flip.
      setSettled((was) => (was === on ? was : on));
      setOnScreen((was) => (was === held ? was : held));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  // `settled` is only ever consulted through `interactive` below, which ANDs
  // it with `enabled` — so a stage that gets disabled mid-scroll does not need
  // the flag reset, and this component never sets state synchronously from an
  // effect body just to keep two booleans agreeing.
  useEffect(() => {
    if (!settled) selection.select(null);
  }, [settled]);

  /**
   * IS THE GRAPH STILL THE THING ON SCREEN?
   *
   * `spread` is a pure function of the scrub progress, and ScrollTrigger holds
   * progress at 1 forever once the journey's end is passed — so `settled`
   * alone stays true for the entire rest of the page. The first pass of this
   * left the promotion panel floating over the Simulation and Chat sections,
   * offering to promote a node three screens above the reader.
   *
   * The honest test is not "has the graph formed" but "is the graph still
   * held", and the thing that knows is the sticky column. A sticky box holds
   * the viewport exactly while its container's bottom edge is still below the
   * viewport bottom; the moment it is not, the graph starts sliding away. So
   * the test is the column's own bottom edge, and the threshold is a little
   * above the fold rather than exactly at it so the panel is gone BEFORE the
   * graph visibly begins to leave rather than chasing it out.
   *
   * An IntersectionObserver cannot answer this: the column is several
   * viewports tall, so it is "intersecting" for the whole run and for a long
   * way past the point the graph stops being held. One rect read per frame, in
   * a loop that is already running for `spread`, answers it exactly.
   *
   * Nothing about the scene is torn down when this goes false — the canvas
   * parks itself on its own observer — this only governs whether the controls
   * are offered.
   */

  const step = useCallback(
    (by: number) => {
      const next = ((sel ?? -1) + by + CUBE_COUNT) % CUBE_COUNT;
      selection.select(next);
    },
    [sel],
  );

  if (!enabled) return null;

  const interactive = enabled && settled && onScreen;

  return (
    <>
      {/*
        THE COLUMN AND THE STICKY BOX.

        The outer element is absolutely positioned over the whole Seed + Graph
        wrapper, so it is exactly as tall as the journey. The inner element is
        `sticky`, which is the right primitive for this and not `fixed`:

          - it holds the viewport for the length of the journey, which is what
            a travelling seed needs;
          - it then scrolls away on its own when the container ends, so the
            finished graph stays with the Graph section instead of following
            the reader down the page;
          - it costs NO pin budget. It is not a ScrollTrigger pin, so the
            page's careful count of full-viewport pins is unchanged by any of
            this;
          - and it cannot overflow horizontally. A `position: fixed` layer with
            a scroll-linked transform is exactly what caused this page's
            previous horizontal-overflow bug, documented against `overflow-x:
            clip` on `<html>` in globals.css. A sticky box is laid out inside
            its container's content box and has nowhere sideways to go.

        `100svh`, not `100vh`: on mobile browsers `vh` is the tall viewport and
        the box would be cut off by the URL bar. This branch is desktop-only
        today, but the unit should not be the reason if that ever changes.
      */}
      <div
        ref={columnRef}
        /* `.cube-stage-column` is a handle, not a style. `GraphRelay` reads
           this element's bottom edge every frame to know when the sticky box
           is about to stop holding, which is the backstop that guarantees the
           graph has finished receding before it starts to slide. It is a class
           rather than a ref hand-off because the two components are in
           different subtrees and already talk this way — the relay reaches for
           `.graph-visual` and `.graph-center-orb` by selector for the same
           reason. */
        className="cube-stage-column pointer-events-none absolute inset-0 z-30"
        aria-hidden="true"
      >
        <div className="sticky top-0 h-[100svh] w-full overflow-hidden">
          <CubeScene
            hitRef={hitRef}
            interactive={interactive}
            onReady={() => setReady(true)}
          />

          {/*
            THE HIT AREA.

            Deliberately not the whole canvas. The canvas covers the viewport
            and is `pointer-events: none` for its entire life; this is the only
            element that ever accepts a pointer, it is only live once the graph
            has settled, and it is bounded to roughly where the graph is. That
            keeps the copy above and below the constellation selectable and
            clickable throughout, which a full-viewport grab surface would
            quietly break.
          */}
          <div
            ref={hitRef}
            className="absolute left-1/2 top-1/2 h-[min(64vh,560px)] w-[min(90vw,780px)] -translate-x-1/2 -translate-y-1/2 touch-none"
            style={{ pointerEvents: interactive ? "auto" : "none" }}
          />

        </div>
      </div>

      {/*
        THE PROMOTION PANEL.

        Real DOM, not something drawn inside the scene. Three reasons, all of
        them the same reason: it is text and controls. Typography here matches
        the rest of the page because it IS the rest of the page; the archetype
        names are readable by a screen reader and reachable by Tab; and the
        prev/next pair means the whole interaction — walk the nodes, pick one,
        assign it an archetype — is completable with a keyboard alone, which a
        drag-and-click surface inside a canvas can never be.

        `fixed`, and only ever mounted once the graph has settled, so it does
        not consume layout or attention during the journey.

        TYPOGRAPHY, rebuilt. Client: "even the promote entity box, every font
        is diff, the colors are differrent." Both halves were true. The panel
        had accumulated four type sizes in a box 200px tall — `hud-label` at
        10px plus one-off 12px, 12.5px and 11.5px runs invented per element —
        and it coloured the eyebrow, the node label and the selected archetype
        from three different accent tokens.

        It is now exactly two type roles, which is what the rest of the page
        uses and what a HUD panel should have:

          .hud-label            every label: the eyebrow, the node readout,
                                the archetype names. Mono, uppercase,
                                letter-spaced, 10px.
          font-mono text-[12.5px]   every sentence of prose. 12.5 because that
                                is the size the persona-card notes and the
                                archetype-palette lede already run at, so this
                                panel is not inventing a size, it is joining
                                one.

        NO SORA IN HERE, and that is deliberate rather than an oversight of the
        brief's "Sora for headings" rule. There is no heading in this panel —
        it is a control strip, and every string in it is a label or a caption.
        Introducing a second family into the one box a client has just called
        out as having too many fonts would be answering the complaint with more
        of the thing complained about. The rest of the page's HUD furniture —
        the rail, the graph legend, the simulation header — is mono for the
        same reason, so this is the panel joining the system rather than
        opting out of it.
      */}
      {interactive && ready && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 sm:pb-6">
          <div className="panel pointer-events-auto w-full max-w-[720px] border border-line bg-[color:var(--paper-raised)]/95 p-4 backdrop-blur-sm sm:p-5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span className="hud-label text-[color:var(--ink-accent)]">
                PROMOTE AN ENTITY
              </span>
              <p className="font-mono text-[12.5px] leading-relaxed text-ink-dim">
                Drag any node to move it. Pick one, then give it an archetype.
              </p>

              {/*
                THE OTHER HALF OF "if anyone scrolls the graph just sticks in
                middle", and it is one line of type.

                The dwell zone was doing its job — holding the graph still so
                it can actually be dragged — and saying nothing about it. This
                panel already told a reader what they COULD do here; what
                neither it nor anything else on screen said was that the pause
                is finite and that they are the one who ends it. Without that,
                a page which has stopped responding to the scroll wheel for
                half a viewport is indistinguishable from a page that has
                frozen, which is exactly the reading the client reported.

                It lives in this panel rather than as a second floating label
                at the graph, and that is a deliberate reversal of the first
                attempt. A separate hint block over the constellation collided
                with this panel at every viewport height worth supporting — the
                panel is 200px of fixed, bottom-docked chrome and the graph
                sits directly above it — and it also said "drag a node" a
                second time, three inches from where this panel says it. One
                affordance, in one place, in one type system.

                `ml-auto` so it lands at the far end of the row and reads as
                the exit rather than as more instructions.
              */}
              <span
                aria-hidden="true"
                className="hud-label ml-auto flex items-center gap-1.5 whitespace-nowrap text-ink-dim"
              >
                SCROLL ON WHEN DONE
                <span className="text-[color:var(--ink-accent)]">&darr;</span>
              </span>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => step(-1)}
                  className="border border-line px-2.5 py-1.5 font-mono text-[12.5px] leading-none text-ink-dim transition-colors hover:border-[color:var(--line-strong)] hover:text-ink"
                >
                  <span aria-hidden="true">&larr;</span>
                  <span className="sr-only">Select the previous node</span>
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  className="border border-line px-2.5 py-1.5 font-mono text-[12.5px] leading-none text-ink-dim transition-colors hover:border-[color:var(--line-strong)] hover:text-ink"
                >
                  <span aria-hidden="true">&rarr;</span>
                  <span className="sr-only">Select the next node</span>
                </button>
              </div>

              {/* The readout. One line, one type role, and the emphasis is
                  carried by brightness rather than by a second colour: the
                  live values sit at --ink-accent against --ink-dim connective
                  words, which is the same two-step the whole page now uses. */}
              <p className="hud-label text-ink-dim" aria-live="polite">
                {sel === null ? (
                  <>No node selected</>
                ) : (
                  <>
                    <span className="text-[color:var(--ink-accent)]">
                      {cubeLabel(sel)}
                    </span>
                    {promotions[sel] ? (
                      <>
                        {" · "}
                        <span className="text-[color:var(--ink-accent)]">
                          {
                            ARCHETYPES.find((a) => a.id === promotions[sel])
                              ?.name
                          }
                        </span>
                      </>
                    ) : (
                      <>{" · NOT PROMOTED"}</>
                    )}
                  </>
                )}
              </p>
            </div>

            <ul className="mt-3 flex flex-wrap gap-2">
              {ARCHETYPES.map((a) => {
                const active = sel !== null && promotions[sel] === a.id;
                return (
                  <li key={a.id}>
                    {/* SELECTED TAKES THAT ARCHETYPE'S OWN COLOUR, not a
                        generic white. `aria-pressed` already carries the
                        state to assistive tech; for everyone else the
                        pressed button's border, label and swatch all move to
                        the same hue the node in the graph actually turns, so
                        pressing "Wildcard" and seeing the graph's promoted
                        cube go pink is one visible fact, not two unrelated
                        white and colourful ones. The swatch beside each name
                        is always that archetype's colour, active or not — a
                        preview of the result before you commit to it. */}
                    <button
                      type="button"
                      disabled={sel === null}
                      aria-pressed={active}
                      onClick={() =>
                        sel !== null &&
                        selection.promote(sel, active ? null : a.id)
                      }
                      style={
                        active
                          ? {
                              borderColor: ARCHETYPE_TONE[a.id],
                              color: ARCHETYPE_TONE[a.id],
                              background: `color-mix(in srgb, ${ARCHETYPE_TONE[a.id]} 12%, transparent)`,
                            }
                          : undefined
                      }
                      className={[
                        "flex items-center gap-2 border px-3 py-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
                        "hud-label",
                        active
                          ? ""
                          : "border-line text-ink-dim hover:border-[color:var(--line-strong)] hover:text-ink",
                      ].join(" ")}
                    >
                      <span
                        aria-hidden="true"
                        className="h-2.5 w-2.5 shrink-0"
                        style={{ background: ARCHETYPE_TONE[a.id] }}
                      />
                      {a.name}
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* The same point the Agents section makes in prose, restated here
                because this is where a reader is actually doing it: the
                archetype is a setting, not a name, and it can be moved. */}
            <p className="mt-3 font-mono text-[12.5px] leading-relaxed text-ink-dim">
              An archetype is a behavioural setting, not a cast member. Assign
              the same one to two nodes, or none at all — un-promoted nodes stay
              in the graph, they just never speak.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
