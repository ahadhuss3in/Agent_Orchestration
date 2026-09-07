"use client";

import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger, MOTION_QUERIES } from "@/lib/gsap";
import { spectrumAt } from "@/lib/spectrum";

/**
 * Grid sizes tried in order, in canvas pixels. Sampling starts dense and
 * steps coarser until the point count fits under MAX_DOTS.
 */
const GRIDS = [4, 5, 6, 7, 8, 10, 12];
/** Target dot count. The brief asks for roughly 300-600. */
const MAX_DOTS = 600;

/**
 * Client feedback #7 — scattered seed dots converge into the word PANTHEON.
 *
 * This is real canvas pixel sampling, not a pre-baked coordinate list:
 *
 *   1. The word is drawn to an offscreen canvas in Orbitron 900 at whatever
 *      size fits the container, after `document.fonts.load` has actually
 *      resolved that face — sampling before the webfont lands would trace the
 *      fallback's letterforms instead.
 *   2. `getImageData` is read back on a regular grid and every cell whose
 *      alpha clears the threshold becomes a target point. The grid step is
 *      chosen adaptively — 4px, then coarser — until the raw count already
 *      fits the target, which keeps every point on a regular lattice.
 *   3. One dot element per point, coloured by sampling `--grad-recap` at the
 *      dot's own horizontal position, so the finished word carries the
 *      Spectrum sweep across it.
 *   4. On scroll into view every dot tweens from a random scatter offset to
 *      its target, with per-dot duration and delay jitter so the formation
 *      settles organically rather than snapping as one block.
 *
 * The real word is always in the DOM as text. When the formation runs, that
 * text is only made visually transparent — it keeps its place in the
 * accessibility tree, so this reads as the word "Pantheon" to a screen reader
 * whether or not the canvas trick worked. If sampling fails for any reason
 * (no 2D context, font never resolves, zero-width container) the text simply
 * stays visible and nothing else happens.
 *
 * Reduced motion: no canvas work is done at all and no dot is created. The
 * styled text is the whole feature.
 */
export function ParticleWordmark() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scope = root.current;
    if (!scope) return;

    let mm: ReturnType<typeof gsap.matchMedia> | null = null;
    let cancelled = false;

    const boot = () => {
      if (cancelled || !root.current) return;
      const s = root.current;

      mm = gsap.matchMedia();

      mm.add(MOTION_QUERIES, (ctx) => {
        // Reduced motion: skip the sampling and the animation entirely.
        if (ctx.conditions?.reduced) return;

        const layer = s.querySelector<HTMLElement>(".pw-dots");
        const fallback = s.querySelector<HTMLElement>(".pw-fallback");
        if (!layer || !fallback) return;

        let ro: ResizeObserver | null = null;
        let trigger: ScrollTrigger | null = null;
        let dots: HTMLElement[] = [];
        let formed = false;
        let lastWidth = 0;

        /** Sample the word to a point set. Returns [] if it cannot. */
        const sample = (w: number, h: number) => {
          const canvas = document.createElement("canvas");
          const dpr = 1; // sampling resolution is set by GRID, not by DPR
          canvas.width = Math.floor(w * dpr);
          canvas.height = Math.floor(h * dpr);
          const cxt = canvas.getContext("2d", { willReadFrequently: true });
          if (!cxt) return [];

          // Fit the word to the box: measure at a reference size, then scale.
          const REF = 100;
          cxt.font = `900 ${REF}px Orbitron, sans-serif`;
          const refW = cxt.measureText("PANTHEON").width;
          if (!refW) return [];
          const size = Math.min((w * 0.92 * REF) / refW, h * 0.8);

          cxt.clearRect(0, 0, canvas.width, canvas.height);
          cxt.font = `900 ${size}px Orbitron, sans-serif`;
          cxt.textAlign = "center";
          cxt.textBaseline = "middle";
          cxt.fillStyle = "#000";
          cxt.fillText("PANTHEON", canvas.width / 2, canvas.height / 2);

          let data: Uint8ClampedArray;
          try {
            data = cxt.getImageData(0, 0, canvas.width, canvas.height).data;
          } catch {
            return [];
          }

          /**
           * Pick the grid rather than the sample.
           *
           * Sampling on a fixed grid and then striding the resulting array
           * down to a cap does hit the target count, but it drops points in
           * row-major order, which knocks alternate rows out of phase and
           * leaves the word looking like diagonal noise. Stepping the grid
           * coarser until the raw count already fits keeps every point on a
           * regular lattice, so the letters read as a clean stipple.
           */
          const collect = (grid: number) => {
            const pts: { x: number; y: number }[] = [];
            for (let y = 0; y < canvas.height; y += grid) {
              for (let x = 0; x < canvas.width; x += grid) {
                if (data[(y * canvas.width + x) * 4 + 3] > 128) {
                  pts.push({ x, y });
                }
              }
            }
            return pts;
          };

          let pts = collect(GRIDS[0]);
          for (let i = 1; i < GRIDS.length && pts.length > MAX_DOTS; i++) {
            pts = collect(GRIDS[i]);
          }
          return pts;
        };

        const build = () => {
          const rect = s.getBoundingClientRect();
          const w = Math.round(rect.width);
          const h = Math.round(rect.height);
          if (w < 40 || h < 20) return false;

          const pts = sample(w, h);
          if (pts.length < 40) return false;

          layer.replaceChildren();
          dots = pts.map((p) => {
            const d = document.createElement("span");
            d.className = "pw-dot";
            d.style.left = `${p.x}px`;
            d.style.top = `${p.y}px`;
            d.style.background = spectrumAt(p.x / w);
            layer.appendChild(d);
            return d;
          });
          lastWidth = w;
          return true;
        };

        /**
         * Scatter start positions are picked as absolute points inside the
         * container and then expressed as an offset from each dot's target,
         * rather than as a free-floating random offset. Same look, but every
         * dot is guaranteed to start inside the box: an unbounded offset put
         * dots up to 500px past the right edge, which showed up as real
         * horizontal overflow at 1440 in the scroll check.
         */
        const scatter = () => {
          const rect = s.getBoundingClientRect();
          gsap.set(dots, {
            x: (_i: number, el: HTMLElement) =>
              gsap.utils.random(4, rect.width - 4) - parseFloat(el.style.left),
            y: (_i: number, el: HTMLElement) =>
              gsap.utils.random(4, rect.height - 4) - parseFloat(el.style.top),
            scale: () => gsap.utils.random(0.4, 1.3),
            opacity: 0,
          });
        };

        const form = () => {
          formed = true;
          gsap.to(dots, {
            x: 0,
            y: 0,
            scale: 1,
            opacity: 1,
            // Per-dot jitter is what stops the whole set arriving as one
            // rigid block.
            duration: () => gsap.utils.random(0.9, 1.7),
            delay: () => gsap.utils.random(0, 0.5),
            ease: "power3.out",
          });
          gsap.to(fallback, { opacity: 0, duration: 0.6, delay: 0.25 });
        };

        if (!build()) return;

        // The word is hidden only once we know we actually have dots to
        // replace it with.
        gsap.set(fallback, { opacity: 1 });
        scatter();

        trigger = ScrollTrigger.create({
          trigger: s,
          start: "top 78%",
          once: true,
          onEnter: form,
        });

        if (typeof ResizeObserver !== "undefined") {
          ro = new ResizeObserver(() => {
            const w = Math.round(s.getBoundingClientRect().width);
            if (Math.abs(w - lastWidth) < 24) return;
            if (!build()) return;
            if (formed) {
              // Already spelled out: re-place instantly at the new size
              // rather than replaying the formation under the reader.
              gsap.set(dots, { x: 0, y: 0, scale: 1, opacity: 1 });
            } else {
              scatter();
            }
          });
          ro.observe(s);
        }

        return () => {
          ro?.disconnect();
          trigger?.kill();
          gsap.killTweensOf(dots);
          layer.replaceChildren();
          gsap.set(fallback, { opacity: 1, clearProps: "opacity" });
        };
      });
    };

    // Orbitron has to be resolved before the canvas is traced, or the sample
    // follows the fallback face's letterforms.
    if (document.fonts) {
      document.fonts
        .load('900 100px "Orbitron"')
        .then(() => document.fonts.ready)
        .then(boot)
        .catch(boot);
    } else {
      boot();
    }

    return () => {
      cancelled = true;
      mm?.revert();
    };
  }, []);

  return (
    <div
      ref={root}
      className="relative mx-auto h-[26vw] max-h-[220px] min-h-[92px] w-full max-w-[1000px]"
    >
      <div aria-hidden="true" className="pw-dots absolute inset-0" />
      <p className="pw-fallback display absolute inset-0 flex items-center justify-center text-[11vw] leading-none text-ink sm:text-[9vw] lg:text-[clamp(3rem,8vw,7rem)]">
        PANTHEON
      </p>
    </div>
  );
}
