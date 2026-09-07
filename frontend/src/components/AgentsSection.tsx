"use client";

import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger, MOTION_QUERIES } from "@/lib/gsap";
import { baseReveal } from "@/lib/reveal";
import { assemble, bodyLineReveal, gesture, typeChars } from "@/lib/textAnim";
import { PERSONAS } from "@/lib/content";
import { FIGURES } from "@/lib/figures";
import { Figure, InlineFigure } from "./WireframeFigures";

const [ORCHESTRATOR, ...COUNCIL] = PERSONAS;

/**
 * Client feedback #6 — the Orchestrator splits to create the four personas,
 * then they talk.
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
 * TALK BEAT. Once hatched, each persona's card animates as it comes into
 * focus: the figure leans and bobs while its description types on
 * character-by-character, reusing the Simulation section's typing pattern.
 *
 * Both are gated behind `gsap.matchMedia()`. Under reduced motion no shard is
 * ever created (the layer is `display: none` in CSS), the personas are simply
 * present, and the text is simply text.
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
        // The staff is a real stroke in the Orchestrator's own geometry;
        // `InlineFigure` stamps each stroke with its index so it can be
        // addressed without hardcoding a magic number here.
        const staffIdx = FIGURES.orchestrator.strokes.indexOf("M98 14 L98 196");
        const staff = orch?.querySelector<SVGElement>(
          `[data-stroke="${staffIdx}"]`,
        );
        const staffOrb = orch?.querySelector<SVGElement>(".orch-joint");

        // ---------------- reduced motion ----------------
        if (reduced) {
          gsap.set([figures, notes], { opacity: 1, scale: 1, x: 0, y: 0 });
          return;
        }

        const cleanups: (() => void)[] = [];
        if (heading) cleanups.push(assemble(heading, s));
        cleanups.push(bodyLineReveal(body, s));

        // ---------------- mitosis ----------------
        if (layer && orch && shards.length === COUNCIL.length) {
          gsap.set(figures, { opacity: 0, scale: 0.45, transformOrigin: "50% 100%" });
          gsap.set(shards, { opacity: 0, xPercent: -50, yPercent: -50 });

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
        } else {
          // No layer measured (shouldn't happen, but never leave the cast
          // invisible if it does).
          gsap.set(figures, { opacity: 1, scale: 1 });
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
      className="sec-agents relative overflow-hidden py-24 lg:py-36"
    >
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
              className="agents-heading display-sm max-w-[14ch] text-[clamp(1.75rem,4.4vw,3rem)] text-ink"
            >
              You decide which of them wake up.
            </h2>
          </div>

          <div className="max-w-[58ch] lg:pt-2">
            <p className="agents-body font-mono text-[15px] leading-relaxed text-ink-dim">
              Extraction produces candidates, not agents. Promotion is a manual
              gate the engine will not walk through on its own: a human reviews
              what the graph found and picks the entities worth simulating.
            </p>
            <p className="agents-body mt-5 font-mono text-[15px] leading-relaxed text-ink-dim">
              Each promoted entity becomes fully autonomous, with its own
              persona, its own private memory, and its own scoped view of the
              shared graph and document store. Everything you leave alone stays
              a node: still in Neo4j, still queryable, just not talking.
            </p>
          </div>
        </div>

        {/* The mitosis layer spans the Orchestrator and the whole council row
            so shard coordinates can be measured in one space. */}
        <div className="relative">
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
          <div className="reveal-target mt-16 flex justify-center lg:mt-20">
            <article className="panel panel-glow panel-topline bracketed w-full max-w-[560px] p-7 sm:p-9">
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
                  <span className="hud-label text-[color:var(--ink-aurum)]">
                    ARCHETYPE / PRIMARY
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

          {/* ---- The promoted council ---- */}
          <ul className="mt-12 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {COUNCIL.map((p) => (
              <li key={p.id} className="persona-card reveal-target">
                <article className="panel panel-glow flex h-full flex-col p-6">
                  <div className="flex items-start justify-between gap-3">
                    <Figure
                      id={p.id}
                      className="persona-figure h-[136px] w-auto text-[color:var(--ink-aurum)]"
                    />
                    <span className="hud-label whitespace-nowrap text-[color:var(--ink-ignis)]">
                      PROMOTED
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
