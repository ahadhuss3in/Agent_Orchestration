"use client";

import { useEffect, useRef } from "react";
import { gsap, SplitText, ScrollTrigger, MOTION_QUERIES } from "@/lib/gsap";
import { InlineFigure } from "./WireframeFigures";
import { Orb } from "./Orb";

const CHIPS = [
  "Neo4j knowledge graph",
  "Human-in-the-loop promotion",
  "Context-bounded rounds",
];

/**
 * Client feedback #1: the v1 boot terminal was a small corner overlay. This
 * is the full-viewport version.
 *
 * Beat by beat:
 *   1. "PAN" / "THEON" fill the screen at 16vw, characters rising in.
 *   2. The Orchestrator (left) and the Wildcard (right) climb in from below
 *      the fold, drawing themselves with a stroke-dashoffset sweep so the
 *      line art looks hand-drawn rather than faded on.
 *   3. As each figure's bounding box arrives, it physically shoves its half
 *      of the wordmark out of the way — the halves tween outward on x with a
 *      rotation kick, timed to the figures' arrival, so it reads as
 *      displacement and not a crossfade.
 *   4. The whole overlay condenses: the giant halves scale and translate down
 *      into the measured position of the real <h1>, fading as they go, while
 *      the real hero fades up underneath. See the note on Flip below.
 *
 * Entirely absent under prefers-reduced-motion (the overlay is
 * `display: none` in CSS, and no timeline is built), and skippable at any
 * point via a real focusable button.
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
        const figures = Array.from(
          scope.querySelectorAll<HTMLElement>(".intro-figure"),
        );
        const skip = scope.querySelector<HTMLButtonElement>(".intro-skip");
        const fades = Array.from(
          scope.querySelectorAll<HTMLElement>(".hero-fade"),
        );
        if (!overlay || !block || !headline || !halves.length) return;

        // Splitting after fonts settle: Orbitron is much wider than the
        // fallback, so character boxes measured early jump on swap.
        const heroSplit = SplitText.create(headline, {
          type: "lines,words,chars",
          mask: "lines",
          linesClass: "split-line",
        });
        // NOTE: the giant halves are deliberately NOT split.
        // `background-clip: text` paints the gradient through the element's
        // own text; once SplitText lifts the glyphs into child <div>s there
        // is no text left on the gradient element to clip against, and the
        // wordmark rendered as an orange slab with knocked-out letters (or,
        // at the start of the tween, as nothing at all). Each half animates
        // as one intact block instead, which is also what the beat needs —
        // a half of the word being shoved bodily aside, not eight letters
        // drifting independently.

        const strokes = figures.flatMap((f) =>
          Array.from(f.querySelectorAll<SVGElement>(".wf-stroke")),
        );
        const joints = figures.flatMap((f) =>
          Array.from(f.querySelectorAll<SVGElement>(".wf-joint")),
        );

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
        gsap.set(figures, { yPercent: 118, opacity: 1 });
        gsap.set(strokes, { strokeDashoffset: 1 });
        gsap.set(joints, { opacity: 0, scale: 0 , transformOrigin: "50% 50%" });
        if (skip) gsap.set(skip, { opacity: 0 });

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
          overlay.style.display = "none";
          html.classList.remove("js-motion");
          ScrollTrigger.refresh();
        };

        const tl = gsap.timeline({
          defaults: { ease: "power3.out" },
          onComplete: finish,
        });

        // --- 1. giant wordmark ------------------------------------------
        tl.to(halves, {
          yPercent: 0,
          opacity: 1,
          scale: 1,
          duration: 1,
          ease: "expo.out",
          stagger: 0.12,
        });
        if (skip) tl.to(skip, { opacity: 1, duration: 0.4 }, 0.6);

        // --- 2. figures climb in, drawing themselves --------------------
        tl.addLabel("climb", "+=0.45");
        tl.to(
          figures,
          { yPercent: 0, duration: 1.3, ease: "power3.out", stagger: 0.16 },
          "climb",
        )
          .to(
            strokes,
            {
              strokeDashoffset: 0,
              duration: 0.95,
              ease: "power2.inOut",
              stagger: { each: 0.028, from: "start" },
            },
            "<",
          )
          .to(
            joints,
            { opacity: 1, scale: 1, duration: 0.3, stagger: 0.02, ease: "back.out(3)" },
            "<0.55",
          );

        // --- 3. the arrival shoves the wordmark aside -------------------
        // Placed against the climb tween's own start rather than at the end
        // of the timeline: at "<0.62" the figures are about two thirds of the
        // way up, which is the frame their bounding boxes first overlap the
        // wordmark. Displacing on impact rather than after they land is what
        // makes it read as a shove instead of a transition.
        tl.to(
          halves[0],
          {
            x: "-42vw",
            yPercent: 6,
            rotation: -12,
            duration: 0.8,
            ease: "power4.out",
          },
          "climb+=0.62",
        ).to(
          halves[1],
          {
            x: "42vw",
            yPercent: -6,
            rotation: 12,
            duration: 0.8,
            ease: "power4.out",
          },
          "climb+=0.74",
        );

        // --- 4. condense into the real hero -----------------------------
        // NOTE ON FLIP: GSAP's Flip plugin is genuinely available in this
        // install (3.15, real implementation in node_modules), but Flip
        // matches one element between two recorded states — here the giant
        // wordmark and the real <h1> are different elements with different
        // text, so there is nothing for it to match. This does the same
        // continuity trick manually: measure the <h1>'s box and drive the
        // giant type down into it, which is the effect Flip would have given
        // without pretending the two nodes are the same node.
        const target = headline.getBoundingClientRect();
        const cx = target.left + target.width * 0.5;
        const cy = target.top + target.height * 0.5;

        tl.to(
          halves,
          {
            x: (i: number) =>
              cx - window.innerWidth / 2 + (i === 0 ? -60 : 60),
            y: () => cy - window.innerHeight / 2,
            scale: 0.1,
            rotation: 0,
            yPercent: 0,
            opacity: 0,
            duration: 0.85,
            ease: "power3.inOut",
          },
          "+=0.12",
        )
          .to(
            figures,
            { yPercent: 60, opacity: 0, duration: 0.7, ease: "power2.in" },
            "<",
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

        // Skip: jump the whole thing to its end state.
        // `progress()` suppresses callbacks by default, so onComplete would
        // not run and the overlay would stay on screen swallowing clicks.
        const onSkip = () => {
          tl.progress(1);
          finish();
        };
        skip?.addEventListener("click", onSkip);

        return () => {
          skip?.removeEventListener("click", onSkip);
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
      className="sec-seed relative flex min-h-dvh items-center overflow-hidden pt-24 pb-20 lg:pt-16"
    >
      <div
        aria-hidden="true"
        className="grid-field pointer-events-none absolute inset-0"
      />
      <div aria-hidden="true" className="sec-wash" />

      {/* ---------------- the load-in ---------------- */}
      {/* Motion-only: hidden by default in CSS, revealed by the `js-motion`
          class the layout's inline script sets, and `display:none` outright
          under prefers-reduced-motion. */}
      <div className="intro-overlay fixed inset-0 z-50 overflow-hidden bg-paper">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
        >
          {/* Stacked below 640px: "PANTHEON" set on one line at 15vw is about
              430px wide in Orbitron, which runs off both edges of a 375px
              screen. Two lines at 18vw fills the viewport just as hard
              without clipping the P and the N. */}
          <p className="display flex select-none flex-col items-center whitespace-nowrap text-[18vw] leading-[0.92] tracking-tight sm:flex-row sm:text-[15vw] sm:leading-none">
            <span className="intro-half grad-text inline-block">PAN</span>
            <span className="intro-half grad-text inline-block">THEON</span>
          </p>
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center gap-[34vw] sm:gap-[26vw]"
        >
          {/* Aurum on the Zeus figure: the mythic thread stays gold. The
              deepened bronze rather than raw #f2b705, because pale gold line
              art on a white ground is effectively invisible. */}
          <InlineFigure
            id="orchestrator"
            className="intro-figure h-[42vh] w-auto text-[color:var(--ink-aurum)] sm:h-[62vh]"
          />
          <InlineFigure
            id="wildcard"
            className="intro-figure h-[36vh] w-auto text-ink sm:h-[52vh]"
          />
        </div>

        <button
          type="button"
          className="intro-skip absolute bottom-6 left-1/2 z-10 -translate-x-1/2 rounded-sm border border-[color:var(--line-strong)] bg-paper px-4 py-2 font-mono text-[11px] tracking-[0.16em] text-ink uppercase"
          aria-label="Skip the intro animation"
        >
          Skip intro
        </button>
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
