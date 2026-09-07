"use client";

import { useEffect, useRef } from "react";
import { gsap, JOURNEY_QUERIES } from "@/lib/gsap";
import { baseReveal } from "@/lib/reveal";
import { bodyLineReveal, maskWipe } from "@/lib/textAnim";
import { useInViewClass } from "@/lib/useInViewClass";
import { GRAPH_NODES } from "@/lib/content";
import { Orb } from "./Orb";
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
 * Client feedback #5 — the seed follows you down the page, eats the story
 * lines, then centres and becomes the graph.
 *
 * This component owns both sections so one master ScrollTrigger can span
 * them. `SeedSection` and `GraphSection` are now pure server markup; every
 * timeline that touches either of them lives here.
 *
 * How it works on wide viewports with motion allowed:
 *
 *   1. A single scrubbed tween runs a `driver` object from 0 to 1 across the
 *      whole run, from the top of the Seed section to the moment the graph
 *      constellation is centred. Its onUpdate is the only thing that ever
 *      positions the fixed sigil.
 *   2. `place()` maps that one progress value to a viewport coordinate: the
 *      sigil swings in from off-screen right, then descends from 26vh to
 *      70vh while drifting slightly inward, so it visibly travels down the
 *      page in step with the scrollbar.
 *   3. THE SWALLOW. Inside that same onUpdate, every target that is not
 *      already fully eaten is measured against the sigil's live centre and
 *      given a continuous 0->1 amount, which is written straight to its
 *      transform. Targets are the section heading, the seed input card, and
 *      every story line. See `applySwallow` for why this replaced the
 *      per-line trigger it used to be.
 *   4. Past 84% the same driver lerps the sigil onto the graph's central
 *      node — measured live, which on this layout is the horizontal centre
 *      of the viewport — matching its scale as it goes.
 *   5. Past 94% the flyer fades out while the graph's inline orb fades in at
 *      the same coordinate and the same size, so it reads as one continuous
 *      object. The node stagger and edge draw then play out as before.
 *
 * Narrow viewports (< 1024px): the fixed-follow mechanic is switched off
 * entirely. There is no room beside the copy for a sigil to travel through
 * at 375px, and a fixed element crossing the text would sit on top of the
 * words rather than beside them. The inline sigil stays in document flow and
 * the lines just fade up.
 *
 * Reduced motion: no travel, no consuming, no drawing. Inline sigil, lines
 * visible, nodes and edges at their final state.
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
        const flyer = q<HTMLElement>(".seed-flyer");
        const flyerInner = q<HTMLElement>(".seed-flyer-inner");
        const inlineOrb = q<HTMLElement>(".seed-inline-orb");
        const lines = qa<HTMLElement>(".seed-line");
        const lineTexts = qa<HTMLElement>(".seed-line-text");
        const nodes = qa<SVGGElement>(".gnode");
        const edges = qa<SVGLineElement>(".edge-path");
        const seedHeading = q<HTMLElement>(".seed-heading");
        const graphHeading = q<HTMLElement>(".graph-heading");
        const seedBody = qa<HTMLElement>(".seed-body");
        const graphBody = qa<HTMLElement>(".graph-body");

        if (!seedEl || !graphVisual || !graphOrb) return;

        const cleanups: (() => void)[] = [];

        // ---------------- reduced motion ----------------
        if (reduced) {
          gsap.set([lines, lineTexts, nodes, graphOrb], {
            opacity: 1,
            scale: 1,
            x: 0,
            y: 0,
          });
          gsap.set(edges, { strokeDashoffset: 0, opacity: 1 });
          if (inlineOrb) gsap.set(inlineOrb, { opacity: 1 });
          baseReveal(s, true);
          return;
        }

        baseReveal(s, false);

        // Per-section headline treatments (feedback #4). Graph gets the
        // line-by-line mask wipe; the Seed heading keeps a body-style line
        // reveal because the section's real set piece is the sigil itself.
        if (seedHeading) cleanups.push(maskWipe(seedHeading, seedEl));
        if (graphHeading) cleanups.push(maskWipe(graphHeading, graphVisual));
        cleanups.push(bodyLineReveal(seedBody, seedEl));
        cleanups.push(bodyLineReveal(graphBody, graphVisual));

        // ---------------- graph nodes + edges ----------------
        // Deliberately starts after the handoff has finished ("center 45%"
        // is reached after "center center"), so the seed has already become
        // the central node by the time the constellation grows out of it.
        // Scale each node around its own coordinate rather than the group
        // bbox, which would include the label underneath and pull the origin
        // off-centre.
        //
        // `svgOrigin`, not `transformOrigin`. A px `transformOrigin` on an
        // SVG <g> is resolved against that element's own box, so GSAP
        // compensates with a large translate — which parked the shrunken
        // nodes ~370px outside the SVG and showed up as real horizontal
        // overflow in the 1440 check. `svgOrigin` takes the coordinate in
        // SVG user space, which is what these numbers actually are.
        gsap.set(nodes, {
          opacity: 0,
          scale: 0.2,
          svgOrigin: (i: number) =>
            `${GRAPH_NODES[i]?.x ?? 0} ${GRAPH_NODES[i]?.y ?? 0}`,
        });
        gsap.set(edges, { strokeDashoffset: 1, opacity: 0 });

        const graphTl = gsap.timeline({
          scrollTrigger: { trigger: graphVisual, start: "center 45%", once: true },
        });
        graphTl
          .to(nodes, {
            opacity: 1,
            scale: 1,
            duration: 0.65,
            ease: "back.out(2)",
            stagger: { each: 0.07, from: "center" },
          })
          .to(edges, { opacity: 1, duration: 0.01 }, "-=0.35")
          .to(
            edges,
            { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut", stagger: 0.07 },
            "<",
          );

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
        ) => {
          if (measureEl && moveEl) {
            swallow.push({ measure: measureEl, move: moveEl, amount: -1, lockedAt: null });
          }
        };
        addTarget(q<HTMLElement>(".seed-heading-wrap"), q<HTMLElement>(".seed-heading"));
        addTarget(q<HTMLElement>(".seed-card-wrap"), q<HTMLElement>(".seed-card-move"));
        lines.forEach((line) =>
          addTarget(line, line.querySelector<HTMLElement>(".seed-line-move")),
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

          for (const t of swallow) {
            // Settled inside the sigil and the scroll has not come back for
            // it: no rect read, no write.
            if (t.lockedAt !== null && p >= t.lockedAt) continue;

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
            const d = ty - y;
            const a = smoothstep(clamp01((hold - d) / span));

            pending.push({ t, a, dx: x - tx, dy: y - ty });
            // Peaks at a = 0.5, so the sigil pulses hardest mid-gulp and is
            // back at rest whether the target is untouched or fully absorbed.
            peak = Math.max(peak, 4 * a * (1 - a));
          }

          // ---- WRITES ----
          const fadeT = clamp01((p - 0.94) / 0.06);
          const visible = entry > 0.02 ? 1 : 0;

          gsap.set(flyer, { x, y, scale, opacity: visible * (1 - fadeT) });
          gsap.set(graphOrb, { opacity: fadeT });
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
          graphTl.kill();
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
        The traveling sigil. `position: fixed` so it can hold a viewport
        coordinate while the document scrolls underneath — a different device
        from the pinned sections elsewhere on the page, and one that does not
        consume any pin budget because it never pins the scroll itself.
        Desktop + motion only; created hidden and revealed by the timeline.
      */}
      <div
        aria-hidden="true"
        className="seed-flyer pointer-events-none fixed left-0 top-0 z-30 hidden w-[190px] will-change-transform lg:block"
      >
        <div className="seed-flyer-inner">
          <Orb uid="travel" className="h-auto w-full" />
        </div>
      </div>

      <SeedSection />
      <GraphSection />
    </div>
  );
}
