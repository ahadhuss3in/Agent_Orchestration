"use client";

import { useEffect, useRef } from "react";
import { gsap, JOURNEY_QUERIES } from "@/lib/gsap";
import { Orb } from "./Orb";

/** Matches the desktop HUD rail width. Keep in sync with `--rail-w`. */
const RAIL_W = 88;

/** Classic smoothstep. Continuous, and flat at both ends so nothing pops. */
const smoothstep = (t: number) => t * t * (3 - 2 * t);

/**
 * Custom event this controller fires on the Agents section the moment the
 * sigil has landed on the Orchestrator. `AgentsSection` listens for it and
 * starts the mitosis there, so the split reads as the payoff of the arrival
 * rather than as an unrelated thing that happens to begin nearby.
 */
export const LINEAGE_ARRIVED = "pantheon:lineage-arrived";

/**
 * THE SECOND LEG OF THE JOURNEY — Graph -> Orchestrator.
 *
 * `SeedJourney` carries the sigil from the hero, down through the Seed
 * section eating the story lines, and parks it as the graph's central node.
 * Until now that was the end of it: Agents, Simulation, Chat and Recap all
 * started cold. Client feedback: the seed is the page's protagonist and it
 * should not stop at the graph. So the graph's central node detaches again,
 * travels down the page, and arrives as the Orchestrator.
 *
 * WHY THIS IS A SEPARATE COMPONENT AND NOT MORE OF `SeedJourney`.
 *
 * The mechanism is deliberately identical — one scrubbed driver, a fixed
 * traveling element, a crossfade onto a live-measured destination rect — but
 * the ownership is different. `SeedJourney` owns Seed and Graph outright: both
 * are pure server markup and every timeline that touches them lives in that
 * one file. Agents is not like that. It is a client component with 200 lines
 * of mitosis, idle loops and an IntersectionObserver of its own, and hoisting
 * it into `SeedJourney` would mean one controller owning three sections and
 * two unrelated animation systems. Instead this wraps Agents as `children`,
 * which gives it a scope to query the Orchestrator out of, and reaches for the
 * graph's orb — the one thing it needs from outside — by id. The two
 * components talk through exactly one event, declared above.
 *
 * HOW IT RUNS on wide viewports with motion allowed:
 *
 *   1. One scrubbed tween drives `driver.p` from 0 to 1, starting at the exact
 *      scroll position `SeedJourney` finishes at (`.graph-visual` centred) and
 *      ending as the Orchestrator card comes up the screen. Nothing else ever
 *      positions the flyer.
 *   2. THE DETACH. At p = 0 the flyer sits on the graph's central node's live
 *      rect at its live size, so the handover is invisible. Over the first
 *      quarter it peels off onto a viewport path while the node it left dims
 *      and shrinks to a socket — the object has gone, the graph keeps the hole
 *      it came out of.
 *   3. THE TRAVEL. A viewport path, not a document path: the flyer holds
 *      around 40-52vh with a slight lateral arc, so it descends with the
 *      scrollbar the way the first leg did. Lerping straight at the live
 *      destination instead would fling it off the bottom of the screen and
 *      then drag it back up as the target scrolled in.
 *   4. THE ARRIVAL. Past 66% it converges on `.orch-sigil` — measured live
 *      every frame — matching that element's size as it goes. `.orch-sigil` is
 *      a `SeedCore` sitting exactly on the orb at the top of the Orchestrator's
 *      staff, so the sigil does not land NEXT to the figure, it lands as the
 *      light the figure is holding.
 *   5. THE HANDOVER. Past 86% the Orchestrator's wireframe draws itself in
 *      stroke by stroke (`pathLength=1` + `strokeDashoffset`, the same
 *      treatment the graph's own edges use one section earlier) while the
 *      flyer fades out into `.orch-sigil` at the same coordinate and the same
 *      size. Then `LINEAGE_ARRIVED` fires and the mitosis takes over.
 *
 * The draw-in is LATCHED once complete: scrolling back up reverses the travel,
 * because that is cheap and reads fine, but never un-draws the Orchestrator,
 * which by then has four archetypes hanging off it.
 *
 * Narrow viewports (< 1024px): no travel, for the same reason as the first
 * leg — there is no room beside the copy at 375px for a 190px sigil to cross,
 * and a fixed element on that path would sit on the words rather than beside
 * them. The graph keeps its node, the Orchestrator is simply drawn, and the
 * mitosis falls back to its own ScrollTrigger.
 *
 * Reduced motion: nothing here is built at all. Graph node present, staff
 * sigil present, Orchestrator fully drawn, no flyer — the final state of the
 * whole handoff, legible at rest.
 */
export function GraphRelay({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scope = root.current;
    if (!scope) return;

    let mm: ReturnType<typeof gsap.matchMedia> | null = null;
    let cancelled = false;

    const setup = () => {
      if (cancelled || !root.current) return;
      const s = root.current;

      mm = gsap.matchMedia();

      mm.add(JOURNEY_QUERIES, (ctx) => {
        const wide = Boolean(ctx.conditions?.wide);
        const reduced = Boolean(ctx.conditions?.reduced);

        const agents = s.querySelector<HTMLElement>("#agents");
        const orchWrap = s.querySelector<HTMLElement>(".orchestrator-figure");
        const orchSigil = s.querySelector<HTMLElement>(".orch-sigil");
        const hub = s.querySelector<HTMLElement>(".agents-hub");
        const flyer = s.querySelector<HTMLElement>(".relay-flyer");
        const flyerInner = s.querySelector<HTMLElement>(".relay-flyer-inner");
        // The one thing that lives outside this component's subtree.
        const graphVisual = document.querySelector<HTMLElement>(".graph-visual");
        const graphOrb = document.querySelector<HTMLElement>(".graph-center-orb");

        const strokes = orchWrap
          ? Array.from(orchWrap.querySelectorAll<SVGElement>(".orch-stroke"))
          : [];
        const joints = orchWrap
          ? Array.from(orchWrap.querySelectorAll<SVGElement>(".orch-joint"))
          : [];

        // ---------------- reduced motion / no travel ----------------
        //
        // Both branches leave exactly the same legible end state: every part
        // of the handoff present, none of it animated. The only difference is
        // that the narrow branch is still inside a `no-preference` query, so
        // Agents' own reveals and mitosis still run — they just start from
        // their own trigger instead of from an arrival.
        if (reduced || !wide || !orchSigil || !flyer || !flyerInner || !graphVisual || !graphOrb) {
          gsap.set([strokes, joints], { strokeDashoffset: 0, opacity: 1 });
          if (orchSigil) gsap.set(orchSigil, { opacity: 1, scale: 1 });
          if (graphOrb) gsap.set(graphOrb, { opacity: 1, scale: 1 });
          return;
        }

        // ---------------- wide + motion ----------------
        gsap.set(orchSigil, { opacity: 0, scale: 1, transformOrigin: "50% 50%" });
        gsap.set(strokes, { strokeDashoffset: 1 });
        gsap.set(joints, { opacity: 0 });
        gsap.set(flyer, {
          visibility: "visible",
          opacity: 0,
          xPercent: -50,
          yPercent: -50,
        });

        const clamp01 = gsap.utils.clamp(0, 1);
        const lerp = gsap.utils.interpolate;

        /**
         * The flyer's own width against the two things it has to look
         * identical to, re-measured on every refresh rather than cached at
         * build time: both destinations are percentage-sized and the fonts
         * swapping under them moves the second one.
         *
         * `offsetWidth`, NOT `getBoundingClientRect().width`. Both of these
         * elements are things this controller is itself scaling, and a rect is
         * post-transform — so a refresh that happened mid-scroll measured the
         * sigil while it was still at 0.55 and handed back a match factor
         * that landed the flyer at 28px against a 47px destination. Traced,
         * that was a visible size pop at the exact frame of the crossfade,
         * which is the one frame the whole illusion depends on. `offsetWidth`
         * is layout width and ignores the transform, so it answers the
         * question actually being asked: how big is this element supposed to
         * be.
         */
        let graphMatch = 1;
        let sigilMatch = 0.25;
        const measure = () => {
          const fw = flyer.offsetWidth;
          if (fw <= 0) return;
          if (graphOrb.offsetWidth > 0) graphMatch = graphOrb.offsetWidth / fw;
          if (orchSigil.offsetWidth > 0) sigilMatch = orchSigil.offsetWidth / fw;
        };
        measure();

        /** Latched the first time the draw-in completes. See the note above. */
        let drawn = false;
        let arrived = false;

        const place = (p: number) => {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const contentLeft = RAIL_W;
          const contentW = vw - RAIL_W;

          // ---- READS ----
          // Every rect this frame needs, taken before anything is written, so
          // a style write can never sit between two reads and force an extra
          // layout pass per measurement.
          const g = graphOrb.getBoundingClientRect();
          const t = orchSigil.getBoundingClientRect();

          const srcX = g.left + g.width / 2;
          const srcY = g.top + g.height / 2;

          // Peel off the node over the first quarter, then ride a viewport
          // path. The arc is a half sine so the flyer leaves and rejoins the
          // centre line rather than sliding sideways and staying there.
          const detach = smoothstep(clamp01((p - 0.04) / 0.24));
          const run = clamp01((p - 0.06) / 0.54);
          const pathX =
            contentLeft + contentW * (0.5 + 0.11 * Math.sin(run * Math.PI));
          const pathY = vh * lerp(0.4, 0.52, run);

          let x = lerp(srcX, pathX, detach);
          let y = lerp(srcY, pathY, detach);
          let scale = graphMatch;

          const land = smoothstep(clamp01((p - 0.66) / 0.26));
          if (land > 0) {
            x = lerp(x, t.left + t.width / 2, land);
            y = lerp(y, t.top + t.height / 2, land);
            scale = lerp(graphMatch, sigilMatch, land);
          }

          // ---- WRITES ----
          const fade = smoothstep(clamp01((p - 0.86) / 0.14));
          // THE DETACH IS A CROSSFADE, NOT A SWITCH.
          //
          // v1 snapped the flyer to opacity 1 the first frame past p = 0 while
          // the graph's node was still at 1, which put two copies of the same
          // sigil on the same pixels at full strength — and because each `Orb`
          // runs its own idle rotation at its own phase, the two rings beat
          // against each other and the node visibly doubled for a frame.
          //
          // Complementary opacities over the same short window instead, which
          // is exactly what the Seed -> Graph leg does at its own handover.
          // The two are the same drawing at the same coordinate and the same
          // size, so at any point in the ramp they read as one object getting
          // no brighter and no dimmer — and because `entry` also drives the
          // node's dim, the sigil looks like it is lifting OUT of the graph
          // rather than appearing next to it.
          const entry = smoothstep(clamp01((p - 0.02) / 0.1));

          gsap.set(flyer, { x, y, scale, opacity: entry * (1 - fade) });
          // The flyer swells slightly as it lands, then settles — the same
          // "gulp" pulse the first leg uses, on the inner wrapper so it never
          // fights the transform `place()` owns on the outer one.
          gsap.set(flyerInner, { scale: 1 + 0.1 * (4 * land * (1 - land)) });

          // The vacated node. Its opacity rides `entry` so it hands over to
          // the flyer on the same short ramp; its scale rides `detach`, which
          // is slower, so the socket keeps shrinking for a while after the
          // sigil has left. Not taken to zero: the graph's edges all run to
          // this point and an empty junction reads as a rendering fault, where
          // a dim socket reads as somewhere something used to be.
          gsap.set(graphOrb, {
            opacity: lerp(1, 0.32, entry),
            scale: lerp(1, 0.62, detach),
            transformOrigin: "50% 50%",
          });

          // Opacity only. The destination deliberately does NOT scale up into
          // place: the flyer is already sized to this element's layout width,
          // so holding it at scale 1 makes the two pixel-identical for the
          // whole crossfade. Scaling it would mean the incoming copy was a
          // different size from the outgoing one at every frame of the swap,
          // which is the one thing that gives the trick away. The arrival
          // still has a settle — `flyerInner` pulses through the landing.
          gsap.set(orchSigil, { opacity: fade });

          // The figure assembles under the arriving sigil.
          if (!drawn) {
            const draw = clamp01((p - 0.72) / 0.26);
            gsap.set(strokes, { strokeDashoffset: 1 - draw });
            gsap.set(joints, { opacity: draw });
            if (draw >= 1) drawn = true;
          }

          if (!arrived && p > 0.985 && agents) {
            arrived = true;
            agents.dispatchEvent(new CustomEvent(LINEAGE_ARRIVED));
          }
        };

        const driver = { p: 0 };
        const travel = gsap.to(driver, {
          p: 1,
          ease: "none",
          scrollTrigger: {
            // Starts exactly where `SeedJourney`'s own driver ends, so there
            // is no gap and no overlap between the two legs: the first one
            // finishes writing the graph orb at the same scroll position this
            // one starts reading it.
            trigger: graphVisual,
            start: "center center",
            endTrigger: hub ?? orchWrap ?? agents ?? undefined,
            end: "top 46%",
            scrub: 0.5,
            invalidateOnRefresh: true,
            onRefreshInit: measure,
            onRefresh: () => place(driver.p),
          },
          onUpdate: () => place(driver.p),
        });
        place(0);

        return () => {
          travel.kill();
          // `gsap.set` calls made from inside onUpdate run long after the
          // matchMedia context finished recording, so the context cannot
          // revert them. Cleared by hand, and the Orchestrator is put back to
          // its drawn state rather than to whatever frame it was killed on.
          gsap.set([strokes, joints], {
            clearProps: "strokeDashoffset,opacity",
          });
          gsap.set([orchSigil, graphOrb], { clearProps: "opacity,transform" });
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
        The traveling sigil, leg two. Same device as `.seed-flyer`: fixed, so
        it can hold a viewport coordinate while the document scrolls under it,
        and no pin anywhere — this costs nothing against the page's pin budget
        because it never pins the scroll. Desktop + motion only, created hidden
        and revealed by the driver.
      */}
      <div
        aria-hidden="true"
        className="relay-flyer pointer-events-none fixed left-0 top-0 z-30 hidden w-[190px] will-change-transform lg:block"
      >
        <div className="relay-flyer-inner">
          <Orb uid="relay" className="h-auto w-full" />
        </div>
      </div>

      {children}
    </div>
  );
}
