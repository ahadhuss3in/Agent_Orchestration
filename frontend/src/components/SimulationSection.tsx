"use client";

import { useEffect, useRef } from "react";
import { gsap, MOTION_QUERIES } from "@/lib/gsap";
import { baseReveal } from "@/lib/reveal";
import { bodyLineReveal, typeOn } from "@/lib/textAnim";
import { useInViewClass } from "@/lib/useInViewClass";
import { SIM_LINES } from "@/lib/content";
import { Figure } from "./WireframeFigures";

/**
 * Cool turns take the Signal blue, warm turns the Pulse green — both read on
 * white and neither is anywhere near the banned violet band.
 */
const ACCENT = {
  cool: "var(--ink-signal)",
  warm: "var(--ink-pulse)",
} as const;

const BORDER = {
  cool: "rgba(14,109,158,0.5)",
  warm: "rgba(5,107,74,0.5)",
} as const;

/**
 * The page's one pinned section.
 *
 * The stage — not the whole section — is the pin trigger, so the explanatory
 * copy scrolls normally and only the transcript is held. That keeps a
 * full-viewport pin viable at 375px, where a pinned section carrying both the
 * copy and five speech turns would overflow.
 *
 * Feedback #4: the headline types on character-by-character behind a caret
 * that chases it, matching the turn-based terminal this section already
 * contains. Characters are revealed by opacity rather than by rewriting
 * textContent, so the heading keeps its real text in the DOM throughout —
 * it is the target of this section's `aria-labelledby`, and emptying it would
 * strip the section's accessible name mid-animation.
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
        const caret = s.querySelector<HTMLElement>(".sim-heading-caret");
        const body = Array.from(s.querySelectorAll<HTMLElement>(".sim-body"));
        if (!stage || rows.length === 0) return;

        // Reduced motion: the whole exchange is simply legible, all at once.
        if (reduced) {
          gsap.set(rows, { opacity: 1, y: 0 });
          gsap.set(cursors.filter(Boolean), { opacity: 0 });
          if (caret) gsap.set(caret, { opacity: 0 });
          return;
        }

        const cleanups: (() => void)[] = [];
        if (heading) cleanups.push(typeOn(heading, caret, s));
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
          tl.to(row, { borderColor: BORDER[SIM_LINES[i].accent], duration: 0.4 }, at);

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
              </h2>
              <span
                aria-hidden="true"
                className="sim-heading-caret pointer-events-none absolute left-0 top-0 w-[3px] bg-[color:var(--ink-pulse)]"
                style={{ height: "1em" }}
              />
            </div>
          </div>

          <div className="max-w-[58ch] lg:pt-2">
            <p className="sim-body font-mono text-[15px] leading-relaxed text-ink-dim">
              Every round, each agent retrieves what it is allowed to know: its
              own private notes plus whatever the shared graph and document
              store will hand it. Then it reads what the others said in the
              previous round and answers in character.
            </p>

            <p className="sim-body mt-5 font-mono text-[15px] leading-relaxed text-ink-dim">
              A rolling summary compresses everything older than the current
              window, so round forty costs about the same context as round four.
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
              <span className="hud-label flex items-center gap-2 text-ink-dim">
                <span
                  aria-hidden="true"
                  className="live-dot ambient inline-block h-1.5 w-1.5 rounded-full"
                  style={{ background: "var(--grad-sim-a)" }}
                />
                SIMULATION LOOP / EXAMPLE
              </span>
              <span
                className="sim-round hud-label text-[color:var(--ink-pulse)]"
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
                  <Figure
                    id={l.figure}
                    className="h-16 w-auto shrink-0 sm:h-[76px]"
                    style={{ color: ACCENT[l.accent] }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="hud-label" style={{ color: ACCENT[l.accent] }}>
                        {l.speaker.replace(/^The /, "").toUpperCase()}
                      </span>
                      <span
                        aria-hidden="true"
                        className="sim-cursor live-dot ambient inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                        style={{ background: "var(--grad-sim-a)" }}
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
              <span className="text-[color:var(--ink-pulse)]">
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
