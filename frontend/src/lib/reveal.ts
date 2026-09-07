"use client";

import { gsap } from "@/lib/gsap";

/**
 * The standard non-pinned scroll reveal, shared by Graph, Agents, Chat,
 * Recap and the footer CTA.
 *
 * Anything tagged `.reveal-target` inside `scope` starts hidden and lifts in
 * on a stagger once the section reaches the viewport. Under reduced motion
 * the same elements get a plain opacity fade with no transform, which is the
 * maximum the brief allows.
 *
 * Must be called from inside a `gsap.matchMedia()` callback — the resulting
 * tween and its ScrollTrigger are collected by that context and reverted
 * with it, so there is no separate teardown to remember.
 */
export function baseReveal(scope: HTMLElement, reduced: boolean) {
  const targets = Array.from(
    scope.querySelectorAll<HTMLElement>(".reveal-target"),
  );
  if (targets.length === 0) return null;

  if (reduced) {
    gsap.set(targets, { opacity: 0 });
    return gsap.to(targets, {
      opacity: 1,
      duration: 0.35,
      ease: "none",
      scrollTrigger: { trigger: scope, start: "top 90%", once: true },
    });
  }

  gsap.set(targets, { y: 30, opacity: 0 });
  return gsap.to(targets, {
    y: 0,
    opacity: 1,
    duration: 0.85,
    ease: "power3.out",
    stagger: 0.08,
    scrollTrigger: { trigger: scope, start: "top 72%", once: true },
  });
}
