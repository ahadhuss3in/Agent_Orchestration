"use client";

/**
 * Single registration point for GSAP + plugins.
 *
 * Availability was re-verified against the installed copy rather than
 * assumed, the same way v1 checked SplitText:
 *
 *   node_modules/gsap/SplitText.js        real implementation
 *   node_modules/gsap/ScrollTrigger.js    real implementation
 *   node_modules/gsap/MorphSVGPlugin.js   real implementation, 38KB,
 *                                         "MorphSVGPlugin 3.15.0", imports
 *                                         the real path utils. Not a stub.
 *   node_modules/gsap/Flip.js             real implementation
 *
 * Installed gsap is 3.15.0. Everything that used to be behind the Club
 * paywall ships in the free core package from 3.13 onward, so MorphSVG is
 * genuinely usable here and the Agents mitosis uses it for a real shape morph
 * rather than the fallback cross-dissolve.
 */

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";
import { MorphSVGPlugin } from "gsap/MorphSVGPlugin";

let registered = false;

if (typeof window !== "undefined" && !registered) {
  gsap.registerPlugin(ScrollTrigger, SplitText, MorphSVGPlugin);
  // Pinning does its own layout math; letting ScrollTrigger churn on every
  // mobile URL-bar resize causes visible jumps mid-pin.
  ScrollTrigger.config({ ignoreMobileResize: true });
  registered = true;
}

export { gsap, ScrollTrigger, SplitText, MorphSVGPlugin };

/** Media query keys handed to every `gsap.matchMedia()` call in the app. */
export const MOTION_QUERIES = {
  motion: "(prefers-reduced-motion: no-preference)",
  reduced: "(prefers-reduced-motion: reduce)",
} as const;

/**
 * Three-way split used by the seed journey, whose fixed traveling orb only
 * makes sense once there is room beside the content for it to travel through.
 */
export const JOURNEY_QUERIES = {
  wide: "(min-width: 1024px) and (prefers-reduced-motion: no-preference)",
  narrow: "(max-width: 1023px) and (prefers-reduced-motion: no-preference)",
  reduced: "(prefers-reduced-motion: reduce)",
} as const;

export type MotionConditions = {
  motion: boolean;
  reduced: boolean;
};
