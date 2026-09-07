"use client";

import { useEffect, useRef, useState } from "react";
import { gsap, MOTION_QUERIES } from "@/lib/gsap";
import { baseReveal } from "@/lib/reveal";
import { bodyLineReveal } from "@/lib/textAnim";
import { FAQS } from "@/lib/content";

/**
 * Which item is expanded on first paint.
 *
 * Deliberately a module constant and not state. React must render the same
 * collapsed geometry on the server and on the first client pass, and after
 * that GSAP owns `height` / `visibility` on every panel — if the JSX kept
 * re-declaring those from state, each toggle would snap to the end value a
 * frame before the tween that was supposed to animate it.
 */
const INITIAL_OPEN = 0;

/**
 * The FAQ, with a jump chip in every answer.
 *
 * ACCORDION MECHANICS. One panel open at a time, which is what makes the
 * chips read as a route through the page rather than six loose links. Every
 * trigger is a real `<button>` inside its heading, carrying `aria-expanded`
 * and `aria-controls` pointed at the panel's `id`; the panel is a labelled
 * region. Collapsed panels go to `visibility: hidden`, so their content leaves
 * both the tab order and the accessibility tree instead of lurking at zero
 * height.
 *
 * WITH JAVASCRIPT OFF the first answer is open and the rest are collapsed —
 * this is the one place on the page whose no-JS state is not the complete
 * state. It is a deliberate trade: the alternative is rendering all six
 * expanded and collapsing them on mount, which flashes a full-height list on
 * every load. Nothing here is load-bearing information; the Recap section
 * still explains the whole product end to end with no JS and no CSS.
 *
 * REDUCED MOTION follows the same convention as the rest of the page: the
 * matchMedia branch keeps the height and opacity changes but runs them at zero
 * duration, so the accordion still works and simply never animates.
 */
export function FaqSection() {
  const root = useRef<HTMLElement>(null);
  const panels = useRef<(HTMLDivElement | null)[]>([]);
  const markers = useRef<(SVGSVGElement | null)[]>([]);
  const [open, setOpen] = useState<number | null>(INITIAL_OPEN);
  /** Set by matchMedia; 0 under reduced motion. */
  const dur = useRef(0.42);
  /** Skip the very first effect pass — nothing has changed to animate yet. */
  const booted = useRef(false);

  useEffect(() => {
    const scope = root.current;
    if (!scope) return;

    let mm: ReturnType<typeof gsap.matchMedia> | null = null;
    let cancelled = false;

    const setup = () => {
      if (cancelled || !root.current) return;
      const s = root.current;

      mm = gsap.matchMedia();
      mm.add(MOTION_QUERIES, (ctx) => {
        const reduced = Boolean(ctx.conditions?.reduced);
        dur.current = reduced ? 0 : 0.42;
        baseReveal(s, reduced);
        if (reduced) return;

        const body = Array.from(s.querySelectorAll<HTMLElement>(".faq-body"));
        return bodyLineReveal(body, s);
      });
    };

    if (document.fonts && document.fonts.status !== "loaded") {
      document.fonts.ready.then(setup);
    } else {
      setup();
    }

    return () => {
      cancelled = true;
      mm?.revert();
    };
  }, []);

  useEffect(() => {
    if (!booted.current) {
      booted.current = true;
      return;
    }

    const d = dur.current;

    panels.current.forEach((panel, i) => {
      if (!panel) return;
      const isOpen = i === open;
      gsap.killTweensOf(panel);

      if (isOpen) {
        // `visibility` first so the panel is measurable and reachable before
        // it starts growing; `height: auto` lets GSAP measure the natural
        // height itself and tween to it, which keeps the answer reflowing
        // correctly at any width instead of being pinned to a cached number.
        gsap.set(panel, { visibility: "visible" });
        gsap.to(panel, {
          height: "auto",
          opacity: 1,
          duration: d,
          ease: "power2.inOut",
        });
        // `querySelectorAll`, not `querySelector`: one answer now carries a
        // second, external chip beside its in-page jump, and a single-element
        // query left that one sitting at whatever opacity it was last given.
        const chips = Array.from(
          panel.querySelectorAll<HTMLElement>(".faq-jump"),
        );
        if (chips.length) {
          gsap.fromTo(
            chips,
            { opacity: 0, x: -10 },
            {
              opacity: 1,
              x: 0,
              duration: d,
              delay: d * 0.4,
              ease: "power2.out",
              stagger: d * 0.25,
            },
          );
        }
      } else {
        gsap.to(panel, {
          height: 0,
          opacity: 0,
          duration: d,
          ease: "power2.inOut",
          onComplete: () => gsap.set(panel, { visibility: "hidden" }),
        });
      }
    });

    markers.current.forEach((marker, i) => {
      if (!marker) return;
      gsap.to(marker, {
        rotation: i === open ? 180 : 0,
        duration: d,
        ease: "power2.inOut",
        transformOrigin: "50% 50%",
      });
    });
  }, [open]);

  return (
    <section
      id="faq"
      ref={root}
      aria-labelledby="faq-heading"
      className="sec-chat sec-open relative py-24 lg:py-32"
    >
      <div
        aria-hidden="true"
        className="sec-wash"
        style={{ "--wash-x": "22%", "--wash-y": "24%" } as React.CSSProperties}
      />

      <div className="relative mx-auto w-full max-w-[1440px] px-6 sm:px-8 lg:px-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
          <div>
            <span className="stage-rule reveal-target mb-8" aria-hidden="true" />
            <h2
              id="faq-heading"
              className="reveal-target display-sm max-w-[15ch] text-[clamp(1.6rem,3.6vw,2.5rem)] text-ink"
            >
              The questions this page keeps getting.
            </h2>
            <p className="faq-body mt-7 max-w-[46ch] font-mono text-[14px] leading-relaxed text-ink-dim">
              Answered against what the engine actually does, and what this
              page actually is. Every answer ends somewhere you can go and look
              at the thing it describes.
            </p>
          </div>

          <ul className="reveal-target">
            {FAQS.map((item, i) => {
              const panelId = `faq-panel-${i}`;
              const triggerId = `faq-trigger-${i}`;
              const isOpen = i === open;
              return (
                <li key={item.q} className="faq-item">
                  <h3>
                    <button
                      type="button"
                      id={triggerId}
                      className="faq-trigger"
                      aria-expanded={isOpen}
                      aria-controls={panelId}
                      onClick={() => setOpen(isOpen ? null : i)}
                    >
                      <span className="faq-q display-sm text-[15px] leading-snug sm:text-base">
                        {item.q}
                      </span>
                      <svg
                        ref={(el) => {
                          markers.current[i] = el;
                        }}
                        className="faq-marker"
                        width="14"
                        height="14"
                        viewBox="0 0 14 14"
                        aria-hidden="true"
                        focusable="false"
                        role="presentation"
                        style={
                          i === INITIAL_OPEN
                            ? { transform: "rotate(180deg)" }
                            : undefined
                        }
                      >
                        <path
                          d="M2.5 5 L7 9.5 L11.5 5"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </button>
                  </h3>

                  <div
                    ref={(el) => {
                      panels.current[i] = el;
                    }}
                    id={panelId}
                    role="region"
                    aria-labelledby={triggerId}
                    className="faq-panel"
                    style={
                      i === INITIAL_OPEN
                        ? undefined
                        : { height: 0, opacity: 0, visibility: "hidden" }
                    }
                  >
                    <div className="pb-6">
                      <p className="max-w-[58ch] font-mono text-[13.5px] leading-relaxed text-ink-dim">
                        {item.a}
                      </p>
                      <div className="mt-[1.1rem] flex flex-wrap items-center gap-3">
                        <a className="faq-jump" href={item.jump.href}>
                          <span aria-hidden="true">&rarr;</span>
                          {item.jump.label}
                        </a>
                        {/* The one answer that sends you off the page gets a
                            second chip rather than replacing the first: the
                            in-page jump is what makes this list a tour, and
                            swapping it for an external link on the question
                            people most want a real answer to would cost that.
                            `target="_blank"` because it leaves the page, so
                            `rel` carries both noopener and noreferrer, and the
                            label says GitHub in words — the arrow glyph is
                            decorative and hidden from the accessibility tree,
                            so the link is never announced as just "arrow". */}
                        {item.ext && (
                          <a
                            className="faq-jump faq-jump-ext"
                            href={item.ext.href}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <span aria-hidden="true">&#8599;</span>
                            {item.ext.label}
                            <span className="sr-only"> (opens in a new tab)</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
