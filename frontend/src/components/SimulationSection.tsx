"use client";

import { useEffect, useRef } from "react";
import { gsap, MOTION_QUERIES } from "@/lib/gsap";
import { baseReveal } from "@/lib/reveal";
import { bodyLineReveal, swoosh } from "@/lib/textAnim";
import { useInViewClass } from "@/lib/useInViewClass";
import { SIM_LINES } from "@/lib/content";
import { ARCHETYPE_TONE } from "@/lib/cubes";
import { CubeFigure } from "./CubeFigure";

/**
 * WHAT REPLACED THE COOL/WARM SPLIT.
 *
 * Turns used to alternate between Signal blue and Pulse green — figure tone,
 * speaker label and row border all three. On a monochrome page that split has
 * nothing to say, and it is worth being honest that it never had much: warm
 * and cool did not correspond to anything about the speakers, it was texture.
 *
 * Two real signals take over, and both were already present:
 *
 *   WHO IS SPEAKING   the row's `CubeFigure` is that archetype's own authored
 *                     cluster — a climbing stair, an off-true block, a closed
 *                     square, six cells touching nothing — now toned from the
 *                     same `ARCHETYPE_TONE` ramp the Agents cards and the
 *                     promotable graph nodes use. So the Skeptic is the same
 *                     shape and the same brightness in all three places, which
 *                     the two-hue alternation actively prevented.
 *   WHICH TURN IS LIVE  the row border BRIGHTENS as its turn arrives, from the
 *                     default hairline to --line-strong. That is the one
 *                     genuinely stateful thing in this transcript and it now
 *                     has the contrast step to itself instead of sharing it
 *                     with an alternation that meant nothing.
 *
 * `SIM_LINES[i].accent` is left in `content.ts` and no longer read here. It is
 * content data rather than presentation, and it costs nothing to leave for
 * whatever a later pass might want a warm/cool distinction FOR.
 */
const ROW_LIVE_BORDER = "rgba(245,245,245,0.38)";

/**
 * The page's one pinned section.
 *
 * The stage — not the whole section — is the pin trigger, so the explanatory
 * copy scrolls normally and only the transcript is held. That keeps a
 * full-viewport pin viable at 375px, where a pinned section carrying both the
 * copy and five speech turns would overflow.
 *
 * The headline enters with `swoosh`, the page-wide signature move, like every
 * other section headline. It used to type on character-by-character behind a
 * chasing caret; that was a good fit for this section specifically and a bad
 * fit for the page, which had five different headline entrances and therefore
 * no entrance of its own. The caret survives the change as a trailing
 * inline-block inside the heading, so the terminal texture this section wants
 * is still there and it arrives on the same line as the words.
 */
export function SimulationSection() {
  const root = useRef<HTMLElement>(null);
  useInViewClass(root);

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

        const stage = s.querySelector<HTMLElement>(".sim-stage");
        const rows = Array.from(s.querySelectorAll<HTMLElement>(".sim-row"));
        const cursors = rows.map((r) => r.querySelector<HTMLElement>(".sim-cursor"));
        const round = s.querySelector<HTMLElement>(".sim-round");
        const heading = s.querySelector<HTMLElement>(".sim-heading");
        const body = Array.from(s.querySelectorAll<HTMLElement>(".sim-body"));
        if (!stage || rows.length === 0) return;

        // Reduced motion: the whole exchange is simply legible, all at once.
        if (reduced) {
          gsap.set(rows, { opacity: 1, y: 0 });
          gsap.set(cursors.filter(Boolean), { opacity: 0 });
          return;
        }

        const cleanups: (() => void)[] = [];
        if (heading) cleanups.push(swoosh(heading, s));
        cleanups.push(bodyLineReveal(body, s));

        gsap.set(rows, { opacity: 0.18, y: 16 });
        gsap.set(cursors.filter(Boolean), { opacity: 0 });

        const step = 1;
        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: stage,
            start: "top top",
            end: "+=210%",
            pin: true,
            pinSpacing: true,
            scrub: 1,
            anticipatePin: 1,
            invalidateOnRefresh: true,
          },
        });

        rows.forEach((row, i) => {
          const at = 0.4 + i * step;
          tl.to(row, { opacity: 1, y: 0, duration: 0.55, ease: "power2.out" }, at);
          tl.to(row, { borderColor: ROW_LIVE_BORDER, duration: 0.4 }, at);

          const cursor = cursors[i];
          if (cursor) {
            tl.to(cursor, { opacity: 1, duration: 0.2 }, at);
            const prev = cursors[i - 1];
            if (prev) tl.to(prev, { opacity: 0, duration: 0.2 }, at);
          }

          if (round) {
            tl.call(
              () => {
                round.textContent = `TURN ${String(i + 1).padStart(2, "0")}`;
              },
              undefined,
              at,
            );
          }
        });

        // hold the last frame so the closing line is readable at rest
        tl.to({}, { duration: 0.6 });

        return () => {
          tl.kill();
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
    <section
      id="simulation"
      ref={root}
      aria-labelledby="simulation-heading"
      className="sec-sim relative py-24 lg:py-32"
    >
      <div
        aria-hidden="true"
        className="sec-wash"
        style={{ "--wash-x": "16%", "--wash-y": "18%" } as React.CSSProperties}
      />

      <div className="relative mx-auto w-full max-w-[1440px] px-6 sm:px-8 lg:px-14">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-16">
          <div>
            <span className="stage-rule reveal-target mb-8" aria-hidden="true" />

            <div className="relative">
              <h2
                id="simulation-heading"
                className="sim-heading display-sm max-w-[14ch] text-[clamp(1.75rem,4.4vw,3rem)] text-ink"
              >
                Then they run rounds without you.
                {/* THE CARET IS INSIDE THE HEADING NOW, not absolutely
                    positioned beside it.

                    v5 chased it across the words with `typeOn`, which the
                    signature `swoosh` entrance replaced. A caret that has
                    nothing to chase has to be somewhere, and the only honest
                    place is the end of the sentence — so it is a trailing
                    inline-block, which means SplitText folds it into the last
                    line and it swooshes in ON that line rather than being a
                    separate element that has to be told where to land. The
                    blink is pure CSS and is switched off under reduced motion
                    by the global `prefers-reduced-motion` block, so this needs
                    no JS branch at all. */}
                <span
                  aria-hidden="true"
                  className="caret ml-[0.12em] inline-block h-[0.86em] w-[3px] translate-y-[0.04em] bg-[color:var(--ink-accent)] align-baseline"
                />
              </h2>
            </div>
          </div>

          <div className="max-w-[58ch] lg:pt-2">
            <p className="sim-body font-mono text-[15px] leading-relaxed text-ink-dim">
              Every round, each agent retrieves what it is allowed to know: its
              own private notes plus whatever the shared graph and the records
              behind it will hand it. Then it reads what the others said in the
              previous round and answers in character.
            </p>

            <p className="sim-body mt-5 font-mono text-[15px] leading-relaxed text-ink-dim">
              A rolling summary compresses everything older than the last few
              rounds, so an agent in round forty carries about as much of the
              conversation as one in round four.
              The exchange below is illustrative, written to show one agent
              picking up what another just said.
            </p>
          </div>
        </div>
      </div>

      {/* ---- pinned stage ---- */}
      <div className="sim-stage relative mt-14 flex min-h-dvh items-center overflow-hidden py-14 lg:mt-20">
        <div className="mx-auto w-full max-w-[1440px] px-6 sm:px-8 lg:px-14">
          <div className="mx-auto w-full max-w-[860px]">
            <div className="mb-5 flex items-center justify-between gap-4 border-b border-line pb-3">
              {/* THE LINEAGE, third beat. This dot used to be Pulse green
                  like everything else in this section, which made it read as
                  one more piece of section furniture. It is the thing that
                  says a turn is live, and what is taking those turns came out
                  of the seed — so it wears Ignition and pulses in Ignition,
                  the same pair as the sigil's gem and the mark on the
                  Orchestrator's staff. The section keeps its own colour
                  everywhere else; this is the one point of continuity in it. */}
              <span className="hud-label flex items-center gap-2 text-ink-dim">
                <span
                  aria-hidden="true"
                  className="lineage-dot live-dot ambient inline-block h-1.5 w-1.5 rounded-full"
                />
                SIMULATION LOOP / EXAMPLE
              </span>
              <span
                className="sim-round hud-label text-[color:var(--ink-accent)]"
                aria-hidden="true"
              >
                TURN 01
              </span>
            </div>

            <ol className="space-y-3">
              {SIM_LINES.map((l, i) => (
                <li
                  key={l.speaker}
                  className="sim-row panel flex items-start gap-4 p-4 sm:gap-5 sm:p-5"
                >
                  <CubeFigure
                    id={l.figure}
                    className="h-16 w-auto shrink-0 sm:h-[76px]"
                    tone={ARCHETYPE_TONE[l.figure]}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="hud-label text-[color:var(--ink-accent)]">
                        {l.speaker.replace(/^The /, "").toUpperCase()}
                      </span>
                      {/* Same mark, per speaking turn: the agent currently
                          holding the floor is carrying the seed. */}
                      <span
                        aria-hidden="true"
                        className="sim-cursor lineage-dot live-dot ambient inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                      />
                      <span className="hud-label ml-auto text-ink-dim tabular-nums">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>
                    <p className="mt-2.5 font-mono text-[13.5px] leading-relaxed text-ink sm:text-[14.5px]">
                      {l.line}
                    </p>
                  </div>
                </li>
              ))}
            </ol>

            <p className="mt-5 font-mono text-[12px] text-ink-dim">
              <span className="text-[color:var(--ink-accent)]">
                rolling summary:
              </span>{" "}
              turns older than the current window are compressed into a single
              carried-forward brief, which is what keeps context bounded no
              matter how long the run goes.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
