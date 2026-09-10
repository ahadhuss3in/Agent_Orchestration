"use client";

import { gsap, SplitText } from "@/lib/gsap";

/**
 * Headline and body text treatments.
 *
 * THE SIGNATURE MOVE (v6). Every section headline on the page now enters with
 * `swoosh` — see the long note over it. That replaces the five different
 * per-section headline treatments v5 shipped (`maskWipe`, `assemble`,
 * `typeOn`, `blurFocus`), which were individually well-judged but collectively
 * meant the page had no entrance of its own: a reader who had scrolled the
 * whole thing could not have told you what "a Pantheon headline does", because
 * it did five things. One move, used everywhere, is the point.
 *
 * The four superseded treatments are DELETED rather than left in place. A
 * helper nobody calls is a helper that quietly rots, and `maskWipe` in
 * particular could not coexist with the new move anyway: its line masks clip
 * horizontally, and the whole signature is a sideways overshoot.
 *
 * What survives, because none of it is a headline entrance:
 *
 *   bodyLineReveal  the calmer line lift, still the treatment for body copy
 *   countIn         Recap's pipeline numerals counting up in sequence
 *   typeChars       the persona descriptions typing on
 *   gesture         a persona figure's lean-and-settle talk beat
 *
 * Every one of these returns a cleanup that reverts its SplitText, and every
 * one is only ever called from inside a `gsap.matchMedia()` motion branch —
 * the reduced branch never splits anything and leaves the markup at its
 * already-final state, which is the finished, legible one.
 */

export type Cleanup = () => void;

const NOOP: Cleanup = () => {};

/** Shared, lighter treatment for body paragraphs. */
export function bodyLineReveal(
  targets: HTMLElement[],
  trigger: HTMLElement,
): Cleanup {
  if (targets.length === 0) return NOOP;

  const splits = targets.map((el) =>
    SplitText.create(el, { type: "lines", mask: "lines", linesClass: "split-line" }),
  );
  const lines = splits.flatMap((s) => s.lines as HTMLElement[]);

  gsap.set(lines, { yPercent: 108, opacity: 0 });
  gsap.to(lines, {
    yPercent: 0,
    opacity: 1,
    duration: 0.8,
    ease: "power3.out",
    stagger: 0.05,
    scrollTrigger: { trigger, start: "top 74%", once: true },
  });

  return () => splits.forEach((s) => s.revert());
}

/**
 * THE SIGNATURE ENTRANCE.
 *
 * The client described it in their own words: text should "swoosh in from the
 * bottom and shoot a bit up sideways and come back". So: a line starts below
 * and offset to one side of where it will end up, travels up AND across on one
 * continuous arc, carries PAST its resting place, and settles back into it.
 * Not a fade-up. The overshoot is the whole point — the line has to visibly
 * go too far before it comes home, or the move reads as an ease and not as a
 * gesture.
 *
 * WHERE THE NUMBERS COME FROM. The reference the client pointed at could not
 * be read from source, but they also supplied `List-9-16.json`, a real
 * Bodymovin export of the motion family they want. It was rendered rather than
 * guessed at, and its main mover's position track is a damped lateral
 * overshoot with a secondary ripple — quantised off the keyframes, against a
 * resting x of 56 units:
 *
 *   t = 0.05s   x = 56      at rest, about to go
 *   t = 0.20s   x = 94.6    +38.6, most of the way out
 *   t = 0.25s   x = 99.1    +43.1, PEAK OVERSHOOT
 *   t = 0.32s   x = 73.6    +17.6, coming back, past centre-ish
 *   t = 0.40s   x = 60.8    +4.8,  a small second ripple
 *   ~t = 0.47s              home
 *
 * The three keyframe legs below are that shape: out to a hard overshoot on a
 * decelerating ease, back through a smaller counter-overshoot, then home. The
 * ratios are preserved and the whole thing is stretched by about 2x, because
 * a headline is an order of magnitude larger on screen than a list item and
 * the same timing reads as a twitch at that size.
 *
 * The Lottie also fans its items around an arc — 7.5 degrees of rotation per
 * slot — which is where the small per-line rotation comes from. It decays with
 * line index so a three-line headline lands flat rather than stacking tilt.
 *
 * NO LINE MASK, DELIBERATELY. `mask: "lines"` wraps each line in an
 * `overflow: hidden` box, which is exactly what the superseded `maskWipe`
 * relied on — and it would clip the sideways half of this move dead. The line
 * is un-masked and simply starts transparent, which is also what makes the
 * approach visible: you watch it arrive rather than watching it appear from
 * behind an edge.
 *
 * Reduced motion never reaches this function. Callers gate on
 * `gsap.matchMedia()` and the reduced branch leaves the headline at rest,
 * which is its default markup state.
 */
export function swoosh(el: HTMLElement, trigger: HTMLElement): Cleanup {
  const split = SplitText.create(el, {
    type: "lines",
    linesClass: "split-line-open",
  });
  const lines = split.lines as HTMLElement[];
  if (lines.length === 0) {
    split.revert();
    return NOOP;
  }

  // Bottom-left. The line pivots around the corner it is travelling away
  // from, so the rotation reads as part of the arc rather than as a spin.
  gsap.set(lines, {
    yPercent: 116,
    xPercent: -13,
    rotation: (i: number) => 3.2 / (i + 1),
    opacity: 0,
    transformOrigin: "0% 100%",
    force3D: true,
  });

  const tween = gsap.to(lines, {
    keyframes: [
      {
        // OUT. Up past the resting line and across past it too.
        yPercent: -14,
        xPercent: 6.5,
        rotation: (i: number) => -1.1 / (i + 1),
        opacity: 1,
        duration: 0.42,
        ease: "power3.out",
      },
      {
        // BACK, and slightly too far the other way — the second ripple.
        yPercent: 3.6,
        xPercent: -1.8,
        rotation: (i: number) => 0.32 / (i + 1),
        duration: 0.24,
        ease: "sine.inOut",
      },
      {
        // HOME.
        yPercent: 0,
        xPercent: 0,
        rotation: 0,
        duration: 0.3,
        ease: "power2.out",
      },
    ],
    // Roughly a third of one line's own travel time, so a multi-line headline
    // reads as one gesture crossing it rather than as separate lines.
    stagger: 0.13,
    scrollTrigger: { trigger, start: "top 78%", once: true },
  });

  return () => {
    tween.kill();
    split.revert();
  };
}

/**
 * Recap — each pipeline step's numeral counts up and its label types on, in
 * sequence across the row.
 */
export function countIn(
  steps: { numeral: HTMLElement; label: HTMLElement | null }[],
  trigger: HTMLElement,
): Cleanup {
  if (steps.length === 0) return NOOP;

  // "words,chars" rather than bare "chars": SplitText wraps every character
  // in an inline-block, and without word wrappers the browser will happily
  // break a line in the middle of a word.
  const splits = steps
    .map((s) =>
      s.label ? SplitText.create(s.label, { type: "words,chars" }) : null,
    )
    .filter(Boolean) as SplitText[];

  const finals = steps.map((s) => s.numeral.textContent ?? "");

  const tl = gsap.timeline({
    scrollTrigger: { trigger, start: "top 76%", once: true },
  });

  steps.forEach((step, i) => {
    const at = i * 0.13;
    const target = Number(finals[i]) || 0;
    const counter = { n: 0 };

    // A plain callback rather than a `set` on textContent: GSAP routes
    // unknown props through the CSS plugin, so setting text that way needs
    // TextPlugin. This does the same job with nothing extra registered.
    tl.call(
      () => {
        step.numeral.textContent = "00";
      },
      undefined,
      at,
    );
    tl.to(
      counter,
      {
        n: target,
        duration: 0.5,
        ease: "power1.out",
        onUpdate: () => {
          step.numeral.textContent = String(Math.round(counter.n)).padStart(2, "0");
        },
        onComplete: () => {
          step.numeral.textContent = finals[i];
        },
      },
      at,
    );

    const split = splits[i];
    if (split) {
      const chars = split.chars as HTMLElement[];
      gsap.set(chars, { opacity: 0 });
      tl.to(
        chars,
        { opacity: 1, duration: 0.01, ease: "none", stagger: 0.03 },
        at + 0.12,
      );
    }
  });

  return () => {
    tl.kill();
    steps.forEach((s, i) => {
      s.numeral.textContent = finals[i];
    });
    splits.forEach((s) => s.revert());
  };
}

/**
 * The "talk beat" gesture for a persona card.
 *
 * DEVIATION, called out deliberately: the brief suggested moving a single SVG
 * sub-element (an arm, a head). The persona figures are drawn with <use>
 * against a shared sprite, and a <use> shadow tree is not reachable from
 * script, so there is no arm element to grab. Rendering all four inline just
 * to nudge one limb would duplicate the whole sprite for a 400ms flourish.
 * Instead the whole figure leans and bobs about a transform origin down at
 * its feet, which reads as a weight shift / lean-in rather than a slide.
 */
export function gesture(fig: HTMLElement) {
  return gsap
    .timeline()
    .set(fig, { transformOrigin: "50% 100%" })
    .to(fig, { rotation: -3.2, y: -5, duration: 0.34, ease: "power2.out" })
    .to(fig, { rotation: 1.6, y: 0, duration: 0.42, ease: "power1.inOut" })
    .to(fig, { rotation: 0, duration: 0.5, ease: "elastic.out(1, 0.5)" });
}

/**
 * Characters revealed left-to-right at a fixed rate. Same "typing" idea as
 * `typeOn` but without the caret, used for the persona descriptions.
 */
export function typeChars(el: HTMLElement, trigger: HTMLElement, start: string) {
  // Words are split too, purely so the characters inside them stay glued
  // together — a bare "chars" split lets lines break mid-word.
  const split = SplitText.create(el, { type: "words,chars" });
  const chars = split.chars as HTMLElement[];

  gsap.set(chars, { opacity: 0 });
  const tween = gsap.to(chars, {
    opacity: 1,
    duration: 0.01,
    ease: "none",
    stagger: 0.011,
    scrollTrigger: { trigger, start, once: true },
  });

  return () => {
    tween.kill();
    split.revert();
  };
}
