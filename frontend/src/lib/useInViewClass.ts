"use client";

import { useEffect, type RefObject } from "react";

/**
 * Adds `in-view` to the element while any part of it is on screen.
 *
 * Ambient CSS animations (the orb's breathing, the live-state pulse, the
 * terminal caret) are declared `animation-play-state: paused` and only run
 * inside `.in-view`, so nothing keeps painting off screen.
 *
 * IntersectionObserver rather than ScrollTrigger on purpose: this is a
 * visibility concern, not an animation, so it should keep working even in
 * the reduced-motion branch where no timelines are built.
 */
export function useInViewClass(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      el?.classList.add("in-view");
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => el.classList.toggle("in-view", entry.isIntersecting),
      { rootMargin: "10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
}
