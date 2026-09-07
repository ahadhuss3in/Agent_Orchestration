"use client";

import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger, JOURNEY_QUERIES } from "@/lib/gsap";
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
 *   3. Each story line gets its own ordinary (non-scrubbed) ScrollTrigger.
 *      When one fires it reads the flyer's live rect and tweens the line
 *      into that exact point at scale 0 — so the line is pulled into the
 *      passing sigil and vanishes. Reading the live rect rather than
 *      recomputing the predicted coordinate means the two never drift apart,
 *      whatever the viewport height.
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
          gsap.set([lines, nodes, graphOrb], { opacity: 1, scale: 1, x: 0, y: 0 });
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
          gsap.set(lines, { opacity: 0, y: 26 });
          lines.forEach((line) => {
            gsap.to(line, {
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

        const place = (p: number) => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const contentLeft = RAIL_W;
          const contentW = vw - RAIL_W;

          // Swing in from off-screen right over the first 10%.
          const entry = clamp01(p / 0.1);
          // Descend 26vh -> 70vh across the story-line run, drifting a little
          // inward as it goes.
          const run = clamp01((p - 0.05) / 0.66);
          const xFrac = lerp(0.82, 0.74, run);
          let x = contentLeft + contentW * xFrac + (1 - entry) * contentW * 0.32;
          let y = vh * lerp(0.26, 0.7, run);
          let scale = 1;

          // Converge on the graph's central node, measured live.
          const posT = clamp01((p - 0.84) / 0.12);
          if (posT > 0) {
            const g = graphOrb.getBoundingClientRect();
            x = lerp(x, g.left + g.width / 2, posT);
            y = lerp(y, g.top + g.height / 2, posT);
            scale = lerp(1, scaleMatch, posT);
          }

          // Crossfade into the graph's own orb at the same coordinate.
          const fadeT = clamp01((p - 0.94) / 0.06);
          const visible = entry > 0.02 ? 1 : 0;

          gsap.set(flyer, { x, y, scale, opacity: visible * (1 - fadeT) });
          gsap.set(graphOrb, { opacity: fadeT });
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
          },
          onUpdate: () => place(driver.p),
        });
        place(0);

        // ---------------- lines: revealed, then eaten ----------------
        gsap.set(lines, { opacity: 0, y: 30 });
        const lineTweens: gsap.core.Tween[] = [];

        lines.forEach((line) => {
          lineTweens.push(
            gsap.to(line, {
              opacity: 1,
              y: 0,
              duration: 0.75,
              ease: "power3.out",
              scrollTrigger: { trigger: line, start: "top 84%", once: true },
            }),
          );

          ScrollTrigger.create({
            trigger: line,
            // Tuned against `place()`: over the story run the sigil sits
            // between 30vh and 65vh, so a line whose centre has reached ~52%
            // of the viewport is level with it.
            start: "center 52%",
            once: true,
            onEnter: () => {
              const f = flyer.getBoundingClientRect();
              const r = line.getBoundingClientRect();
              gsap.to(line, {
                x: f.left + f.width / 2 - (r.left + r.width / 2),
                y: f.top + f.height / 2 - (r.top + r.height / 2),
                scale: 0,
                opacity: 0,
                duration: 0.9,
                ease: "power2.in",
                overwrite: "auto",
              });
              // The swallow lands on an inner wrapper so it cannot fight
              // `place()`, which owns the outer element's transform.
              gsap.fromTo(
                flyerInner,
                { scale: 1 },
                {
                  scale: 1.14,
                  duration: 0.22,
                  delay: 0.6,
                  yoyo: true,
                  repeat: 1,
                  ease: "power2.out",
                },
              );
            },
          });
        });

        return () => {
          travel.kill();
          lineTweens.forEach((t) => t.kill());
          graphTl.kill();
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
