"use client";

import { useEffect, useRef } from "react";
import { gsap, MOTION_QUERIES } from "@/lib/gsap";
import { GRAPH_NODES } from "@/lib/content";

/** The constellation's coordinate space. Must match `GraphSection`. */
const VB_W = 600;
const VB_H = 420;

/**
 * Human-readable names for the `type` already carried on every node in
 * `GRAPH_NODES`. These are the same three categories the section's legend
 * lists, spelled the same way, so the popup and the legend cannot drift.
 */
const TYPE_NAME: Record<string, string> = {
  PERSON: "Person",
  ORG: "Organization",
  LOCATION: "Location",
};

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.4,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/**
 * Hand-drawn line glyphs, deliberately NOT from an icon set.
 *
 * The whole page is drawn in one language: thin uniform strokes, no fills,
 * round caps, joints as small dots. Dropping in Lucide or Heroicons here would
 * have given three technically-correct icons that looked like they came from a
 * different product than the five wireframe personas sitting one section
 * below. Same stroke width and cap style as `WireframeFigures`.
 *
 * Organization is a pediment over three columns rather than the usual office
 * block — it rhymes with the classical plate on the intro screen and with the
 * name of the product.
 */
function TypeGlyph({ type }: { type: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
      role="presentation"
      className="shrink-0"
    >
      <g {...S}>
        {type === "PERSON" && (
          <>
            <circle cx="10" cy="6.4" r="3.1" />
            <path d="M3.7 16.6 C3.7 12.5 6.5 10.6 10 10.6 C13.5 10.6 16.3 12.5 16.3 16.6" />
          </>
        )}
        {type === "ORG" && (
          <>
            <path d="M2.5 7.3 L10 2.7 L17.5 7.3" />
            <path d="M4.8 8.6 L4.8 15.3" />
            <path d="M10 8.6 L10 15.3" />
            <path d="M15.2 8.6 L15.2 15.3" />
            <path d="M2.9 17.1 L17.1 17.1" />
          </>
        )}
        {type === "LOCATION" && (
          <>
            <path d="M2.6 15.4 L7.3 8.1 L10.4 12.5 L13 9.3 L17.4 15.4" />
            <path d="M2.2 17.3 L17.8 17.3" />
          </>
        )}
      </g>
    </svg>
  );
}

/**
 * An interactive layer of hotspots sitting exactly over the decorative
 * constellation, one per node.
 *
 * ACCESSIBILITY. The SVG underneath is and stays `aria-hidden` decoration.
 * These are real `<button>`s whose accessible name comes from their own
 * content — the visible "Person" / "Organization" / "Location" text inside the
 * popup, which is present in the DOM at all times and only hidden visually by
 * opacity. So the entity type is announced on focus whether or not the popup
 * has faded in, and the glyph beside it is `aria-hidden` because it is a
 * second rendering of that same word.
 *
 * NOT HOVER-ONLY. Pointer enter/leave, focus/blur and click all drive the same
 * two calls, so it works with a mouse, with a keyboard, and on touch (a tap
 * focuses the button, which shows the popup; a tap elsewhere blurs it).
 *
 * The container is positioned in percentages of the same 600x420 space the
 * constellation is drawn in, and the constellation's box is locked to that
 * aspect ratio, so a hotspot stays on its node at every width without any
 * measurement.
 */
export function GraphNodeTypes() {
  const root = useRef<HTMLDivElement>(null);
  /** Set by matchMedia. 0 under reduced motion: the popup just appears. */
  const dur = useRef(0.16);

  useEffect(() => {
    const scope = root.current;
    if (!scope) return;

    const pops = Array.from(scope.querySelectorAll<HTMLElement>(".gnode-pop"));
    gsap.set(pops, { opacity: 0, scale: 0.86, y: 5, transformOrigin: "50% 100%" });

    const mm = gsap.matchMedia();
    mm.add(MOTION_QUERIES, (ctx) => {
      dur.current = ctx.conditions?.reduced ? 0 : 0.16;
    });

    return () => {
      mm.revert();
      gsap.killTweensOf(pops);
    };
  }, []);

  const toggle = (el: HTMLElement | null, on: boolean) => {
    const pop = el?.querySelector<HTMLElement>(".gnode-pop");
    if (!pop) return;
    gsap.to(pop, {
      opacity: on ? 1 : 0,
      scale: on ? 1 : 0.86,
      y: on ? 0 : 5,
      duration: dur.current,
      ease: "power2.out",
      overwrite: true,
    });
  };

  return (
    <div ref={root} className="absolute inset-0 z-10">
      {GRAPH_NODES.map((n) => {
        const name = TYPE_NAME[n.label] ?? n.label;
        return (
          <button
            key={n.id}
            type="button"
            className="gnode-hot"
            style={{
              left: `${(n.x / VB_W) * 100}%`,
              top: `${(n.y / VB_H) * 100}%`,
            }}
            onPointerEnter={(e) => toggle(e.currentTarget, true)}
            onPointerLeave={(e) => toggle(e.currentTarget, false)}
            onFocus={(e) => toggle(e.currentTarget, true)}
            onBlur={(e) => toggle(e.currentTarget, false)}
            onClick={(e) => toggle(e.currentTarget, true)}
          >
            <span className="gnode-pop-anchor">
              <span className="gnode-pop">
                <TypeGlyph type={n.label} />
                {name}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
