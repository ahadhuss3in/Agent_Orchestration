"use client";

import { useEffect, useRef } from "react";
import { gsap, JOURNEY_QUERIES } from "@/lib/gsap";
import { baseReveal } from "@/lib/reveal";
import { bodyLineReveal, swoosh } from "@/lib/textAnim";
import { useInViewClass } from "@/lib/useInViewClass";
import { stage, resetStage } from "@/lib/stage3d";
import { CubeSigil } from "./CubeSigil";
import { CubeStage } from "./cube/CubeStage";
import { SeedSection } from "./SeedSection";
import { GraphSection } from "./GraphSection";

/** Matches the desktop HUD rail width. Keep in sync with `--rail-w`. */
const RAIL_W = 88;

/**
 * THE SWALLOW WINDOW. Both numbers are SCROLL DISTANCE, not time — this whole
 * mechanic is scrubbed, so a wall-clock duration would mean nothing here. They
 * are expressed against `d`, the signed gap from the sigil's centre down to
 * the target's centre, which closes at roughly one pixel per pixel scrolled.
 *
 * HOLD_VH is a dead zone measured from the sigil's own line, and it is zero:
 * nothing is written to a target at all — full opacity, full scale, no drift —
 * until it is level with the sigil. It stays a named constant rather than
 * being folded away because it is the knob for this, and a small NEGATIVE
 * value is meaningful too (the sigil would let a target rise past it and then
 * pull it back down). That is the fix for "the text disappears before I can
 * read it". The previous pass started the pull the moment the target came
 * within 0.24vh of the sigil, which on a 900px window meant a line began
 * dissolving around 74vh — still in the bottom quarter of the screen — and was
 * finished by the time it reached a comfortable reading height. A target now
 * rides the whole way up through the readable middle of the viewport with
 * nothing written to it.
 *
 * SWALLOW_VH is how far past that point the pull runs before the target is
 * fully inside the sigil: 0.36vh, up from 0.24vh, so the swallow itself also
 * reads as a glide rather than a snap. `smoothstep` is flat at both ends, so
 * the first and last tenth of that distance are nearly motionless too. 0.36vh
 * is well inside the 46vh spacing between story lines, so only one line is
 * ever mid-swallow.
 *
 * MEASURED, at 1440x900, as scroll distance for which each target is both
 * inside the readable 10-90vh band and completely untouched:
 *
 *   heading 600px   card 540px   line1 480px   line2 480px
 *   line3   420px   line4 360px  line5 360px
 *
 * and the on-screen height at which each one FIRST moves at all runs from 23%
 * for the heading to 44% for the last line — every element is above the middle
 * of the screen, well past reading position, before anything is written to it.
 *
 * Before this pass the same seven numbers ran 600 down to 180, and the 180 is
 * the one the client was reading. The floor is now 40% of a screen of
 * scrolling for every element, not just the first.
 */
const HOLD_VH = 0;
const SWALLOW_VH = 0.36;
/** px floor, for short windows where 0.36vh would be an abrupt handful of px. */
const SWALLOW_MIN = 260;

/** Classic smoothstep. Continuous, and flat at both ends so nothing pops. */
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * One thing the traveling sigil can eat.
 *
 * Two elements, never one. `measure` is the element whose position is read and
 * is guaranteed never to be transformed; `move` is the element the swallow
 * writes to. Reading a rect off an element you are also displacing would feed
 * the displacement back into the next frame's distance and the swallow would
 * accelerate into itself.
 */
type SwallowTarget = {
  measure: HTMLElement;
  move: HTMLElement;
  /**
   * WHICH CUBE THIS FLIES INTO.
   *
   * The change the client asked for: a line must not be pulled into "the
   * cluster", it must visibly go into ONE cube and merge with it, so that by
   * the time the formation comes apart the reader already knows which cube is
   * which entity. `-1` means the cluster's centre and is what the section
   * heading and the seed card use — they are not entities, they are the
   * section's furniture being cleared out of the way.
   *
   * A slot index aims at `stage.cubeScreen[slot]`, which the WebGL scene
   * rewrites every frame by projecting that cube's live world position back to
   * viewport pixels. So the aim tracks the cube through the cluster's rotation
   * and descent rather than assuming where it will be. If no scene is
   * mounted — no WebGL, or the SVG-sigil fallback branch — `cubeScreen` is
   * never written, `stage.live` stays false, and every target falls back to
   * the cluster centre, which is exactly what v5 did.
   */
  aim: number;
  /** Last amount actually written, so identical frames are skipped. */
  amount: number;
  /**
   * The scrub progress at which this target first reached amount 1. While the
   * progress is at or past this point the target is fully inside the sigil and
   * is neither measured nor written — that is the whole cost saving. The
   * moment the progress falls back below it, on reverse scroll, it re-enters
   * the loop and un-swallows through the same continuous function.
   */
  lockedAt: number | null;
};

/**
 * The seed follows you down the page, eats the story lines one cube at a
 * time, then comes apart into the graph.
 *
 * This component owns both sections so one master ScrollTrigger can span
 * them. `SeedSection` and `GraphSection` are pure server markup; every
 * timeline that touches either of them lives here.
 *
 * WHAT IS ACTUALLY ON SCREEN depends on the branch, and every branch is a
 * finished page rather than a degraded one:
 *
 *   wide + motion + WebGL   a real 3D formation of 34 cubes on a sticky
 *                           canvas (`CubeStage` -> `CubeScene`). This is the
 *                           full version: text merges into individual cubes,
 *                           the cluster disperses into the graph, and the
 *                           nodes stay draggable and promotable afterwards.
 *   wide + motion, no WebGL the same journey with the flat isometric
 *                           `CubeSigil` as the traveller. Same descent, same
 *                           swallow, same handoff — drawn in SVG.
 *   narrow / reduced motion no travel at all. The inline sigil and the
 *                           finished graph still are simply present, which is
 *                           what the server markup already renders.
 *
 * How the wide, motion-allowed run works — and note that NONE of this changed
 * when the seed became 3D, because the controller never knew what it was
 * moving in the first place:
 *
 *   1. A single scrubbed tween runs a `driver` object from 0 to 1 across the
 *      whole run, from the top of the Seed section to the moment the graph is
 *      centred. Its onUpdate is the only thing that ever positions anything.
 *   2. `place()` maps that one progress value to a viewport coordinate: the
 *      seed swings in from off-screen right, then descends from 28vh to 56vh
 *      while drifting inward, so it visibly travels down the page in step
 *      with the scrollbar. That coordinate is published to `stage.frame`,
 *      which the 3D scene reads and converts to world units.
 *   3. THE SWALLOW. Inside that same onUpdate, every target that is not
 *      already fully eaten is measured against the seed's live line and given
 *      a continuous 0->1 amount, written straight to its transform. What
 *      CHANGED is where each target is pulled TO: a story line is aimed at
 *      its own cube's live projected position, so it merges with one specific
 *      cube rather than with the mass. See `aim` on `SwallowTarget`.
 *   4. From 70% the cluster's `spread` runs to 1 and every cube lerps out of
 *      the formation into its own position in the graph layout, with edges
 *      drawn between them. Past 84% the whole group converges on the graph
 *      visual's centre, measured live.
 *   5. Past 94% the flat fallbacks fade out. On the WebGL branch they were
 *      never visible: `stage.live` holds them at zero from the first frame.
 */
export function SeedJourney() {
  const root = useRef<HTMLDivElement>(null);
  useInViewClass(root);

  useEffect(() => {
    const scope = root.current;
    if (!scope) return;

    let mm: ReturnType<typeof gsap.matchMedia> | null = null;
    let cancelled = false;

    const setup = () => {
      if (cancelled || !root.current) return;
      const s = root.current;

      const q = <T extends Element>(sel: string) => s.querySelector<T>(sel);
      const qa = <T extends Element>(sel: string) =>
        Array.from(s.querySelectorAll<T>(sel));

      mm = gsap.matchMedia();

      mm.add(JOURNEY_QUERIES, (ctx) => {
        const wide = Boolean(ctx.conditions?.wide);
        const reduced = Boolean(ctx.conditions?.reduced);

        const seedEl = q<HTMLElement>("#seed");
        const graphVisual = q<HTMLElement>(".graph-visual");
        const graphOrb = q<HTMLElement>(".graph-center-orb");
        const graphStill = q<HTMLElement>(".graph-still");
        const graphOrbArt = q<HTMLElement>(".graph-orb-art");
        const flyer = q<HTMLElement>(".seed-flyer");
        const flyerInner = q<HTMLElement>(".seed-flyer-inner");
        const inlineOrb = q<HTMLElement>(".seed-inline-orb");
        const lines = qa<HTMLElement>(".seed-line");
        const lineTexts = qa<HTMLElement>(".seed-line-text");
        const seedHeading = q<HTMLElement>(".seed-heading");
        const graphHeading = q<HTMLElement>(".graph-heading");
        const seedBody = qa<HTMLElement>(".seed-body");
        const graphBody = qa<HTMLElement>(".graph-body");

        if (!seedEl || !graphVisual || !graphOrb) return;

        const cleanups: (() => void)[] = [];

        resetStage();

        // ---------------- reduced motion ----------------
        //
        // The graph still, the seed sigil and the lines are all already at
        // their finished state in the server markup — there is nothing here to
        // reveal, only things to make sure nothing else hid. No WebGL scene is
        // mounted on this branch at all: `CubeStage` checks the same media
        // query and returns null, so the dynamic import never even fires.
        if (reduced) {
          gsap.set([lines, lineTexts, graphOrb], {
            opacity: 1,
            scale: 1,
            x: 0,
            y: 0,
          });
          if (inlineOrb) gsap.set(inlineOrb, { opacity: 1 });
          baseReveal(s, true);
          return;
        }

        baseReveal(s, false);

        // Both headlines take the page's signature entrance (feedback #3).
        if (seedHeading) cleanups.push(swoosh(seedHeading, seedEl));
        if (graphHeading) cleanups.push(swoosh(graphHeading, graphVisual));
        cleanups.push(bodyLineReveal(seedBody, seedEl));
        cleanups.push(bodyLineReveal(graphBody, graphVisual));

        // NO CONSTELLATION TIMELINE ANY MORE. v5 staggered eight SVG nodes in
        // and drew their edges on a one-shot trigger here. The nodes are cubes
        // now and they arrive by coming apart from the formation, which is a
        // continuous function of the same scrub that carries the seed down the
        // page — see `spread` in `place()`. There is nothing left to stagger.

        // ---------------- narrow: no travel ----------------
        if (!wide) {
          if (inlineOrb) gsap.set(inlineOrb, { opacity: 1 });
          gsap.set(graphOrb, { opacity: 1 });
          gsap.set(lineTexts, { opacity: 0, y: 26 });
          lines.forEach((line, i) => {
            const text = lineTexts[i];
            if (!text) return;
            gsap.to(text, {
              opacity: 1,
              y: 0,
              duration: 0.7,
              ease: "power3.out",
              scrollTrigger: { trigger: line, start: "top 82%", once: true },
            });
          });
          return () => cleanups.forEach((c) => c());
        }

        // ---------------- wide: the traveling sigil ----------------
        if (!flyer || !flyerInner) return () => cleanups.forEach((c) => c());

        if (inlineOrb) gsap.set(inlineOrb, { opacity: 0 });
        gsap.set(graphOrb, { opacity: 0 });
        gsap.set(flyer, { visibility: "visible", opacity: 0, xPercent: -50, yPercent: -50 });

        const clamp01 = gsap.utils.clamp(0, 1);
        const lerp = gsap.utils.interpolate;

        /** Flyer size vs the graph orb's size, re-measured on every refresh. */
        let scaleMatch = 1;
        const measure = () => {
          const f = flyer.getBoundingClientRect();
          const g = graphOrb.getBoundingClientRect();
          scaleMatch = f.width > 0 ? g.width / f.width : 1;
        };
        measure();

        // ---------------- what the sigil can eat ----------------
        //
        // WHY THIS IS NOT A SET OF TRIGGERS ANY MORE.
        //
        // v2 gave every story line its own `ScrollTrigger.create({ start:
        // "center 52%", once: true })`, and 52% was a hand-guess at where the
        // sigil "usually" is. But the sigil's y is `vh * lerp(0.26, 0.7, run)`
        // where `run` is a clamped remap of the scrub progress — a nonlinear
        // function of scroll, re-evaluated every frame, with the sigil ranging
        // over 44% of the viewport across the run. A fixed 52% line can only
        // agree with that at one instant. Everywhere else the trigger fired
        // while the sigil was somewhere else entirely, which is the reported
        // "the line only goes in after the seed has already passed it". And
        // `once: true` on a one-shot `.to()` meant scrolling back up left the
        // line gone forever.
        //
        // Both bugs have the same root: the decision lived somewhere the
        // sigil's real position was not known. So it moved in here, next to
        // the code that computes that position. Each frame every live target
        // is measured against the sigil's actual centre and gets a continuous
        // amount, which is written directly rather than tweened. Reversal is
        // not implemented anywhere — it simply falls out of the amount being a
        // pure function of two live positions, and ScrollTrigger already
        // scrubs the progress backwards.
        const swallow: SwallowTarget[] = [];
        const addTarget = (
          measureEl: HTMLElement | null,
          moveEl: HTMLElement | null,
          aim: number,
        ) => {
          if (measureEl && moveEl) {
            swallow.push({
              measure: measureEl,
              move: moveEl,
              aim,
              amount: -1,
              lockedAt: null,
            });
          }
        };
        addTarget(
          q<HTMLElement>(".seed-heading-wrap"),
          q<HTMLElement>(".seed-heading"),
          -1,
        );
        addTarget(
          q<HTMLElement>(".seed-card-wrap"),
          q<HTMLElement>(".seed-card-move"),
          -1,
        );
        // Story line n goes into story cube n. One line, one cube, in order.
        lines.forEach((line, i) =>
          addTarget(line, line.querySelector<HTMLElement>(".seed-line-move"), i),
        );

        /** Reads for one frame, produced before anything is written. */
        type Pending = { t: SwallowTarget; a: number; dx: number; dy: number };

        const place = (p: number) => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const contentLeft = RAIL_W;
          const contentW = vw - RAIL_W;

          // Swing in from off-screen right over the first 10%.
          const entry = clamp01(p / 0.1);
          // Descend across the story-line run, drifting a little inward.
          //
          // 26vh -> 70vh through v3, and that range is why the fix to the
          // swallow window was not on its own enough. How long a target stays
          // still and readable is the gap between the height at which it is
          // comfortably on screen and the height at which the sigil is waiting
          // for it — so a sigil sitting at 70vh catches the last story line
          // almost as soon as it clears the fold, while the same sigil at 26vh
          // gives the heading most of a screen. Measured on a 900px window it
          // came out at 600px of still, readable scroll for the heading and
          // 180px for the fifth line: the first element read fine and the last
          // one was gone before you got to it, which is exactly the complaint.
          //
          // 28vh -> 56vh keeps a clearly visible descent, a little over a
          // quarter of the viewport, and evens the run out to 558px / 306px.
          // Every target now holds still for at least a third of a screen of
          // scrolling, and the spread between the best and worst case is half
          // what it was.
          const run = clamp01((p - 0.05) / 0.66);
          const xFrac = lerp(0.82, 0.74, run);
          let x = contentLeft + contentW * xFrac + (1 - entry) * contentW * 0.32;
          let y = vh * lerp(0.28, 0.56, run);
          let scale = 1;

          // ---- READS ----
          // Every measurement for this frame happens before any write, so the
          // rect reads below cannot be interleaved with style writes and force
          // a fresh layout per target.

          // Converge on the graph's central node, measured live.
          const posT = clamp01((p - 0.84) / 0.12);
          if (posT > 0) {
            const g = graphOrb.getBoundingClientRect();
            x = lerp(x, g.left + g.width / 2, posT);
            y = lerp(y, g.top + g.height / 2, posT);
            scale = lerp(1, scaleMatch, posT);
          }

          const hold = vh * HOLD_VH;
          const span = Math.max(SWALLOW_MIN, vh * SWALLOW_VH);
          const pending: Pending[] = [];
          let peak = 0;

          /**
           * Where a given target is being pulled TO, this frame.
           *
           * The one real change to this mechanic since v5. Everything about
           * the window — `HOLD_VH`, `SWALLOW_VH`, the signed distance, the
           * smoothstep, the reversal — is untouched, because it was measured
           * and it works. What changed is that the destination is no longer
           * unconditionally "wherever the sigil is": an entity line is aimed
           * at its own cube's live projected position, so it merges with that
           * specific cube rather than at the middle of the mass.
           */
          const aimAt = (slot: number): [number, number] => {
            if (slot >= 0 && stage.live) {
              const c = stage.cubeScreen[slot];
              // A cube behind the camera or not yet projected reads as (0, 0);
              // aiming at the corner of the viewport would fling the line off
              // the page, so fall through to the cluster centre.
              if (c && (c[0] !== 0 || c[1] !== 0)) return c;
            }
            return [x, y];
          };

          for (const t of swallow) {
            // Settled inside the sigil and the scroll has not come back for
            // it: no rect read, no write.
            if (t.lockedAt !== null && p >= t.lockedAt) continue;

            const [ax, ay] = aimAt(t.aim);
            const r = t.measure.getBoundingClientRect();
            const tx = r.left + r.width / 2;
            const ty = r.top + r.height / 2;

            // Signed, not absolute. Positive means the target is still below
            // the sigil and has not been reached; zero means the sigil's
            // centre is level with it; negative means the sigil has moved past
            // it and the target stays eaten. An absolute distance would spit
            // every line back out the far side as the sigil carried on down.
            //
            // The window now straddles d = 0 rather than sitting entirely
            // above it: nothing happens until the target has closed to within
            // `hold` of the sigil's line, and the pull then runs on for `span`
            // past that, finishing at d = hold - span. So the reading happens
            // on the approach and the swallow happens as the sigil draws
            // level and passes — which is the order a reader expects, and the
            // reason the copy is legible for a real beat first.
            // The TRIGGER stays the cluster's own line (`y`), even for a
            // target aimed at a cube. Deliberate, and it is what keeps the
            // reading window honest: `HOLD_VH` and `SWALLOW_VH` were measured
            // against the cluster's descent from 28vh to 56vh, and letting a
            // cube that happens to be riding high in the formation start the
            // pull early would eat that line while it was still mid-screen —
            // the exact "the text disappears before I can read it" complaint
            // this window was built to fix. When the line does go, it goes to
            // the cube.
            const d = ty - y;
            const a = smoothstep(clamp01((hold - d) / span));

            pending.push({ t, a, dx: ax - tx, dy: ay - ty });
            // Peaks at a = 0.5, so the sigil pulses hardest mid-gulp and is
            // back at rest whether the target is untouched or fully absorbed.
            peak = Math.max(peak, 4 * a * (1 - a));
          }

          // ---- WRITES ----
          const fadeT = clamp01((p - 0.94) / 0.06);
          const visible = entry > 0.02 ? 1 : 0;

          /**
           * DISPERSAL. 0 is the clustered formation, 1 is the graph layout.
           *
           * It starts at 0.70, before the convergence on the graph's centre
           * begins at 0.84, so the cubes are already visibly coming apart as
           * they arrive rather than arriving intact and then exploding. It is
           * finished at 0.98, which is inside the window where the reader has
           * stopped scrolling the journey and the graph is the thing on
           * screen — dragging must never begin while the layout is still
           * moving under the cursor.
           */
          const spread = smoothstep(clamp01((p - 0.7) / 0.28));

          // THE STAGE IS THE ONLY THING THE SCENE READS. One write per frame,
          // no React state, no event. See `lib/stage3d.ts`.
          const f = stage.frame;
          f.x = x;
          f.y = y;
          f.p = p;
          f.spread = spread;
          f.pulse = peak;
          // The 3D group does its own cluster -> graph scaling from `spread`,
          // so the flyer-vs-orb size match below is the DOM path's business
          // only and must not be applied twice.
          f.scale = 1;
          for (const { t, a } of pending) {
            if (t.aim >= 0) f.eaten[t.aim] = a;
          }

          // THE DOM SIGIL IS THE FALLBACK, NOT THE MAIN EVENT.
          //
          // On the branch where a WebGL scene is mounted the cluster on the
          // canvas IS the seed, and this element would be a second copy of it
          // sitting on the same pixels — the same doubling bug `GraphRelay`
          // documents at its own handover. So it is held at zero the whole
          // time a scene is live. On a wide, motion-allowed viewport with no
          // WebGL, `stage.live` never becomes true, this element travels the
          // identical path with the identical swallow, and the section is
          // still the set piece it was in v5 — just drawn flat.
          gsap.set(flyer, {
            x,
            y,
            scale,
            opacity: stage.live ? 0 : visible * (1 - fadeT),
          });
          // Likewise the still of the finished graph: it is the default state
          // of the markup, and it steps aside only when something live is
          // actually drawing over it.
          //
          // `fadeT < 1` for the same reason the graph orb below carries the
          // same guard, and it is now load-bearing rather than merely tidy:
          // once this leg has handed over, `GraphRelay` owns this element and
          // shrinks it away as part of the graph's departure. Re-asserting
          // opacity 1 on every settling frame of the overlap would fight that
          // and leave the flat graph flickering back to full while it was
          // supposed to be receding. Scrolling back up drops fadeT below 1 and
          // control returns here.
          if (graphStill && fadeT < 1) {
            gsap.set(graphStill, { opacity: stage.live ? 0 : 1 });
          }
          if (graphOrbArt) {
            gsap.set(graphOrbArt, { opacity: stage.live ? 0 : 1 });
          }
          // `< 1` rather than unconditional. Once this leg has fully handed
          // over, the graph orb belongs to `GraphRelay`, whose own driver
          // starts at exactly the scroll position this one ends at — and which
          // immediately begins dimming the orb to a socket as the sigil
          // detaches for leg two. Both drivers scrub with a 0.5s lag, so for
          // about half a second of scrolling they overlap: this one is pinned
          // at fadeT = 1 and kept re-asserting opacity 1 on every settling
          // frame, which fought the relay's dim and left the node flickering
          // back to full while the sigil was already leaving it. Whichever
          // wrote last won, which is not a thing to leave to tick order.
          // Scrolling back up drops fadeT below 1 and control returns here.
          if (fadeT < 1) gsap.set(graphOrb, { opacity: fadeT });
          // The pulse lands on the inner wrapper so it cannot fight the outer
          // element's transform, which `place()` owns.
          gsap.set(flyerInner, { scale: 1 + 0.16 * peak });

          for (const { t, a, dx, dy } of pending) {
            // Latched before the no-op check, not after: a target that is
            // already at 1 and stays at 1 still has to record the lower
            // progress so the skip test above keeps tightening as the scroll
            // moves on. Recording it after the early-continue left the latch
            // stale and the target measured on every remaining frame.
            t.lockedAt = a >= 1 ? p : null;
            if (a === t.amount) continue;
            t.amount = a;
            gsap.set(t.move, {
              x: dx * a,
              y: dy * a,
              // `a * a`, not `a`. Position can start drifting early without
              // costing legibility, but size cannot — a line at 80% scale
              // reads as already leaving. Squaring an amount that is itself a
              // smoothstep keeps the element at essentially full size through
              // the front of the pull (a = 0.2 is still 96% scale) and does
              // the shrinking over the back half, where it is fading anyway.
              scale: 1 - 0.96 * a * a,
              // Full strength through the first half of the pull so the
              // element is visibly travelling while still readable, then taken
              // out over the back half rather than fading in place.
              opacity: 1 - clamp01((a - 0.5) / 0.45),
              transformOrigin: "50% 50%",
              force3D: true,
            });
          }
        };

        const driver = { p: 0 };
        const travel = gsap.to(driver, {
          p: 1,
          ease: "none",
          scrollTrigger: {
            trigger: seedEl,
            start: "top 62%",
            endTrigger: graphVisual,
            end: "center center",
            scrub: 0.5,
            invalidateOnRefresh: true,
            onRefreshInit: measure,
            // A refresh can move every anchor (fonts swapping, the intro
            // overlay releasing the scroll lock). Re-placing from the current
            // progress re-derives every amount from the new geometry.
            onRefresh: () => place(driver.p),
          },
          onUpdate: () => place(driver.p),
        });
        place(0);

        // ---------------- lines: revealed, then eaten ----------------
        // The entrance is still an ordinary one-shot reveal and still lives on
        // its own element — `.seed-line-text`, inside the element the swallow
        // moves. Two animations, two nodes, no overwrite fight.
        gsap.set(lineTexts, { opacity: 0, y: 30 });
        const lineTweens = lines
          .map((line, i) => {
            const text = lineTexts[i];
            if (!text) return null;
            return gsap.to(text, {
              opacity: 1,
              y: 0,
              duration: 0.75,
              ease: "power3.out",
              scrollTrigger: { trigger: line, start: "top 84%", once: true },
            });
          })
          .filter(Boolean) as gsap.core.Tween[];

        return () => {
          travel.kill();
          lineTweens.forEach((t) => t.kill());
          resetStage();
          // `gsap.set` calls made inside onUpdate run long after the
          // matchMedia context finished recording, so the context cannot
          // revert them. Cleared by hand.
          gsap.set(
            swallow.map((t) => t.move),
            { clearProps: "transform,opacity" },
          );
          cleanups.forEach((c) => c());
        };
      });
    };

    if (document.fonts && document.fonts.status !== "loaded") {
      document.fonts.ready.then(setup);
    } else {
      setup();
    }

    return () => {
      cancelled = true;
      mm?.revert();
    };
  }, []);

  return (
    <div ref={root} className="relative">
      {/*
        THE LIVE SEED. Mounts a WebGL scene only where one is warranted — see
        the eligibility list in `CubeStage`. On every other branch this renders
        nothing at all and the flat sigils below carry the section.
      */}
      <CubeStage />

      {/*
        THE FLAT TRAVELLING SIGIL — the wide, motion-allowed, NO-WEBGL path.

        Same fixed-position mechanic and same swallow it has had since v5, now
        drawing the cube formation instead of the astrolabe. `place()` holds it
        at opacity 0 for as long as a real scene is live, so the two are never
        both on screen. It does not consume any pin budget because it never
        pins the scroll itself.
      */}
      <div
        aria-hidden="true"
        className="seed-flyer pointer-events-none fixed left-0 top-0 z-30 hidden w-[230px] will-change-transform lg:block"
      >
        <div className="seed-flyer-inner">
          <CubeSigil uid="travel" className="h-auto w-full" />
        </div>
      </div>

      <SeedSection />
      <GraphSection />

      {/*
        THE DWELL ZONE, and it is not padding.

        Two jobs, and the second one is a real bug fix.

        First, it is where the reader actually uses the graph. The journey's
        scrub ends with the constellation centred in the viewport; without
        somewhere to stand after that, the graph settles and is immediately
        scrolled away, which would make the drag-and-promote interaction the
        client asked for something you have to fight the page to reach. This is
        the beat where nothing new arrives and the thing in front of you is
        yours to move.

        Second, the sticky canvas needs runway. `CubeStage`'s stage is a
        `sticky` box inside a column that is exactly as tall as this wrapper,
        and a sticky element STOPS sticking when its container's bottom edge
        reaches the bottom of the viewport. Measured at 1440x900 without this
        spacer, the container's bottom landed about ten pixels past the
        viewport bottom at the exact scroll position the journey finishes at —
        so the graph unstuck on the final frame and visibly slid up off the top
        of the screen, which is what the first pass actually did.

        80vh -> 52vh, AND THE REASON IS MEASURED. Client: "if anyone scrolls
        the graph just sticks in middle", and after a first cut at this, "the
        graph is still stuck for few scrolls when scrolling down after it forms
        the graph". At 80vh the graph was genuinely held, unchanging, for 746px
        at 1440x900 — 0.83 of a viewport in which scrolling did nothing visible
        — and then slid away over another full viewport at unchanged size,
        which is the separate bug `GraphRelay` now fixes. Two problems, and
        this spacer was half of the first one.

        52vh leaves 494px of hold at 1440x900, and only the first ~180px of
        that is truly inert: `GraphRelay` opens the departure about two wheel
        notches after the graph settles, so past that point every further
        scroll visibly moves something. That is the number that matters — not
        the spacer length but how long scrolling produces no change at all —
        and it is down from 746px to under 180.

        The floor is not arbitrary. The spacer has to stay longer than the
        distance between the journey's finish and the sticky release, or the
        graph unsticks before it has settled, which is the bug this element was
        originally added to fix; and it has to leave `GraphRelay` room to
        complete the recede before that release. At 1440x900 those put the
        floor around 30vh, so 52vh keeps real margin at every viewport height.

        The other half of "sticks in middle" was that nothing ever SAID the
        pause was for something. That is fixed in `CubeStage` with a hint at
        the graph itself, not here.

        ZERO BELOW 1024, and that is not a detail. `CubeStage` does not mount
        at all under that width, so there is no sticky box needing runway and
        nothing to dwell on — the spacer would be 52vh of empty black between
        the graph legend and the Agents section, which is what the first pass
        shipped and which reads as a broken page on a phone.
      */}
      <div aria-hidden="true" className="h-0 lg:h-[52vh]" />
    </div>
  );
}
