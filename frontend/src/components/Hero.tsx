"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import { gsap, SplitText, ScrollTrigger, MOTION_QUERIES } from "@/lib/gsap";
import { Orb } from "./Orb";

const CHIPS = [
  "Neo4j knowledge graph",
  "Human-in-the-loop promotion",
  "Context-bounded rounds",
];

/**
 * The load-in, v4.
 *
 * WHAT CHANGED FROM v3: the wordmark used to be the only line, split into
 * "PAN" / "THEON" and jiggled apart to sell the blend-mode pass through the
 * engraving. The brief now wants a build-up before the name: a tagline
 * arrives first, splits apart for real, and PANTHEON rises into the gap it
 * leaves. The skip button is gone — the intro is no longer escapable.
 *
 * Sequence, over the same black-stage-plus-engraving backdrop as before:
 *   1. The plate fades up centred, `object-fit: contain`, with its own
 *      continuous Ken-Burns drift (unchanged from v3).
 *   2. "SIMULATE" rises in first, then "ANY REALITY" joins it — two
 *      `.intro-half` elements, same entrance mechanic v3 used for its two
 *      wordmark halves, just carrying different text. Both sit under
 *      `mix-blend-mode: difference` against the engraving.
 *   3. They drift a little apart and back once (the same "walk the inversion
 *      boundary across the linework" beat from v3), then actually part: each
 *      half continues out past the edge of the stage and fades, which is the
 *      "part from the middle" the brief asks for.
 *   4. PANTHEON — a separate element, not a rebuild of the halves — rises up
 *      from below into the space the tagline just vacated, at the same giant
 *      size v3's wordmark used.
 *   5. PANTHEON condenses into the real <h1>, exactly the manual
 *      measure-and-drive-down trick v3 used (Flip has nothing to match here:
 *      the giant word and the <h1> are different elements with different
 *      text), just aimed at one element instead of two halves.
 *
 * Entirely absent under prefers-reduced-motion (the overlay is
 * `display: none` in CSS, and no timeline is built) — that is now the only
 * way to bypass it.
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

        // Splitting after fonts settle: Orbitron is much wider than the
        // fallback, so character boxes measured early jump on swap.
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

        // --- 3. the tagline slides through the engraving -----------------
        // One small drift-and-settle first — under `difference` this walks
        // the inversion boundary across the bust's linework, the same beat
        // v3 used, kept because it is what sells either half as passing
        // through the plate rather than sitting on top of it.
        tl.addLabel("through", "+=0.2");
        tl.to(
          halves[0],
          { x: "-3.4vw", duration: 1, ease: "sine.inOut" },
          "through",
        ).to(
          halves[1],
          { x: "3.4vw", duration: 1, ease: "sine.inOut" },
          "through",
        );

        // --- 4. part from the middle -------------------------------------
        // The same two elements now leave for good: SIMULATE continues left
        // off the stage, ANY REALITY continues right, both fading as they
        // go. This is the literal "part from the middle" — the gap between
        // them is what PANTHEON rises into next.
        tl.addLabel("part", "through+=1");
        tl.to(
          halves[0],
          { x: "-42vw", opacity: 0, duration: 0.75, ease: "power2.in" },
          "part",
        ).to(
          halves[1],
          { x: "42vw", opacity: 0, duration: 0.75, ease: "power2.in" },
          "part",
        );

        // --- 5. PANTHEON comes up -----------------------------------------
        // A separate element, not a repurposing of the halves: it rises from
        // below into the space the tagline just vacated.
        tl.to(
          pantheon,
          { yPercent: 0, opacity: 1, duration: 0.9, ease: "expo.out" },
          "part+=0.35",
        );

        // --- 6. condense into the real hero -----------------------------
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
              event into a Neo4j graph, waits for you to choose which of them
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
              than stacking under it, which would push the CTA off screen. */}
          <div className="pointer-events-none absolute -right-[22%] top-[-6%] z-0 w-[82vw] opacity-40 lg:pointer-events-auto lg:relative lg:right-auto lg:top-auto lg:flex lg:w-auto lg:justify-center lg:opacity-100">
            <Orb uid="hero" className="hero-orb h-auto w-full lg:w-[min(27vw,380px)]" />
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
