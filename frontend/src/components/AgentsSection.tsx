"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap, ScrollTrigger, MOTION_QUERIES } from "@/lib/gsap";
import { baseReveal } from "@/lib/reveal";
import { assemble, bodyLineReveal, gesture, typeChars } from "@/lib/textAnim";
import { ARCHETYPES, ORCHESTRATOR } from "@/lib/content";
import { FIGURES } from "@/lib/figures";
import { InlineFigure } from "./WireframeFigures";

/**
 * The four archetype cards. Named COUNCIL through v3, when this section still
 * presented them as a fixed cast that had already been assembled for the one
 * example scenario. They are a menu, not a council — see the section copy
 * below and the note over `ARCHETYPES` in `content.ts`.
 */
const COUNCIL = ARCHETYPES;

/**
 * The Orchestrator splits to create the four personas, then they talk — and
 * then, as of v3, they keep breathing.
 *
 * WHAT THIS SECTION IS SAYING (v4). Strategist / Skeptic / Loyalist / Wildcard
 * are not characters. They are the palette of behavioural types you pick from
 * when you promote an entity out of the graph, and the same four are available
 * for whichever entity that turns out to be. The previous copy read as "here
 * are the four agents in this story", which is the wrong model twice over: it
 * tied each archetype to a person it does not belong to, and it implied the
 * cast was fixed rather than chosen. The Orchestrator is not a fifth option on
 * that menu either — it is a system role the engine supplies itself, which is
 * why it lives in its own export and wears a different label to the four.
 *
 * The mitosis animation survives the reframe unchanged, and reads better under
 * it: what flies out of the Orchestrator is now four available roles being put
 * on the table, not four people being born.
 *
 * THE BACKGROUND. A photograph of a face whose features have been taken over
 * by something that is not them, full-bleed behind this section and nowhere
 * else on the page. It is not wallpaper: this is the section where an entity
 * pulled out of a graph is handed a persona and told to be someone, and the
 * plate is literally about wearing a face that is not your own. It drifts on
 * its own slow loop, independent of the intro's Ken-Burns, and parks itself
 * via IntersectionObserver whenever the section is off screen — the same
 * discipline `Orb` uses for its idle rotations. The scrim over it was sized
 * against the worst pixel the image can produce rather than eyeballed; the
 * arithmetic is in `globals.css` next to `.agents-bg-scrim`.
 *
 * MITOSIS. When the Orchestrator is fully in view, four shards fly out of its
 * body to the four card positions and become the personas. Each shard is a
 * real limb path lifted straight out of the Orchestrator's own geometry
 * (`FIGURES.orchestrator.strokes[limb]`), so what flies out is genuinely a
 * piece of the figure rather than a generic blob.
 *
 * MorphSVGPlugin is used for the shape change, and it was verified rather
 * than assumed: `node_modules/gsap/MorphSVGPlugin.js` is a real 38KB
 * implementation stamped "MorphSVGPlugin 3.15.0" that imports the actual path
 * utilities, not a club stub. Everything that used to be paywalled ships in
 * the free core package from GSAP 3.13 on, so the shard morphs from the
 * Orchestrator's arm into the destination persona's arm mid-flight, then
 * cross-dissolves into the full wireframe with a settle bounce.
 *
 * THE WEB. Four faint lines draw themselves from the Orchestrator down to each
 * persona once the mitosis lands, and stay. Same `pathLength={1}` +
 * `strokeDashoffset` treatment as the Graph section's own edges one section
 * earlier, so this reads as the same idea continued rather than a new trick,
 * and it puts something in the empty band between the hub card and the row.
 *
 * IDLE. After the split the section used to freeze. Now every figure holds a
 * slow loop on a sub-element — the Orchestrator's staff sways and the orb at
 * its head pulses, and each persona's head bobs while its joint dots shimmer
 * out of phase with its neighbours. That is why the four personas are drawn
 * with `InlineFigure` rather than the `<use>` sprite: a `<use>` shadow tree
 * has no elements script can reach, so there would be nothing to breathe.
 * All of it parks with the same IntersectionObserver as the background.
 *
 * TALK BEAT. Each persona's card animates as it comes into focus: the figure
 * leans and bobs while its description types on character-by-character,
 * reusing the Simulation section's typing pattern.
 *
 * Everything above is gated behind `gsap.matchMedia()`. Under reduced motion
 * no shard is ever created (the layer is `display: none` in CSS), no loop is
 * built, the background image is present but still, the web is drawn at full
 * length by CSS, and the text is simply text.
 */
export function AgentsSection() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const scope = root.current;
    if (!scope) return;

    let mm: ReturnType<typeof gsap.matchMedia> | null = null;
    let cancelled = false;

    const setup = () => {
      if (cancelled || !root.current) return;
      const s = root.current;

      mm = gsap.matchMedia();

      mm.add(MOTION_QUERIES, (ctx) => {
        const reduced = Boolean(ctx.conditions?.reduced);
        baseReveal(s, reduced);

        const heading = s.querySelector<HTMLElement>(".agents-heading");
        const body = Array.from(s.querySelectorAll<HTMLElement>(".agents-body"));
        const figures = Array.from(
          s.querySelectorAll<HTMLElement>(".persona-figure"),
        );
        const notes = Array.from(s.querySelectorAll<HTMLElement>(".persona-note"));
        const cards = Array.from(s.querySelectorAll<HTMLElement>(".persona-card"));
        const shards = Array.from(s.querySelectorAll<HTMLElement>(".shard"));
        const shardPaths = Array.from(
          s.querySelectorAll<SVGPathElement>(".shard-path"),
        );
        const layer = s.querySelector<HTMLElement>(".mitosis-layer");
        const orch = s.querySelector<HTMLElement>(".orchestrator-figure");
        const hub = s.querySelector<HTMLElement>(".agents-hub");
        const web = s.querySelector<SVGSVGElement>(".agents-web");
        const webEdges = Array.from(
          s.querySelectorAll<SVGLineElement>(".agents-edge"),
        );
        const bg = s.querySelector<HTMLElement>(".agents-bg-img");
        const idlers = Array.from(
          s.querySelectorAll<HTMLElement>(".persona-idle"),
        );
        // The staff is a real stroke in the Orchestrator's own geometry;
        // `InlineFigure` stamps each stroke with its index so it can be
        // addressed without hardcoding a magic number here.
        const staffIdx = FIGURES.orchestrator.strokes.indexOf("M98 14 L98 196");
        const staff = orch?.querySelector<SVGElement>(
          `[data-stroke="${staffIdx}"]`,
        );
        const staffOrb = orch?.querySelector<SVGElement>(".orch-joint");

        /**
         * Point the relationship web at where the cards actually are.
         *
         * Geometry, not motion, so it runs in the reduced-motion branch too —
         * under reduced motion the CSS forces `stroke-dashoffset: 0` and the
         * web is simply there, already drawn. Coordinates are in CSS pixels
         * relative to the <svg>'s own box: the element carries no viewBox, so
         * one user unit is one pixel and no scaling math is needed.
         */
        const placeWeb = () => {
          if (!web || !hub || webEdges.length === 0) return;
          // `hidden lg:block` — below the four-column grid the hub and the
          // cards are stacked, and a line from one to the next would be a
          // vertical stripe through the copy rather than a relationship.
          if (web.clientWidth === 0) return;
          const wr = web.getBoundingClientRect();
          const hr = hub.getBoundingClientRect();
          const x1 = hr.left - wr.left + hr.width / 2;
          const y1 = hr.bottom - wr.top;
          webEdges.forEach((edge, i) => {
            const card = cards[i];
            if (!card) return;
            const cr = card.getBoundingClientRect();
            edge.setAttribute("x1", String(x1));
            edge.setAttribute("y1", String(y1));
            edge.setAttribute("x2", String(cr.left - wr.left + cr.width / 2));
            edge.setAttribute("y2", String(cr.top - wr.top));
          });
        };

        placeWeb();
        let ro: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined" && web) {
          ro = new ResizeObserver(placeWeb);
          ro.observe(s);
        }

        // ---------------- reduced motion ----------------
        if (reduced) {
          gsap.set([figures, notes], { opacity: 1, scale: 1, x: 0, y: 0 });
          return () => ro?.disconnect();
        }

        const cleanups: (() => void)[] = [];
        cleanups.push(() => ro?.disconnect());
        if (heading) cleanups.push(assemble(heading, s));
        cleanups.push(bodyLineReveal(body, s));

        // ---------------- ambient loops ----------------
        //
        // All built paused. The background drift starts as soon as the section
        // is on screen; the figure loops wait for the mitosis to land, because
        // a persona that has not hatched yet has nothing to breathe with.
        // Nothing here ever runs for an off-screen viewport — same
        // IntersectionObserver parking `Orb` uses for its own idle rotations.

        // The section background. Its own slow loop, deliberately unrelated to
        // the intro's Ken-Burns: different amplitude, different period,
        // different direction, so the two never look like the same effect
        // reused.
        const bgDrift = bg
          ? gsap.to(bg, {
              xPercent: -2.6,
              yPercent: 2.2,
              scale: 1.07,
              duration: 27,
              repeat: -1,
              yoyo: true,
              ease: "sine.inOut",
              transformOrigin: "50% 38%",
              paused: true,
            })
          : null;

        const idle: gsap.core.Tween[] = [];

        // The Orchestrator breathes through its staff and the orb at its head
        // — both real sub-elements of its geometry, reachable because it is
        // rendered inline.
        if (staff) {
          idle.push(
            gsap.to(staff, {
              rotation: 1.5,
              duration: 4.4,
              repeat: -1,
              yoyo: true,
              ease: "sine.inOut",
              svgOrigin: "98 196",
              paused: true,
            }),
          );
        }
        if (staffOrb) {
          idle.push(
            gsap.to(staffOrb, {
              scale: 1.22,
              opacity: 0.7,
              duration: 2.8,
              repeat: -1,
              yoyo: true,
              ease: "sine.inOut",
              svgOrigin: "98 12",
              paused: true,
            }),
          );
        }

        figures.forEach((fig, i) => {
          // First `.pf-stroke` is the head outline: `InlineFigure` emits the
          // outline circles before the stroke paths.
          const head = fig.querySelector<SVGElement>(".pf-stroke");
          const joints = Array.from(fig.querySelectorAll<SVGElement>(".pf-joint"));
          const o = FIGURES[COUNCIL[i]?.id ?? "strategist"].outlines[0];

          // Scaled about its own centre rather than nudged on y, so the head
          // swells and settles instead of detaching from the neck stroke.
          if (head && o) {
            idle.push(
              gsap.to(head, {
                scale: 1.06,
                duration: 2.6 + i * 0.4,
                repeat: -1,
                yoyo: true,
                ease: "sine.inOut",
                svgOrigin: `${o.cx} ${o.cy}`,
                delay: i * 0.35,
                paused: true,
              }),
            );
          }
          if (joints.length) {
            idle.push(
              gsap.to(joints, {
                opacity: 0.4,
                duration: 1.7 + i * 0.25,
                repeat: -1,
                yoyo: true,
                ease: "sine.inOut",
                stagger: { each: 0.19, from: "random" },
                paused: true,
              }),
            );
          }
        });

        // A whole-body sway on the wrapper, not on the figure itself: the talk
        // beat's `gesture()` owns the figure's own rotation and the two would
        // otherwise overwrite each other.
        idlers.forEach((el, i) => {
          idle.push(
            gsap.to(el, {
              rotation: i % 2 ? 0.7 : -0.7,
              y: -3,
              duration: 3.7 + i * 0.5,
              repeat: -1,
              yoyo: true,
              ease: "sine.inOut",
              transformOrigin: "50% 100%",
              delay: i * 0.4,
              paused: true,
            }),
          );
        });

        let hatched = false;
        let onScreen = true;
        const sync = () => {
          if (bgDrift) {
            if (onScreen) bgDrift.play();
            else bgDrift.pause();
          }
          idle.forEach((t) => {
            if (onScreen && hatched) t.play();
            else t.pause();
          });
        };

        let io: IntersectionObserver | null = null;
        if (typeof IntersectionObserver !== "undefined") {
          io = new IntersectionObserver(
            ([entry]) => {
              onScreen = entry.isIntersecting;
              sync();
            },
            { rootMargin: "15% 0px" },
          );
          io.observe(s);
        }
        sync();

        cleanups.push(() => {
          io?.disconnect();
          bgDrift?.kill();
          idle.forEach((t) => t.kill());
        });

        // ---------------- mitosis ----------------
        if (layer && orch && shards.length === COUNCIL.length) {
          gsap.set(figures, { opacity: 0, scale: 0.45, transformOrigin: "50% 100%" });
          gsap.set(shards, { opacity: 0, xPercent: -50, yPercent: -50 });
          gsap.set(webEdges, { strokeDashoffset: 1 });

          const tl = gsap.timeline({
            scrollTrigger: { trigger: orch, start: "top 62%", once: true },
            defaults: { ease: "power2.out" },
          });

          // The staff arm lifts as the split begins: the Zeus figure doing
          // the summoning rather than passively standing there.
          if (staff) {
            tl.fromTo(
              staff,
              { rotation: 0 },
              {
                rotation: -6,
                duration: 0.5,
                yoyo: true,
                repeat: 1,
                svgOrigin: "98 196",
                ease: "power2.inOut",
              },
              0,
            );
          }
          if (staffOrb) {
            tl.fromTo(
              staffOrb,
              { scale: 1 },
              {
                scale: 2.1,
                duration: 0.45,
                yoyo: true,
                repeat: 1,
                svgOrigin: "98 12",
                ease: "power2.out",
              },
              0.1,
            );
          }

          shards.forEach((shard, i) => {
            const path = shardPaths[i];
            const fig = figures[i];
            if (!fig) return;

            // Measured against the layer, which spans the whole block, so
            // the numbers stay right whatever the grid does at this
            // breakpoint. Deliberately function-based rather than computed
            // now: GSAP evaluates these when the tween actually starts, which
            // is after fonts have swapped and the grid has settled. Measuring
            // at build time would bake in a pre-font layout.
            const from = () => {
              const lr = layer.getBoundingClientRect();
              const o = orch.getBoundingClientRect();
              return {
                x: o.left - lr.left + o.width * 0.47,
                y: o.top - lr.top + o.height * 0.42,
              };
            };
            const to = () => {
              const lr = layer.getBoundingClientRect();
              const fr = fig.getBoundingClientRect();
              return {
                x: fr.left - lr.left + fr.width / 2,
                y: fr.top - lr.top + fr.height / 2,
              };
            };

            const at = 0.3 + i * 0.12;

            tl.set(
              shard,
              { x: () => from().x, y: () => from().y, scale: 0.3, rotation: 0 },
              at,
            )
              .to(shard, { opacity: 1, duration: 0.18 }, at)
              .to(
                shard,
                {
                  x: () => to().x,
                  y: () => to().y,
                  scale: 1,
                  rotation: i % 2 ? 14 : -14,
                  duration: 0.95,
                  ease: "power2.inOut",
                },
                at,
              );

            // The real shape morph, mid-flight.
            if (path) {
              const targetD = FIGURES[COUNCIL[i].id].strokes[
                FIGURES[COUNCIL[i].id].limb
              ];
              tl.to(
                path,
                { morphSVG: targetD, duration: 0.8, ease: "power1.inOut" },
                at + 0.1,
              );
            }

            // Cross-dissolve: shard out, real wireframe in with a settle.
            tl.to(shard, { opacity: 0, scale: 1.25, duration: 0.3 }, at + 0.85)
              .to(
                fig,
                {
                  opacity: 1,
                  scale: 1,
                  duration: 0.75,
                  ease: "back.out(2.2)",
                },
                at + 0.85,
              );
          });
          // ---- the web draws itself, then stays ----
          // Positioned at 1.6s, which is after the first two shards have
          // landed and while the last two are still in flight, so the lines
          // grow with the split rather than appearing once it is over.
          if (webEdges.length) {
            // Re-measured immediately before drawing. The first `placeWeb()`
            // above runs while `baseReveal` still has the cards held 30px low,
            // so the coordinates cached then would land the lines a card-lift
            // short of where the cards actually settle.
            tl.call(placeWeb, undefined, 1.55).to(
              webEdges,
              {
                strokeDashoffset: 0,
                duration: 1,
                ease: "power2.inOut",
                stagger: 0.09,
              },
              1.6,
            );
          }

          tl.eventCallback("onComplete", () => {
            hatched = true;
            sync();
          });
        } else {
          // No layer measured (shouldn't happen, but never leave the cast
          // invisible if it does).
          gsap.set(figures, { opacity: 1, scale: 1 });
          if (webEdges.length) gsap.set(webEdges, { strokeDashoffset: 0, opacity: 1 });
          hatched = true;
          sync();
        }

        // ---------------- talk beat ----------------
        cards.forEach((card, i) => {
          const fig = figures[i];
          const note = notes[i];

          if (fig) {
            ScrollTrigger.create({
              trigger: card,
              start: "top 68%",
              once: true,
              onEnter: () => gesture(fig),
            });
          }
          if (note) cleanups.push(typeChars(note, card, "top 68%"));
        });

        return () => cleanups.forEach((c) => c());
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

  const limbD = FIGURES.orchestrator.strokes[FIGURES.orchestrator.limb];

  return (
    <section
      id="agents"
      ref={root}
      aria-labelledby="agents-heading"
      className="sec-agents sec-seam relative overflow-hidden py-24 lg:py-36"
    >
      {/* The borrowed face. Scoped to this section and nowhere else on the
          page. Purely atmospheric, so `aria-hidden` and an empty alt: what the
          section means is said in the heading and the copy. The inset is
          negative so the drift has somewhere to go without ever exposing an
          edge of the plate.

          `agents-bg-plate` carries the top/bottom fade, and it lives on THIS
          wrapper rather than on `.agents-bg-img` for two reasons. The wrapper
          is exactly the section box, so 15vh means 15vh from the section's own
          edge; the image inside it is inset by -6% and drifts, so a mask there
          resolves against a taller, moving box and left the plate still at 65%
          opacity where the section ended. And the fade has to take the scrim
          with it: fading the photograph alone out of a scrim that stayed put
          would just darken the last strip of the section, which is the same
          hard edge in the other direction. */}
      <div
        aria-hidden="true"
        className="agents-bg-plate pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="agents-bg-img absolute inset-[-6%]">
          <Image
            src="/img/borrowed-face.jpg"
            alt=""
            fill
            sizes="100vw"
            className="object-cover object-[50%_20%]"
          />
        </div>
        <div className="agents-bg-scrim absolute inset-0" />
      </div>

      <div
        aria-hidden="true"
        className="sec-wash"
        style={{ "--wash-x": "50%", "--wash-y": "20%" } as React.CSSProperties}
      />

      <div className="relative mx-auto w-full max-w-[1440px] px-6 sm:px-8 lg:px-14">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
          <div>
            <span className="stage-rule reveal-target mb-8" aria-hidden="true" />
            <h2
              id="agents-heading"
              className="agents-heading display-sm max-w-[18ch] text-[clamp(1.75rem,4.4vw,3rem)] text-ink"
            >
              You pick who wakes up, and who they wake up as.
            </h2>
          </div>

          <div className="max-w-[58ch] lg:pt-2">
            <p className="agents-body font-mono text-[15px] leading-relaxed text-ink-dim">
              Extraction produces candidates, not agents. Promotion is a manual
              gate the engine will not walk through on its own: a human reviews
              what the graph found, picks the entities worth simulating, and
              assigns each one an archetype.
            </p>
            <p className="agents-body mt-5 font-mono text-[15px] leading-relaxed text-ink-dim">
              The archetype is the behaviour, not the identity. Any entity in
              the graph can be promoted under any of the four below, the same
              archetype can go to a different entity on the next run, and the
              entity behind it still supplies what the agent knows and which
              edges it can reach. Everything you leave alone stays a node: still
              in Neo4j, still queryable, just not talking.
            </p>
          </div>
        </div>

        {/* The mitosis layer spans the Orchestrator and the whole council row
            so shard coordinates can be measured in one space. */}
        <div className="relative">
          {/* The relationship web. No viewBox on purpose — one SVG user unit
              is one CSS pixel, which is the space the coordinates are measured
              in. Hidden below the four-column breakpoint, where the hub and
              the cards are stacked in a single column and a connector would
              just be a stripe down the middle of the copy. */}
          <svg
            className="agents-web pointer-events-none absolute inset-0 z-0 hidden h-full w-full lg:block"
            aria-hidden="true"
            focusable="false"
            role="presentation"
          >
            {COUNCIL.map((p) => (
              <line
                key={p.id}
                className="agents-edge"
                pathLength={1}
                strokeDasharray={1}
                strokeDashoffset={1}
                strokeLinecap="round"
              />
            ))}
          </svg>

          <div
            aria-hidden="true"
            className="mitosis-layer pointer-events-none absolute inset-0 z-20"
          >
            {COUNCIL.map((p, i) => (
              <svg
                key={p.id}
                className="shard absolute left-0 top-0 h-[130px] w-[130px] text-[color:var(--ink-aurum)]"
                viewBox="0 0 120 210"
                aria-hidden="true"
                focusable="false"
                role="presentation"
              >
                <path
                  className="shard-path"
                  d={limbD}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={i % 2 ? 3 : 2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle cx="32" cy="54" r="3.4" fill="currentColor" />
              </svg>
            ))}
          </div>

          {/* ---- The Orchestrator ---- */}
          <div className="reveal-target relative z-10 mt-16 flex justify-center lg:mt-20">
            <article className="agents-hub panel panel-glow panel-topline bracketed w-full max-w-[560px] p-7 sm:p-9">
              <div className="flex flex-col items-center gap-6 text-center sm:flex-row sm:items-start sm:text-left">
                {/* Rendered inline rather than through the sprite so the staff
                    arm is an addressable element the summon beat can lift.
                    Aurum stays on the Zeus figure — the mythic thread. */}
                <div className="orchestrator-figure shrink-0">
                  <InlineFigure
                    id="orchestrator"
                    className="h-[190px] w-auto text-[color:var(--ink-aurum)] sm:h-[210px]"
                    strokeClass="orch-stroke"
                    jointClass="orch-joint"
                  />
                </div>
                <div>
                  {/* Was "ARCHETYPE / PRIMARY", which put the Orchestrator at
                      the top of the same menu as the four and read as a fifth
                      choice with seniority. It is not on the menu at all. */}
                  <span className="hud-label text-[color:var(--ink-aurum)]">
                    SYSTEM ROLE / NOT ASSIGNABLE
                  </span>
                  <h3 className="display-sm mt-3 text-2xl text-ink sm:text-[1.7rem]">
                    {ORCHESTRATOR.name}
                  </h3>
                  <p className="mt-1 font-mono text-[13px] text-[color:var(--ink-aurum)]">
                    {ORCHESTRATOR.role}
                  </p>
                  <p className="mt-4 font-mono text-[13.5px] leading-relaxed text-ink-dim">
                    {ORCHESTRATOR.note}
                  </p>
                </div>
              </div>
            </article>
          </div>

          {/* ---- The archetype palette ----

              Presented as a menu you choose from, not a cast that already
              exists. There is no backend behind this page, so nothing here
              pretends to be a real control: the affordance is typographic —
              a palette header, a slot number on every card, and the word
              ASSIGN rather than PROMOTED — which says "these are the options"
              without implying a click that would go nowhere. */}
          <div className="reveal-target mt-16 flex flex-wrap items-baseline gap-x-4 gap-y-2 border-t border-line pt-5">
            <span className="hud-label text-[color:var(--ink-aurum)]">
              ARCHETYPE PALETTE / 04 AVAILABLE
            </span>
            <p className="font-mono text-[12.5px] leading-relaxed text-ink-dim">
              One per promoted entity. Reusable across entities, and across
              runs.
            </p>
          </div>

          <ul
            aria-label="The four assignable archetypes"
            className="relative z-10 mt-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
          >
            {COUNCIL.map((p, i) => (
              <li key={p.id} className="persona-card reveal-target">
                <article className="panel panel-glow flex h-full flex-col p-6">
                  <div className="flex items-start justify-between gap-3">
                    {/* `InlineFigure`, not the `<use>` sprite: the idle loop
                        breathes the head circle and shimmers the joint dots,
                        and neither is reachable inside a <use> shadow tree.
                        The wrapper exists so the body sway and the talk beat's
                        `gesture()` write to different nodes. */}
                    <span className="persona-idle inline-block">
                      <InlineFigure
                        id={p.id}
                        className="persona-figure h-[136px] w-auto text-[color:var(--ink-aurum)]"
                        strokeClass="pf-stroke"
                        jointClass="pf-joint"
                      />
                    </span>
                    {/* Was "PROMOTED", which stated that this figure already
                        was an agent in some run. It is a slot on a menu. */}
                    <span className="hud-label whitespace-nowrap text-[color:var(--ink-ignis)]">
                      ASSIGN {String(i + 1).padStart(2, "0")}
                    </span>
                  </div>
                  <h3 className="display-sm mt-5 text-lg text-ink">{p.name}</h3>
                  <p className="mt-1 font-mono text-[12.5px] text-[color:var(--ink-aurum)]">
                    {p.role}
                  </p>
                  <p className="persona-note mt-3 font-mono text-[13px] leading-relaxed text-ink-dim">
                    {p.note}
                  </p>
                </article>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
