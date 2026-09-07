import { SEED_LINES } from "@/lib/content";
import { Orb } from "./Orb";

/** The seed sentence shown in the input card. */
const SEED_TEXT =
  "A board member forwards an email she was never meant to receive.";

/**
 * Pure markup now — a server component.
 *
 * v1 owned its own pin and its own character-collapse timeline. In v2 the
 * Seed and Graph sections are one continuous scroll journey driven by a
 * single master ScrollTrigger, so all the motion moved up into
 * `SeedJourney`, which wraps both. That also means neither of these two
 * sections needs `'use client'` any more; the only client leaves left down
 * here are `<Orb>` (it owns its idle rotation) and the journey controller
 * itself.
 *
 * The story lines are spaced a long way apart vertically at lg and up: that
 * vertical run is the runway the traveling seed sigil needs in order to
 * visibly descend past them one at a time. Below lg there is no traveling
 * sigil, so that runway would just be dead scroll and the lines close up.
 */
export function SeedSection() {
  return (
    <section
      id="seed"
      aria-labelledby="seed-heading"
      className="sec-seed relative pt-24 lg:pt-32"
    >
      <div
        aria-hidden="true"
        className="sec-wash"
        style={{ "--wash-x": "18%", "--wash-y": "12%" } as React.CSSProperties}
      />

      <div className="relative mx-auto w-full max-w-[1440px] px-6 sm:px-8 lg:px-14">
        <div className="max-w-[62ch]">
          <span className="stage-rule reveal-target mb-8" aria-hidden="true" />

          <h2
            id="seed-heading"
            className="seed-heading display-sm max-w-[17ch] text-[clamp(1.75rem,4.4vw,3rem)] text-ink"
          >
            It starts with{" "}
            <span className="grad-underline">one moment</span> you typed in
            yourself.
          </h2>

          <p className="seed-body mt-7 font-mono text-[15px] leading-relaxed text-ink-dim">
            Pantheon takes it as plain text and nothing else. If the moment is
            real, the engine pulls live web context around it before doing
            anything else. If you made it up, that step is skipped entirely and
            it reads only what you wrote.
          </p>
        </div>

        {/* ---- the seed as it was typed ---- */}
        <div className="seed-card-wrap reveal-target mt-12 max-w-[680px]">
          <article className="panel panel-glow bracketed p-6 sm:p-8">
            <span className="hud-label text-[color:var(--ink-ignis)]">
              SEED / INPUT
            </span>
            <p className="display-sm mt-4 text-[clamp(1.15rem,2.6vw,1.6rem)] text-ink">
              {SEED_TEXT}
            </p>
            <p className="mt-6 font-mono text-[12px] text-ink-dim">
              <span className="text-[color:var(--ink-ignis)]">mode</span>{" "}
              fictional
              <span
                aria-hidden="true"
                className="mx-3 inline-block h-3 w-px translate-y-[2px] bg-[color:var(--line-strong)]"
              />
              <span className="text-[color:var(--ink-ignis)]">
                context fetch
              </span>{" "}
              skipped
              <span
                aria-hidden="true"
                className="mx-3 inline-block h-3 w-px translate-y-[2px] bg-[color:var(--line-strong)]"
              />
              <span className="text-[color:var(--ink-ignis)]">next</span>{" "}
              extraction
            </p>
          </article>
        </div>

        {/* ---- the run the sigil travels down ---- */}
        <div className="relative mt-20 grid gap-0 lg:mt-28 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)]">
          <ol className="seed-lines">
            {SEED_LINES.map((line) => (
              <li
                key={line}
                className="seed-line flex min-h-[17vh] items-center lg:min-h-[46vh]"
              >
                <span className="display-sm block text-[clamp(1.6rem,5.2vw,3.2rem)] text-ink">
                  {line}
                </span>
              </li>
            ))}
          </ol>

          {/*
            The non-traveling sigil. This is what shows on narrow viewports
            and under reduced motion, where the fixed-follow mechanic is
            switched off. On wide viewports with motion allowed the journey
            controller hides it and the fixed flyer takes over.
          */}
          <div
            aria-hidden="true"
            className="seed-inline-orb pointer-events-none sticky top-[40vh] hidden h-0 justify-center self-start lg:flex"
          >
            <Orb uid="seed-inline" className="h-auto w-[min(26vw,300px)]" />
          </div>

          <div
            aria-hidden="true"
            className="seed-inline-orb-sm pointer-events-none absolute inset-x-0 top-1/2 -z-10 flex -translate-y-1/2 justify-center opacity-25 lg:hidden"
          >
            <Orb uid="seed-inline-sm" className="h-auto w-[min(70vw,320px)]" />
          </div>
        </div>
      </div>
    </section>
  );
}
