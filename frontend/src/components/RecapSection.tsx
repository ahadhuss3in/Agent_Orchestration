"use client";

import { useEffect, useRef } from "react";
import { gsap, MOTION_QUERIES } from "@/lib/gsap";
import { baseReveal } from "@/lib/reveal";
import { bodyLineReveal, countIn } from "@/lib/textAnim";
import { PIPELINE } from "@/lib/content";
import { spectrumAt } from "@/lib/spectrum";

/**
 * The accessible spine of the page.
 *
 * Every stage of the pipeline is a plain numbered list item with its own
 * sentence of prose. With every animation on this page stripped, or with CSS
 * off entirely, this section alone still explains the whole product end to
 * end.
 *
 * Feedback #4: each step's numeral counts up and its label types on in
 * sequence across the row as the section enters. The numerals are restored to
 * their literal final text on cleanup, so a reverted context never leaves a
 * half-counted number on screen.
 *
 * Colour: this is the only place (with the footer) that uses the Spectrum
 * sweep, one slice of it per card, so the row reads as the whole pipeline
 * passing through every section's identity in order.
 */
export function RecapSection() {
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
        if (reduced) return;

        const body = Array.from(s.querySelectorAll<HTMLElement>(".recap-body"));
        const steps = Array.from(
          s.querySelectorAll<HTMLElement>(".recap-step"),
        ).map((el) => ({
          numeral: el.querySelector<HTMLElement>(".recap-num")!,
          label: el.querySelector<HTMLElement>(".recap-label"),
        }));

        const cleanups: (() => void)[] = [];
        cleanups.push(bodyLineReveal(body, s));
        cleanups.push(countIn(steps.filter((x) => x.numeral), s));
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

  const last = PIPELINE.length - 1;

  return (
    <section
      id="recap"
      ref={root}
      aria-labelledby="recap-heading"
      className="sec-recap relative overflow-hidden border-t border-line py-24 lg:py-32"
    >
      <div className="relative mx-auto w-full max-w-[1440px] px-6 sm:px-8 lg:px-14">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-end lg:gap-16">
          <div>
            <span
              className="reveal-target mb-8 block h-1 w-[120px] rounded-sm"
              aria-hidden="true"
              style={{ background: "var(--grad-recap)" }}
            />

            <h2
              id="recap-heading"
              className="reveal-target display-sm max-w-[16ch] text-[clamp(1.6rem,3.6vw,2.5rem)] text-ink"
            >
              The whole pipeline, seed to conversation.
            </h2>
          </div>

          <p className="recap-body max-w-[58ch] font-mono text-[14px] leading-relaxed text-ink-dim">
            Seven steps, always in this order. Step two is skipped for fictional
            seeds and step five never runs without a human. Everything on this
            page is one of these seven boxes.
          </p>
        </div>

        <ol className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-7">
          {PIPELINE.map((step, i) => {
            const a = spectrumAt(i / last);
            const b = spectrumAt(Math.min(1, (i + 0.85) / last));
            return (
              <li
                key={step.n}
                className="recap-step reveal-target panel panel-topline flex flex-col gap-3 p-5"
                style={{ "--ga": a, "--gb": b } as React.CSSProperties}
              >
                <div className="flex items-baseline gap-3">
                  {/* The numeral is real text at 6.7:1 rather than small type
                      dropped onto a saturated fill — none of the vivid
                      gradient stops clear 4.5:1 on white, so nothing small
                      ever sits on top of one. */}
                  <span
                    className="recap-num font-mono text-[15px] font-medium tabular-nums text-ink-dim"
                    aria-hidden="true"
                  >
                    {step.n}
                  </span>
                  <h3 className="display-sm text-[15px] text-ink">
                    <span className="sr-only">Step {Number(step.n)}: </span>
                    <span className="recap-label">{step.name}</span>
                  </h3>
                </div>
                <p className="font-mono text-[12.5px] leading-relaxed text-ink-dim">
                  {step.body}
                </p>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}
