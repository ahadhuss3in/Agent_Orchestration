"use client";

import { useEffect, useState } from "react";
import { STAGES } from "@/lib/content";

/** Compact HUD spellings. Full names live in each link's aria-label. */
const SHORT: Record<string, string> = {
  seed: "SEED",
  graph: "GRAPH",
  agents: "AGENTS",
  simulation: "SIM",
  chat: "CHAT",
  recap: "RECAP",
};

/**
 * The active marker takes the in-view section's own gradient pair, which is
 * what makes the rail read as a colour legend for the page rather than a
 * decorative list. Recap gets the Spectrum sweep, same as the footer.
 */
const MARKER: Record<string, string> = {
  seed: "linear-gradient(140deg, var(--grad-seed-a), var(--grad-seed-b))",
  graph: "linear-gradient(140deg, var(--grad-graph-a), var(--grad-graph-b))",
  agents: "linear-gradient(140deg, var(--grad-agents-a), var(--grad-agents-b))",
  simulation: "linear-gradient(140deg, var(--grad-sim-a), var(--grad-sim-b))",
  chat: "linear-gradient(140deg, var(--grad-chat-a), var(--grad-chat-b))",
  recap: "var(--grad-recap)",
};

/**
 * Left rail on desktop, top progress bar under 1024px. The HUD-rail
 * navigation concept is carried over from v1 unchanged; only its colour
 * behaviour is new.
 *
 * Driven off real scroll position rather than a decorative list. Section
 * rects are read live each frame, which is what makes it survive the pinned
 * Simulation section: while that section is pinned its rect stays at the top
 * of the viewport, which is exactly the "currently active" signal we want.
 */
export function HudRail() {
  const [active, setActive] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const sections = STAGES.map((s) => document.getElementById(s.id));
    const hero = document.getElementById("top");
    const footer = document.getElementById("page-footer");

    let frame = 0;

    const measure = () => {
      frame = 0;
      const vh = window.innerHeight;
      const marker = vh * 0.45;

      // Active stage: the last section whose top edge has crossed the marker.
      let next = 0;
      for (let i = 0; i < sections.length; i++) {
        const el = sections[i];
        if (el && el.getBoundingClientRect().top <= marker) next = i;
      }
      setActive(next);

      // Overall fill: hero bottom through footer top. Neither element is ever
      // pinned, so these two document positions stay honest even though the
      // pin-spacer changes the page height in between.
      if (hero && footer) {
        const scrollY = window.scrollY;
        const from = hero.getBoundingClientRect().bottom + scrollY;
        const to = footer.getBoundingClientRect().top + scrollY;
        const span = to - from;
        const p = span > 0 ? (scrollY + vh - from) / span : 0;
        setProgress(Math.min(1, Math.max(0, p)));
      }
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const current = STAGES[active];

  return (
    <>
      {/* ---------------- desktop: vertical rail ---------------- */}
      <nav
        aria-label="Pipeline stages"
        className="fixed left-0 top-0 z-40 hidden h-dvh w-[88px] flex-col border-r border-line bg-raised lg:flex"
      >
        <div className="border-b border-line px-3 py-4 text-center">
          <span className="hud-label text-ink-dim">TRACE</span>
        </div>

        <ol className="relative flex flex-1 flex-col justify-center gap-1 px-2">
          {/* connector spine */}
          <span
            aria-hidden="true"
            className="absolute left-1/2 bottom-10 top-10 w-px -translate-x-1/2 bg-[color:var(--line)]"
          />

          {STAGES.map((stage, i) => {
            const isActive = i === active;
            const isDone = i < active;
            return (
              <li key={stage.id} className="relative">
                <a
                  href={`#${stage.id}`}
                  aria-label={`Stage ${stage.index}, ${stage.label}`}
                  aria-current={isActive ? "true" : undefined}
                  className="group flex flex-col items-center gap-2 rounded-sm py-3 transition-colors"
                >
                  <span
                    aria-hidden="true"
                    className={[
                      "relative z-10 grid h-[18px] w-[18px] place-items-center border bg-raised transition-all duration-300",
                      isActive
                        ? "rotate-45 border-[color:var(--line-strong)]"
                        : isDone
                          ? "border-[color:var(--line-strong)]"
                          : "border-line group-hover:border-[color:var(--line-strong)]",
                    ].join(" ")}
                    style={
                      isActive
                        ? {
                            // Vivid gradient for identity, plus a dark hairline
                            // so the marker's own edge still has a legible
                            // boundary against the light panel behind it.
                            background: MARKER[stage.id],
                            boxShadow: "0 6px 16px -8px rgba(11,11,16,0.45)",
                          }
                        : isDone
                          ? { background: MARKER[stage.id], opacity: 0.4 }
                          : undefined
                    }
                  />
                  <span
                    className={[
                      "hud-label transition-colors duration-300",
                      isActive ? "text-ink" : "text-ink-dim group-hover:text-ink",
                    ].join(" ")}
                  >
                    {SHORT[stage.id]}
                  </span>
                </a>
              </li>
            );
          })}
        </ol>

        <div className="border-t border-line px-3 py-4 text-center">
          <span className="hud-label text-ink-dim tabular-nums">
            {current.index}/06
          </span>
        </div>
      </nav>

      {/* ---------------- under 1024px: top progress bar ---------------- */}
      <div
        className="fixed inset-x-0 top-0 z-40 lg:hidden"
        aria-label="Pipeline stages"
        role="navigation"
      >
        <div className="h-[3px] w-full bg-raised">
          <div
            className="h-full origin-left transition-[width] duration-150 ease-out"
            style={{ width: `${progress * 100}%`, background: "var(--grad-recap)" }}
          />
        </div>
        <div className="flex items-center justify-between border-b border-line bg-paper/90 px-4 py-1.5 backdrop-blur-sm">
          <span className="hud-label text-ink-dim">PANTHEON</span>
          <a
            href={`#${current.id}`}
            className="hud-label text-ink"
            aria-label={`Current stage: ${current.index}, ${current.label}`}
          >
            <span aria-hidden="true" className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rotate-45 rounded-[1px]"
                style={{ background: MARKER[current.id] }}
              />
              {SHORT[current.id]}
            </span>
          </a>
        </div>
      </div>
    </>
  );
}
