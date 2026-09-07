"use client";

import { useEffect, useRef } from "react";
import { gsap, MOTION_QUERIES } from "@/lib/gsap";
import { baseReveal } from "@/lib/reveal";
import { blurFocus, bodyLineReveal } from "@/lib/textAnim";
import { useInViewClass } from "@/lib/useInViewClass";
import { CHAT_MOCK } from "@/lib/content";
import { Figure } from "./WireframeFigures";

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
        if (heading) cleanups.push(blurFocus(heading, s));
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
      className="sec-chat relative overflow-hidden py-24 lg:py-36"
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
              said and everything it retrieved during the run still in memory.
            </p>

            <p className="chat-body mt-5 max-w-[56ch] font-mono text-[15px] leading-relaxed text-ink-dim">
              Same persona, same scoped knowledge that was in play during the
              rounds. So you can interrogate a decision the agent actually made
              instead of guessing at why it made it.
            </p>
          </div>

          <div className="reveal-target">
            <div className="panel panel-glow panel-topline bracketed p-5 sm:p-7">
              {/* panel header */}
              <div className="flex items-center gap-4 border-b border-line pb-4">
                <Figure
                  id="skeptic"
                  className="h-[68px] w-auto shrink-0 text-[color:var(--ink-wire)]"
                />
                <div className="min-w-0">
                  <p className="display-sm text-base text-ink">The Skeptic</p>
                  <p className="hud-label mt-1.5 text-ink-dim">POST-RUN SESSION</p>
                </div>
                <span className="hud-label ml-auto shrink-0 text-[color:var(--ink-wire)]">
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
                        m.from === "operator"
                          ? "border-line"
                          : "border-[color:rgba(26,82,214,0.35)]",
                      ].join(" ")}
                    >
                      <span
                        className={[
                          "hud-label",
                          m.from === "operator"
                            ? "text-ink-dim"
                            : "text-[color:var(--ink-wire)]",
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
                <span className="caret ambient ml-auto inline-block h-4 w-[7px] bg-[color:var(--ink-wire)]" />
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
