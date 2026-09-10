"use client";

import { useEffect, useRef } from "react";
import { gsap, MOTION_QUERIES } from "@/lib/gsap";
import { baseReveal } from "@/lib/reveal";
import { bodyLineReveal, swoosh } from "@/lib/textAnim";
import { useInViewClass } from "@/lib/useInViewClass";
import { CHAT_MOCK } from "@/lib/content";
import { ARCHETYPE_TONE } from "@/lib/cubes";
import { CubeFigure, CubeMark } from "./CubeFigure";

/**
 * Not pinned. A static, clearly-labelled mock of the post-simulation 1:1
 * chat. Nothing here is interactive — there is no input to type into and no
 * request behind it.
 *
 * Feedback #4: the headline resolves out of a blur, which is the section's
 * own idea — an agent coming back into focus after the run ended.
 */
export function ChatSection() {
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
        if (reduced) return;

        const heading = s.querySelector<HTMLElement>(".chat-heading");
        const body = Array.from(s.querySelectorAll<HTMLElement>(".chat-body"));

        const cleanups: (() => void)[] = [];
        if (heading) cleanups.push(swoosh(heading, s));
        cleanups.push(bodyLineReveal(body, s));
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

  return (
    <section
      id="chat"
      ref={root}
      aria-labelledby="chat-heading"
      className="sec-chat sec-open relative py-24 lg:py-36"
    >
      <div
        aria-hidden="true"
        className="sec-wash"
        style={{ "--wash-x": "82%", "--wash-y": "30%" } as React.CSSProperties}
      />

      <div className="relative mx-auto w-full max-w-[1440px] px-6 sm:px-8 lg:px-14">
        <div className="grid items-center gap-14 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-16">
          <div>
            <span className="stage-rule reveal-target mb-8" aria-hidden="true" />

            <h2
              id="chat-heading"
              className="chat-heading display-sm max-w-[18ch] text-[clamp(1.75rem,4.4vw,3rem)] text-ink"
            >
              When it ends, ask any of them what they were thinking.
            </h2>

            <p className="chat-body mt-7 max-w-[56ch] font-mono text-[15px] leading-relaxed text-ink-dim">
              The simulation stops, the transcript stays. Open a direct 1:1 chat
              with any agent and it answers in character, with everything it
              said and everything it drew on during the run still in memory.
            </p>

            <p className="chat-body mt-5 max-w-[56ch] font-mono text-[15px] leading-relaxed text-ink-dim">
              Same persona, same slice of the graph that was in play during the
              rounds. So you can interrogate a decision the agent actually made
              instead of guessing at why it made it.
            </p>
          </div>

          <div className="reveal-target">
            <div className="panel panel-glow panel-topline bracketed p-5 sm:p-7">
              {/* panel header */}
              <div className="flex items-center gap-4 border-b border-line pb-4">
                {/* THE LINEAGE, fourth beat.

                    The avatar stays the same line-art figure in the same Wire
                    blue this section owns — what changes is that it is
                    visibly carrying the seed. The core sits at (55, 80) in the
                    Skeptic's own viewBox, which is the middle of the torso
                    stroke `M55 58 L55 124`, so it reads as inside the figure
                    rather than pinned on top of it: 50% across, 38% down.

                    Same object as the gem in the traveling sigil and the mark
                    on the Orchestrator's staff, at the size this panel can
                    carry. The point of the section is that the agent you are
                    talking to is the one that ran the rounds; the point of the
                    mark is that it goes all the way back to the sentence you
                    typed. No ring at this size — the dashes fill in. */}
                <span className="relative inline-block shrink-0">
                  {/* The Skeptic's own step off the shared tone ramp, not the
                      section accent. It is the same agent that spoke in the
                      Simulation transcript and the same one a node can be
                      promoted into three sections earlier, so it has to be the
                      same brightness in all three places — that consistency is
                      what the archetype ramp is FOR now that there is no hue
                      to carry it. */}
                  <CubeFigure
                    id="skeptic"
                    tone={ARCHETYPE_TONE.skeptic}
                    className="h-[72px] w-auto"
                  />
                  <span
                    aria-hidden="true"
                    className="absolute left-1/2 top-[38%] block w-[15px] -translate-x-1/2 -translate-y-1/2"
                  >
                    <CubeMark uid="chat" className="h-auto w-full" />
                  </span>
                </span>
                <div className="min-w-0">
                  <p className="display-sm text-base text-ink">The Skeptic</p>
                  <p className="hud-label mt-1.5 text-ink-dim">POST-RUN SESSION</p>
                </div>
                <span className="hud-label ml-auto shrink-0 text-[color:var(--ink-accent)]">
                  IN CHARACTER
                </span>
              </div>

              {/* transcript */}
              <ol className="mt-5 space-y-4">
                {CHAT_MOCK.map((m, i) => (
                  <li
                    key={i}
                    className={
                      m.from === "operator" ? "flex justify-end" : "flex justify-start"
                    }
                  >
                    <div
                      className={[
                        "max-w-[85%] rounded-sm border bg-paper p-3.5",
                        // The agent's turn gets the brighter border, the
                        // operator's the default hairline. Same brightness
                        // step the Simulation transcript uses for a live turn,
                        // and it is doing the same job: saying which side of
                        // the exchange this bubble is, without a second hue
                        // and without relying on the left/right alignment
                        // alone.
                        m.from === "operator"
                          ? "border-line"
                          : "border-[color:var(--line-strong)]",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "hud-label",
                          m.from === "operator"
                            ? "text-ink-dim"
                            : "text-[color:var(--ink-accent)]",
                        ].join(" ")}
                      >
                        {m.from === "operator" ? "OPERATOR" : "THE SKEPTIC"}
                      </span>
                      <p className="mt-2 font-mono text-[13.5px] leading-relaxed text-ink">
                        {m.text}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              {/* Non-interactive composer. Deliberately a div, not an input:
                  there is nothing behind it and a real field would imply
                  otherwise. */}
              <div
                aria-hidden="true"
                className="mt-6 flex items-center gap-3 rounded-sm border border-line px-4 py-3"
              >
                <span className="font-mono text-[13px] text-ink-dim">
                  Ask The Skeptic something
                </span>
                <span className="caret ambient ml-auto inline-block h-4 w-[7px] bg-[color:var(--ink-accent)]" />
              </div>

              <p className="mt-3 font-mono text-[11px] text-ink-dim">
                Static example. This panel is a mock-up, not a live chat.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
