"use client";

import { useEffect, useRef } from "react";
import { gsap, MOTION_QUERIES } from "@/lib/gsap";

/**
 * The seed sigil.
 *
 * Client feedback #3: v1 was a radial-gradient blob with one dashed ring.
 * This is a built asset — an astrolabe / targeting reticle:
 *
 *   - four concentric rings at different radii, mixing solid and dashed
 *   - a faceted gem core (rotating octagon + inner triangles) in the
 *     Ignition gradient, not a soft circle
 *   - four orbiting particle dots at different radii and speeds
 *   - 60 radiating tick marks around the perimeter, every fifth one long
 *
 * Still one shared component, because it appears in three places that have
 * to look like the same object: the hero, the fixed orb that travels down
 * the Seed section eating text, and the centre the graph grows out of.
 *
 * Idle motion is a single GSAP timeline gated by `gsap.matchMedia()`. Under
 * reduced motion no timeline is ever built and the markup's static state is
 * what ships. The timeline also parks itself while the orb is off screen so
 * nothing is painting for a viewport nobody is looking at.
 */
export function Orb({
  uid,
  className = "",
  idle = true,
}: {
  /** Unique per instance: SVG gradient/filter ids are document-global. */
  uid: string;
  className?: string;
  /** Set false for a completely static instance. */
  idle?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);

  const gem = `orb-gem-${uid}`;
  const halo = `orb-halo-${uid}`;
  const rim = `orb-rim-${uid}`;

  useEffect(() => {
    const svg = ref.current;
    if (!svg || !idle) return;

    const mm = gsap.matchMedia();

    mm.add(MOTION_QUERIES, (ctx) => {
      // Reduced motion: nothing spins. The static markup is the final state.
      if (ctx.conditions?.reduced) return;

      const q = gsap.utils.selector(svg);
      const tweens = [
        // Different rings at different speeds, two of them counter-rotating,
        // so the sigil never reads as one rigid disc turning.
        gsap.to(q(".orb-ring-outer"), {
          rotation: 360,
          duration: 78,
          repeat: -1,
          ease: "none",
          svgOrigin: "120 120",
        }),
        gsap.to(q(".orb-ring-mid"), {
          rotation: -360,
          duration: 46,
          repeat: -1,
          ease: "none",
          svgOrigin: "120 120",
        }),
        gsap.to(q(".orb-ticks"), {
          rotation: 360,
          duration: 160,
          repeat: -1,
          ease: "none",
          svgOrigin: "120 120",
        }),
        gsap.to(q(".orb-gem"), {
          rotation: 360,
          duration: 30,
          repeat: -1,
          ease: "none",
          svgOrigin: "120 120",
        }),
        gsap.to(q(".orb-gem-inner"), {
          rotation: -360,
          duration: 19,
          repeat: -1,
          ease: "none",
          svgOrigin: "120 120",
        }),
        gsap.to(q(".orb-halo"), {
          scale: 1.07,
          opacity: 0.75,
          duration: 5.5,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          svgOrigin: "120 120",
        }),
      ];

      q(".orb-particle").forEach((p, i) => {
        tweens.push(
          gsap.to(p, {
            // Relative, so the baked-in starting angle above is preserved and
            // each repeat is a clean full turn from wherever it already is.
            rotation: i % 2 === 0 ? "+=360" : "-=360",
            duration: 14 + i * 7,
            repeat: -1,
            ease: "none",
            svgOrigin: "120 120",
          }),
        );
      });

      // Park the whole thing while it is off screen.
      let io: IntersectionObserver | null = null;
      if (typeof IntersectionObserver !== "undefined") {
        io = new IntersectionObserver(
          ([entry]) => {
            tweens.forEach((t) =>
              entry.isIntersecting ? t.play() : t.pause(),
            );
          },
          { rootMargin: "20% 0px" },
        );
        io.observe(svg);
      }

      return () => io?.disconnect();
    });

    return () => mm.revert();
  }, [idle]);

  // 60 ticks, every fifth long. Built here rather than hand-written so the
  // spacing is exact.
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * Math.PI * 2;
    const long = i % 5 === 0;
    const r1 = long ? 100 : 106;
    const r2 = 112;
    return {
      // Fixed precision, same as gemPts/gemInnerPts below: raw float output of
      // Math.cos/Math.sin can differ in its last bit between the server's and
      // the browser's engine, which is enough for React to flag a hydration
      // mismatch on every single tick. Rounding makes server and client emit
      // byte-identical strings regardless of that.
      x1: +(120 + Math.cos(a) * r1).toFixed(3),
      y1: +(120 + Math.sin(a) * r1).toFixed(3),
      x2: +(120 + Math.cos(a) * r2).toFixed(3),
      y2: +(120 + Math.sin(a) * r2).toFixed(3),
      long,
    };
  });

  // Regular octagon, r=34, for the gem body.
  const gemPts = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
    return `${(120 + Math.cos(a) * 34).toFixed(2)},${(120 + Math.sin(a) * 34).toFixed(2)}`;
  }).join(" ");

  const gemInnerPts = Array.from({ length: 3 }, (_, i) => {
    const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
    return `${(120 + Math.cos(a) * 19).toFixed(2)},${(120 + Math.sin(a) * 19).toFixed(2)}`;
  }).join(" ");

  return (
    <svg
      ref={ref}
      viewBox="0 0 240 240"
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      <defs>
        {/* Ignition. The gem is always this pair regardless of which section
            the sigil is currently sitting in — it is the seed's own identity,
            not the section's. */}
        <linearGradient id={gem} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffb08a" />
          <stop offset="38%" stopColor="var(--grad-seed-a)" />
          <stop offset="100%" stopColor="var(--grad-seed-b)" />
        </linearGradient>

        <linearGradient id={rim} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--grad-seed-a)" />
          <stop offset="100%" stopColor="var(--grad-seed-b)" />
        </linearGradient>

        {/* On white a "glow" is a soft, low-opacity colour wash. A neon
            text-shadow ported from the dark theme would read as a rendering
            fault here. */}
        <radialGradient id={halo} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--grad-seed-a)" stopOpacity="0.30" />
          <stop offset="48%" stopColor="var(--grad-seed-b)" stopOpacity="0.12" />
          <stop offset="100%" stopColor="var(--grad-seed-b)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle className="orb-halo" cx="120" cy="120" r="118" fill={`url(#${halo})`} />

      {/* perimeter reticle */}
      <g className="orb-ticks" stroke={`url(#${rim})`} strokeWidth="1.4">
        {ticks.map((t, i) => (
          <line
            key={i}
            x1={t.x1}
            y1={t.y1}
            x2={t.x2}
            y2={t.y2}
            strokeOpacity={t.long ? 0.7 : 0.32}
          />
        ))}
      </g>

      {/* rings — mixed solid and dashed, four radii */}
      <g className="orb-ring-outer" fill="none">
        <circle
          cx="120"
          cy="120"
          r="94"
          stroke={`url(#${rim})`}
          strokeOpacity="0.5"
          strokeWidth="1"
          strokeDasharray="1 7"
          strokeLinecap="round"
        />
        <path
          d="M 120 34 A 86 86 0 0 1 197 83"
          stroke={`url(#${rim})`}
          strokeOpacity="0.85"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M 120 206 A 86 86 0 0 1 43 157"
          stroke={`url(#${rim})`}
          strokeOpacity="0.55"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </g>

      <circle
        cx="120"
        cy="120"
        r="76"
        fill="none"
        stroke={`url(#${rim})`}
        strokeOpacity="0.32"
        strokeWidth="1"
      />

      <g className="orb-ring-mid" fill="none">
        <circle
          cx="120"
          cy="120"
          r="58"
          stroke={`url(#${rim})`}
          strokeOpacity="0.65"
          strokeWidth="1.25"
          strokeDasharray="14 9"
          strokeLinecap="round"
        />
      </g>

      {/* orbiting particles, four radii, four speeds */}
      {/* `angle` is a real starting offset baked into the markup, not just a
          nicety: under reduced motion nothing rotates, and without it all four
          particles would sit frozen at the same o'clock position and read as a
          rendering fault rather than a composed rest state. */}
      {[
        { r: 94, d: 3.2, a: 0.9, angle: 18 },
        { r: 76, d: 2.4, a: 0.75, angle: 205 },
        { r: 58, d: 2.8, a: 0.85, angle: 292 },
        { r: 110, d: 2.1, a: 0.6, angle: 128 },
      ].map((p, i) => (
        <g
          key={i}
          className="orb-particle"
          transform={`rotate(${p.angle} 120 120)`}
        >
          <circle
            cx={120 + p.r}
            cy={120}
            r={p.d}
            fill={i % 2 ? "var(--grad-seed-b)" : "var(--grad-seed-a)"}
            fillOpacity={p.a}
          />
        </g>
      ))}

      {/* faceted core */}
      <g className="orb-gem">
        <polygon
          points={gemPts}
          fill={`url(#${gem})`}
          stroke="var(--grad-seed-b)"
          strokeOpacity="0.55"
          strokeWidth="1"
        />
        {/* facet cuts */}
        <g stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1" fill="none">
          <path d="M120 86 L146 120 L120 154 L94 120 Z" />
          <line x1="94" y1="120" x2="146" y2="120" />
        </g>
      </g>

      <g className="orb-gem-inner">
        <polygon points={gemInnerPts} fill="#ffffff" fillOpacity="0.42" />
      </g>

      <circle cx="112" cy="110" r="4.5" fill="#ffffff" fillOpacity="0.9" />
    </svg>
  );
}
