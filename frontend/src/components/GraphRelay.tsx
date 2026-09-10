"use client";

import { useEffect, useRef } from "react";
import { gsap, JOURNEY_QUERIES } from "@/lib/gsap";
import { stage } from "@/lib/stage3d";
import { CubeSigil } from "./CubeSigil";

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
 *   2b. THE DEPARTURE, and this is the fix for the bug the client described as
 *      "when it hits the new page the graph is still at full scale and then
 *      there is a small seed appearing at the start of next", and later, more
 *      bluntly, as "the seed still sits opened even after i scroll past the
 *      graph part and go towards orchestration".
 *
 *      WHAT WAS ACTUALLY WRONG. Nothing was broken in the sense of a thrown
 *      error or a stuck listener. The graph never RECEDED. `CubeStage`'s
 *      sticky box simply stopped being sticky when its column ran out and then
 *      slid up the viewport as ordinary page content, at 100% scale and 100%
 *      opacity the whole way. Measured at 1440x900 before this pass: the box
 *      released at scrollY 4968 and did not clear the top of the screen until
 *      5868 — a full viewport, 900px, of a full-size constellation sliding
 *      past while the Agents heading was already on screen underneath it, and
 *      all of that on top of ~750px of dwell before it. So for roughly 1650px
 *      of scrolling the graph was the thing on screen and nothing about it
 *      changed, which is exactly what "still sits opened" describes. Meanwhile
 *      this controller's flyer was off doing its own scrubbed travel, at a
 *      quarter of the size, unrelated to any of it.
 *
 *      THE FIX. The graph's exit is now driven from inside this same
 *      `place()`, on the same frame, off the same progress — `stage.frame
 *      .depart` — so the big thing leaving and the small thing arriving are
 *      one gesture rather than two. `depart` shrinks the 3D group toward the
 *      point the flyer left from and fades it out, and at 1 the scene stops
 *      rendering altogether. It is timed to finish BEFORE the sticky box would
 *      begin to slide, so the 900px of passive scroll-away now happens with
 *      nothing left in the box to see.
 *
 *      It has two terms and the larger wins. The lead term is the scrub, which
 *      is what ties it to the flyer. The floor is geometric: the sticky column
 *      knows exactly when it is about to stop holding, and by then the recede
 *      has to be over no matter what any progress value says. That backstop is
 *      why this cannot regress into "the graph slid away at full size" at some
 *      viewport height nobody measured.
 *   3. THE TRAVEL. A viewport path, not a document path: the flyer holds
 *      around 40-52vh with a slight lateral arc, so it descends with the
 *      scrollbar the way the first leg did. Lerping straight at the live
 *      destination instead would fling it off the bottom of the screen and
 *      then drag it back up as the target scrolled in.
 *   4. THE ARRIVAL. Past 66% it converges on `.orch-sigil` — measured live
 *      every frame — matching that element's size as it goes. `.orch-sigil` is
 *      a `CubeMark` sitting exactly on the crown cube at the top of the Orchestrator's
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
        // The things that live outside this component's subtree, all in the
        // Seed/Graph journey it takes the lineage over from.
        const graphVisual = document.querySelector<HTMLElement>(".graph-visual");
        const graphOrb = document.querySelector<HTMLElement>(".graph-center-orb");
        const graphStill = document.querySelector<HTMLElement>(".graph-still");
        // The sticky column `CubeStage` holds the 3D scene in. Only ever READ,
        // and only for its bottom edge — see the departure note above for why
        // that edge is the honest backstop for "the graph is about to slide".
        const stageColumn =
          document.querySelector<HTMLElement>(".cube-stage-column");

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
          // No travel means no departure: the graph is simply present and then
          // simply scrolled past, which is the correct reduced-motion and
          // narrow-viewport reading of this beat. `depart` must be left at 0 so
          // nothing downstream thinks the scene has been dismissed — and on
          // both of those branches `CubeStage` never mounts a scene anyway.
          stage.frame.depart = 0;
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
          const colBottom = stageColumn
            ? stageColumn.getBoundingClientRect().bottom
            : Infinity;

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

          /**
           * THE DEPARTURE. See the long note at the top of this file.
           *
           * Two terms, larger wins.
           *
           * `byScrub` is the lead and it is what makes this one gesture: it
           * opens at p = 0.115, which is inside the flyer's own detach window
           * (0.04 -> 0.28), so the graph starts folding away while the sigil
           * is visibly peeling out of the middle of it, and it is finished by
           * p = 0.275 — long before the flyer lands at 0.66. There is
           * therefore no span of the scroll where a full-size graph and a
           * small independent sigil are both on screen.
           *
           * WHY IT CLOSES SO EARLY. Client, on the first version: "it shrinks
           * but then the actual graph also moved down". The recede has to be
           * OVER before the sticky box releases, or the last part of it plays
           * while the box is also sliding and the two motions read as one
           * confused one. Measured at 1440x900 with the current spacer the box
           * releases at scrollY 4716 and this window closes at about 4640 —
           * 76px of margin, roughly one wheel notch, and `byGeometry` below
           * guarantees the margin never goes negative.
           *
           * `byGeometry` is the floor, and it is the reason this cannot rot.
           * A sticky box stops holding the instant its container's bottom edge
           * reaches the bottom of the viewport, so `colBottom` counts down to
           * exactly `vh` at that moment. This term is finished at 1.06vh —
           * BEFORE the release rather than at it — so at any viewport height,
           * and whatever anyone later does to the dwell spacer's length, the
           * graph is gone by the time the box starts to move. Under the
           * measured geometry the scrub term gets there first and the floor
           * never binds; it exists so that "the graph slid away while it was
           * still shrinking" is not reachable.
           */
          const byScrub = smoothstep(clamp01((p - 0.115) / 0.16));
          const byGeometry = smoothstep(
            clamp01((vh * 1.3 - colBottom) / (vh * 0.24)),
          );
          const depart = Math.max(byScrub, byGeometry);
          // The 3D scene reads this and does the actual receding. One number,
          // written once per frame, no React state — the same contract every
          // other field on `stage.frame` already has.
          stage.frame.depart = depart;

          gsap.set(flyer, { x, y, scale, opacity: entry * (1 - fade) });
          // The flyer swells slightly as it lands, then settles — the same
          // "gulp" pulse the first leg uses, on the inner wrapper so it never
          // fights the transform `place()` owns on the outer one.
          gsap.set(flyerInner, { scale: 1 + 0.1 * (4 * land * (1 - land)) });

          // The vacated node. Its opacity rides `entry` so it hands over to
          // the flyer on the same short ramp; its scale rides `detach`, which
          // is slower, so the socket keeps shrinking for a while after the
          // sigil has left. Not taken to zero by `entry`: the graph's edges all
          // run to this point and an empty junction reads as a rendering
          // fault, where a dim socket reads as somewhere something used to be.
          // It IS taken to zero by `depart`, along with everything else in the
          // graph, because by then there is no graph left for it to be a
          // junction of.
          gsap.set(graphOrb, {
            opacity: lerp(1, 0.32, entry) * (1 - depart),
            scale: lerp(1, 0.62, detach) * (1 - 0.55 * depart),
            transformOrigin: "50% 50%",
          });

          // THE FLAT GRAPH, on the wide/motion branch that has no WebGL.
          //
          // `.graph-still` is the server-rendered isometric SVG of the same
          // dispersed layout, and on that branch it is the graph — so it has
          // to recede on exactly the same curve the mesh does, or the no-WebGL
          // page keeps the bug the WebGL page just lost. It shrinks toward its
          // own centre, which is where the orb and therefore the flyer left
          // from.
          //
          // `stage.live &&` gate, and it is not optional: when a real scene IS
          // mounted this element must stay at zero, and `SeedJourney` is the
          // thing that decided that. Writing `1 - depart` here unconditionally
          // would turn the flat still back on underneath the live canvas — the
          // same doubling this file already documents at its own crossfade.
          if (graphStill) {
            gsap.set(graphStill, {
              opacity: stage.live ? 0 : 1 - depart,
              scale: 1 - 0.72 * depart,
              transformOrigin: "50% 50%",
            });
          }

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
          if (graphStill) gsap.set(graphStill, { clearProps: "opacity,transform" });
          // `depart` is this controller's alone, and a context that has been
          // reverted is not entitled to leave the scene dismissed — a resize
          // across 1024 and back would otherwise land on a graph that had been
          // faded out by a driver that no longer exists.
          stage.frame.depart = 0;
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
          <CubeSigil uid="relay" className="h-auto w-full" />
        </div>
      </div>

      {children}
    </div>
  );
}
