"use client";

import { useEffect, useRef } from "react";
import { gsap, MOTION_QUERIES } from "@/lib/gsap";
import { baseReveal } from "@/lib/reveal";
import { bodyLineReveal, countIn, swoosh } from "@/lib/textAnim";
import { PIPELINE } from "@/lib/content";
import { spectrumAt } from "@/lib/spectrum";
import { CubeMark } from "./CubeFigure";

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
 * Tone: this is the only place (with the footer) that uses the ramp in
 * `lib/spectrum.ts`, one slice of it per card. It used to be four hues, one
 * per section, so the row read as the page's colour legend passing by in
 * order; it is now a grey ramp climbing toward white, so the row reads as the
 * pipeline brightening as it runs to its end. Same device, and it says
 * something truer about the seven steps than the legend did.
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
        const heading = s.querySelector<HTMLElement>(".recap-heading");
        if (heading) cleanups.push(swoosh(heading, s));
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
      className="sec-recap sec-open relative py-24 lg:py-32"
    >
      {/* The one section that never had a wash, which is why the run from
          Chat through Recap into the FAQ used to read colour, black, colour.
          Its pair sits at the light end of the ramp, close to the top of the
          step cards' own range, so the section and the row inside it read as
          one tonal block rather than as a row of cards floating on unrelated
          ground. */}
      <div
        aria-hidden="true"
        className="sec-wash"
        style={{ "--wash-x": "72%", "--wash-y": "34%" } as React.CSSProperties}
      />

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
              className="recap-heading display-sm max-w-[16ch] text-[clamp(1.6rem,3.6vw,2.5rem)] text-ink"
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
                  {/* THE LINEAGE, on the step it actually names. Step 01 is
                      "Seed", so the mark belongs on this card and nowhere else
                      in the row — putting one on all seven would make it a
                      bullet rather than a throughline.

                      It draws in its own light-to-mid grey ramp rather than in
                      this card's `--ga`, which is the ramp's dimmest step. The
                      lineage holds the top of the value scale wherever it
                      appears; that is what has replaced it holding one hue
                      wherever it appeared. */}
                  {i === 0 && (
                    <CubeMark
                      uid="recap"
                      className="h-[16px] w-[16px] shrink-0 translate-y-[2px]"
                    />
                  )}
                  {/* The numeral is real text at 7.3:1 on the panel rather
                      than small type dropped onto a saturated fill. The rule
                      survives the retheme: two of the Spectrum stops still
                      fall under 4.5:1 on black, so nothing small ever sits on
                      top of one. */}
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
