"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap, SplitText, ScrollTrigger, MOTION_QUERIES } from "@/lib/gsap";
import { CubeSigil } from "./CubeSigil";

const CHIPS = [
  "Living knowledge graph",
  "Human-in-the-loop promotion",
  "Rounds that stay bounded",
];

/**
 * The load-in, v5.
 *
 * WHAT CHANGED FROM v4: the tagline and the wordmark used to sit under
 * `mix-blend-mode: difference` so they inverted against the engraving's
 * linework as they crossed it. Read back on the real bust — which carries a
 * lot of fine detail — that made the type genuinely hard to read, which is
 * the opposite of what a headline is for. Both now sit flatly above the
 * plate: solid white, a soft dark halo (`text-shadow` in `.intro-word`)
 * standing in for the contrast a blend mode used to provide. The "drift and
 * settle" beat v4 had between the tagline's entrance and its exit existed
 * specifically to walk that inversion boundary across the linework — with
 * no blend mode left to sell, it no longer does anything, so it is gone; the
 * tagline now goes straight from arriving to parting.
 *
 * Sequence, over the same black-stage-plus-engraving backdrop as before:
 *   1. The plate fades up centred, `object-fit: contain`, with its own
 *      continuous Ken-Burns drift (unchanged since v3).
 *   2. "SIMULATE" rises in first, then "ANY REALITY" joins it — two
 *      `.intro-half` elements, held briefly once both are in.
 *   3. They part: SIMULATE continues left off the stage, ANY REALITY
 *      continues right, both fading as they go — the "part from the middle"
 *      the brief asked for.
 *   4. PANTHEON — a separate element, not a rebuild of the halves — rises up
 *      from below into the space the tagline just vacated, at the giant size
 *      the wordmark has always used in the intro.
 *   5. PANTHEON condenses into the real <h1>, the same manual
 *      measure-and-drive-down trick v3 used (Flip has nothing to match here:
 *      the giant word and the <h1> are different elements with different
 *      text), aimed at one element instead of two halves.
 *
 * Entirely absent under prefers-reduced-motion (the overlay is
 * `display: none` in CSS, and no timeline is built) — that is the only way
 * to bypass it, there is no skip button.
 */
export function Hero() {
  const root = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;

    let mm: ReturnType<typeof gsap.matchMedia> | null = null;
    let cancelled = false;
    let unlock: (() => void) | null = null;

    const setup = () => {
      if (cancelled || !root.current) return;
      const scope = root.current;

      mm = gsap.matchMedia();

      mm.add(MOTION_QUERIES, (ctx) => {
        // Reduced motion: no intro at all. The markup's default is already
        // the finished hero, so this branch only clears the pre-paint class.
        if (ctx.conditions?.reduced) {
          document.documentElement.classList.remove("js-motion");
          return;
        }

        const overlay = scope.querySelector<HTMLElement>(".intro-overlay");
        const block = scope.querySelector<HTMLElement>(".hero-block");
        const headline = scope.querySelector<HTMLElement>(".hero-headline");
        const orb = scope.querySelector<SVGElement>(".hero-orb");
        const halves = Array.from(
          scope.querySelectorAll<HTMLElement>(".intro-half"),
        );
        const pantheon = scope.querySelector<HTMLElement>(".intro-panth");
        const bust = scope.querySelector<HTMLElement>(".intro-bust");
        const fades = Array.from(
          scope.querySelectorAll<HTMLElement>(".hero-fade"),
        );
        if (!overlay || !block || !headline || !halves.length || !pantheon)
          return;

        // Splitting after fonts settle: Sora's metrics differ enough from the
        // system fallback that character boxes measured early jump on swap.
        const heroSplit = SplitText.create(headline, {
          type: "lines,words,chars",
          mask: "lines",
          linesClass: "split-line",
        });
        // NOTE: the tagline halves are deliberately NOT split into
        // characters. Two intact phrases is what the beat needs — SIMULATE
        // and ANY REALITY sliding across the plate as whole blocks, not each
        // one's letters drifting independently, which would scramble the
        // blend into visual noise.

        gsap.set(block, { opacity: 1 });
        gsap.set(heroSplit.chars, { yPercent: 120, opacity: 0 });
        gsap.set(fades, { y: 26, opacity: 0 });
        if (orb) gsap.set(orb, { scale: 0.35, opacity: 0, transformOrigin: "50% 50%" });

        gsap.set(halves, {
          yPercent: 26,
          opacity: 0,
          scale: 1.14,
          transformOrigin: "50% 50%",
        });
        gsap.set(pantheon, {
          yPercent: 34,
          opacity: 0,
          scale: 1,
          x: 0,
          y: 0,
          transformOrigin: "50% 50%",
        });
        if (bust) gsap.set(bust, { opacity: 0, scale: 1, xPercent: 0, yPercent: 0 });

        // The Ken-Burns drift. Deliberately its OWN infinite yoyo tween
        // rather than a step in the timeline below: the brief asks for a
        // continuous living backdrop, and anything sequenced into `tl` would
        // play once and stop while the intro was still on screen.
        const ken = bust
          ? gsap.to(bust, {
              scale: 1.08,
              xPercent: 1.8,
              yPercent: -2.2,
              duration: 17,
              ease: "sine.inOut",
              yoyo: true,
              repeat: -1,
              transformOrigin: "50% 45%",
            })
          : null;

        // Hold the page still while the overlay owns the viewport.
        const html = document.documentElement;
        const prevOverflow = html.style.overflow;
        html.style.overflow = "hidden";
        unlock = () => {
          html.style.overflow = prevOverflow;
        };

        const finish = () => {
          unlock?.();
          unlock = null;
          ken?.kill();
          overlay.style.display = "none";
          html.classList.remove("js-motion");
          ScrollTrigger.refresh();
        };

        const tl = gsap.timeline({
          defaults: { ease: "power3.out" },
          onComplete: finish,
        });

        // --- 1. the plate arrives ---------------------------------------
        if (bust) tl.to(bust, { opacity: 1, duration: 1.1, ease: "power2.out" }, 0);

        // --- 2. the tagline builds: SIMULATE, then ANY REALITY -----------
        // A real stagger, not a simultaneous rise — "SIMULATE" is fully in
        // before "ANY REALITY" starts arriving, per the brief's own order.
        tl.to(
          halves,
          {
            yPercent: 0,
            opacity: 1,
            scale: 1,
            duration: 1,
            ease: "expo.out",
            stagger: 0.45,
          },
          0.25,
        );

        // --- 3. part from the middle -------------------------------------
        // A short hold once both halves are in, then they leave for good:
        // SIMULATE continues left off the stage, ANY REALITY continues
        // right, both fading as they go. This is the literal "part from the
        // middle" — the gap between them is what PANTHEON rises into next.
        tl.addLabel("part", "+=0.5");
        tl.to(
          halves[0],
          { x: "-42vw", opacity: 0, duration: 0.75, ease: "power2.in" },
          "part",
        ).to(
          halves[1],
          { x: "42vw", opacity: 0, duration: 0.75, ease: "power2.in" },
          "part",
        );

        // --- 4. PANTHEON comes up -----------------------------------------
        // A separate element, not a repurposing of the halves: it rises from
        // below into the space the tagline just vacated.
        tl.to(
          pantheon,
          { yPercent: 0, opacity: 1, duration: 0.9, ease: "expo.out" },
          "part+=0.35",
        );

        // --- 5. condense into the real hero -----------------------------
        // NOTE ON FLIP: GSAP's Flip plugin is genuinely available in this
        // install (3.15, real implementation in node_modules), but Flip
        // matches one element between two recorded states — here the giant
        // wordmark and the real <h1> are different elements with different
        // text, so there is nothing for it to match. This does the same
        // continuity trick manually: measure the <h1>'s box and drive the
        // giant type down into it, which is the effect Flip would have given
        // without pretending the two nodes are the same node. One element
        // now, not two halves, so there is no left/right split offset to
        // apply — PANTHEON drives straight into the headline's centre.
        const target = headline.getBoundingClientRect();
        const cx = target.left + target.width * 0.5;
        const cy = target.top + target.height * 0.5;

        tl.to(
          pantheon,
          {
            x: () => cx - window.innerWidth / 2,
            y: () => cy - window.innerHeight / 2,
            scale: 0.1,
            yPercent: 0,
            opacity: 0,
            duration: 0.85,
            ease: "power3.inOut",
          },
          "+=0.15",
        )
          .to(overlay, { opacity: 0, duration: 0.5, ease: "power2.inOut" }, "<0.3")
          .to(
            heroSplit.chars,
            {
              yPercent: 0,
              opacity: 1,
              duration: 1,
              ease: "expo.out",
              stagger: { each: 0.012, from: "start" },
            },
            "<0.1",
          );

        if (orb) {
          tl.to(orb, { scale: 1, opacity: 1, duration: 1.5, ease: "expo.out" }, "<");
        }

        tl.to(
          fades,
          { y: 0, opacity: 1, duration: 0.85, stagger: 0.08, ease: "power3.out" },
          "<0.3",
        );

        return () => {
          unlock?.();
          unlock = null;
          tl.kill();
          heroSplit.revert();
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
      unlock?.();
      mm?.revert();
    };
  }, []);

  return (
    <section
      id="top"
      ref={root}
      className="sec-seed sec-open relative flex min-h-dvh items-center pt-24 pb-20 lg:pt-16"
    >
      <div
        aria-hidden="true"
        className="grid-field pointer-events-none absolute inset-0"
      />
      <div aria-hidden="true" className="sec-wash sec-wash-first" />

      {/* ---------------- the load-in ---------------- */}
      {/* Motion-only: hidden by default in CSS, revealed by the `js-motion`
          class the layout's inline script sets, and `display:none` outright
          under prefers-reduced-motion. */}
      <div className="intro-overlay intro-stage fixed inset-0 z-50 overflow-hidden">
        {/* The engraving. Decorative: the wordmark on top of it and the real
            <h1> underneath carry everything this screen actually says. */}
        <div
          aria-hidden="true"
          className="intro-bust pointer-events-none absolute inset-0"
        >
          <Image
            src="/img/intro-bust.png"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-contain object-center"
          />
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center px-6"
        >
          {/* The tagline: SIMULATE arrives, then ANY REALITY joins it, then
              both part — one off each edge — for PANTHEON to rise into. */}
          <p className="intro-word display flex select-none flex-wrap items-center justify-center gap-x-5 gap-y-1 whitespace-nowrap text-center text-[9vw] leading-none tracking-tight sm:text-[5.5vw]">
            <span className="intro-half inline-block">SIMULATE</span>
            <span className="intro-half inline-block">ANY REALITY</span>
          </p>

          {/* PANTHEON: a separate element from the tagline above, not a
              rebuild of it — it rises up once the tagline has parted, at the
              size the wordmark has always used in the intro. Kept small
              enough at the low end (12vw) to stay on one line at 320px. */}
          <p className="intro-panth intro-word display absolute select-none whitespace-nowrap text-[12vw] leading-none tracking-tight sm:text-[15vw]">
            PANTHEON
          </p>
        </div>
      </div>

      {/* ---------------- the real hero ---------------- */}
      <div className="hero-block relative z-10 mx-auto w-full max-w-[1440px] px-6 sm:px-8 lg:px-14">
        <div className="relative grid items-center gap-12 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)] lg:gap-10 xl:gap-16">
          <div className="relative z-10">
            <span className="stage-rule mb-8" aria-hidden="true" />

            <h1 className="hero-headline display max-w-[24ch] text-[clamp(1.85rem,3.3vw,3.05rem)] text-ink">
              Drop in one moment. Watch the people inside it reason it out.
            </h1>

            <p className="hero-fade mt-7 max-w-[54ch] font-mono text-[15px] leading-relaxed text-ink-dim sm:text-base">
              Pantheon pulls every person, organization and place out of a seed
              event into a knowledge graph, waits for you to choose which of them
              wake up as autonomous agents, then runs them against each other
              round after round.
            </p>

            <div className="hero-fade mt-9 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <a className="btn btn-primary" href="#seed">
                See how a seed becomes a simulation
              </a>
              <a className="btn btn-ghost" href="#recap">
                Read the pipeline
              </a>
            </div>

            <ul className="hero-fade mt-10 flex flex-wrap gap-2">
              {CHIPS.map((chip) => (
                <li
                  key={chip}
                  className="rounded-sm border border-line px-3 py-1.5 font-mono text-[11px] text-ink-dim"
                >
                  {chip}
                </li>
              ))}
            </ul>
          </div>

          {/* Below 1024px the sigil sits behind the copy as atmosphere rather
              than stacking under it, which would push the CTA off screen.

              THE NARROW OPACITY IS A CONTRAST NUMBER, NOT A TASTE ONE. At 40%
              the sigil's lit faces composite to about rgb(122,75,72) directly
              under the hero paragraph, which puts --ink-dim body copy at
              2.84:1 — measured on a real render at 375 with the glyphs hidden,
              not computed. That was true of the previous hued sigil too and
              was worse still while it was drawn in near-white greys; it is
              only being fixed now because this pass re-derived every contrast
              number on the page and this was the one that failed.

              22% brings the same pixel to about rgb(68,40,36) and the body
              copy to 5.5:1. The sigil is still clearly present as atmosphere —
              it is 82vw of cube formation — it simply stops competing with the
              only paragraph on the screen. At lg and up it is a real column of
              its own with no text over it, so it keeps full opacity there. */}
          <div className="pointer-events-none absolute -right-[22%] top-[-6%] z-0 w-[82vw] opacity-[0.15] lg:pointer-events-auto lg:relative lg:right-auto lg:top-auto lg:flex lg:w-auto lg:justify-center lg:opacity-100">
            <CubeSigil uid="hero" className="hero-orb h-auto w-full lg:w-[min(29vw,400px)]" />
          </div>
        </div>

        <p
          className="hero-fade mt-16 hidden items-center gap-3 lg:flex"
          aria-hidden="true"
        >
          <span className="hud-label text-ink-dim">SCROLL</span>
          <span
            className="h-px w-16"
            style={{ background: "linear-gradient(90deg, var(--ink-dim), transparent)" }}
          />
        </p>
      </div>
    </section>
  );
}
