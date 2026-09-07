"use client";

import { gsap, SplitText } from "@/lib/gsap";

/**
 * Per-section headline treatments.
 *
 * Client feedback #4: six sections were all doing the same fade-up. Each of
 * these is picked to fit what its section is actually about, not for
 * decoration —
 *
 *   maskWipe    Graph        lines wipe out from behind a mask: "revealing
 *                            structure that was already there"
 *   assemble    Agents       words pop in with scale + rotation: pieces
 *                            being assembled into a cast
 *   typeOn      Simulation   characters type on behind a caret, matching the
 *                            turn-based terminal already in that section
 *   blurFocus   Chat         blur-to-focus: an agent coming into resolution
 *   countIn     Recap        numerals count up in sequence
 *
 * Every one of these returns a cleanup that reverts its SplitText, and every
 * one is only ever called from inside a `gsap.matchMedia()` motion branch —
 * the reduced branch never splits anything and leaves the markup at its
 * already-final state.
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

/** Graph — line-by-line mask wipe. */
export function maskWipe(el: HTMLElement, trigger: HTMLElement): Cleanup {
  const split = SplitText.create(el, {
    type: "lines",
    mask: "lines",
    linesClass: "split-line",
  });
  const lines = split.lines as HTMLElement[];

  gsap.set(lines, { yPercent: 112, opacity: 0, skewY: 3 });
  gsap.to(lines, {
    yPercent: 0,
    opacity: 1,
    skewY: 0,
    duration: 1.05,
    ease: "expo.out",
    stagger: 0.1,
    scrollTrigger: { trigger, start: "top 72%", once: true },
  });

  return () => split.revert();
}

/** Agents — words popping in, scaled and rotated, like pieces assembling. */
export function assemble(el: HTMLElement, trigger: HTMLElement): Cleanup {
  const split = SplitText.create(el, { type: "lines,words", linesClass: "split-line" });
  const words = split.words as HTMLElement[];

  gsap.set(words, {
    opacity: 0,
    scale: 0.55,
    rotation: (i: number) => (i % 2 ? 7 : -7),
    transformOrigin: "50% 100%",
  });
  gsap.to(words, {
    opacity: 1,
    scale: 1,
    rotation: 0,
    duration: 0.72,
    ease: "back.out(2.4)",
    stagger: { each: 0.055, from: "start" },
    scrollTrigger: { trigger, start: "top 72%", once: true },
  });

  return () => split.revert();
}

/**
 * Simulation — characters type on with a blinking caret chasing them.
 *
 * Characters are revealed by opacity rather than by rewriting textContent, so
 * the heading keeps its real text in the DOM the whole time. That matters:
 * this headline is the target of an `aria-labelledby`, and emptying it would
 * strip the section's accessible name for however long the animation runs.
 */
export function typeOn(
  el: HTMLElement,
  caret: HTMLElement | null,
  trigger: HTMLElement,
): Cleanup {
  const split = SplitText.create(el, { type: "lines,words,chars" });
  const chars = split.chars as HTMLElement[];
  if (chars.length === 0) {
    split.revert();
    return NOOP;
  }

  gsap.set(chars, { opacity: 0 });
  if (caret) gsap.set(caret, { opacity: 0 });

  const state = { i: 0 };
  const place = (idx: number) => {
    if (!caret) return;
    const c = chars[Math.min(idx, chars.length - 1)];
    if (!c) return;
    gsap.set(caret, {
      x: c.offsetLeft + (idx >= chars.length ? c.offsetWidth : 0),
      y: c.offsetTop,
      height: c.offsetHeight || 20,
    });
  };

  const tl = gsap.timeline({
    scrollTrigger: { trigger, start: "top 72%", once: true },
  });

  if (caret) {
    tl.set(caret, { opacity: 1, onComplete: () => place(0) });
  }

  tl.to(state, {
    i: chars.length,
    duration: Math.min(2.1, chars.length * 0.028),
    ease: "none",
    onUpdate: () => {
      const upto = Math.round(state.i);
      for (let n = 0; n < chars.length; n++) {
        chars[n].style.opacity = n < upto ? "1" : "0";
      }
      place(upto);
    },
  });

  // Caret stops chasing and settles into the CSS blink at the end.
  if (caret) tl.add(() => caret.classList.add("caret", "ambient"));

  return () => {
    tl.kill();
    caret?.classList.remove("caret", "ambient");
    split.revert();
  };
}

/** Chat — soft blur-to-focus, an agent resolving into view. */
export function blurFocus(el: HTMLElement, trigger: HTMLElement): Cleanup {
  const split = SplitText.create(el, { type: "lines", linesClass: "split-line-open" });
  const lines = split.lines as HTMLElement[];

  gsap.set(lines, { opacity: 0, filter: "blur(9px)", y: 10 });
  gsap.to(lines, {
    opacity: 1,
    filter: "blur(0px)",
    y: 0,
    duration: 1.15,
    ease: "power2.out",
    stagger: 0.12,
    scrollTrigger: { trigger, start: "top 74%", once: true },
  });

  return () => split.revert();
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
