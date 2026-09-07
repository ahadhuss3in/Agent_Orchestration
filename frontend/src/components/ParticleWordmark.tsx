"use client";

import { useEffect, useRef } from "react";
import { gsap, ScrollTrigger, MOTION_QUERIES } from "@/lib/gsap";
import { spectrumAt } from "@/lib/spectrum";
import { SeedCore } from "./SeedCore";

/**
 * Grid sizes tried in order, in canvas pixels. Sampling starts dense and
 * steps coarser until the point count fits under MAX_DOTS.
 */
const GRIDS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10, 12];
/**
 * Client feedback: "increase the density of the dots by atleast 30x." The
 * v1/v2 target was ~300-600 dots (MAX_DOTS 600). 20,000 is exactly 33x that
 * floor, with room under it for smaller boxes where the adaptive grid search
 * bottoms out before reaching this cap.
 */
const MAX_DOTS = 20000;

/** Cursor-repulsion tuning, all in CSS px / frame units. */
const REPEL_RADIUS = 68;
const REPEL_RADIUS_SQ = REPEL_RADIUS * REPEL_RADIUS;
const PUSH_STRENGTH = 15;
const OFFSET_DECAY = 0.9;
const MAX_OFFSET = 42;

type Particle = {
  tx: number;
  ty: number;
  offX: number;
  offY: number;
  startOffX: number;
  startOffY: number;
  startScale: number;
  curScale: number;
  curAlpha: number;
  delay: number;
  dur: number;
  colorRGB: string;
};

/**
 * Client feedback #7 — scattered seed dots converge into the word PANTHEON.
 *
 * v2 rendered one absolutely-positioned <span> per dot and drove each with
 * its own GSAP tween, capped at ~600 dots because that is roughly where
 * per-element DOM/GSAP overhead starts to cost real frames. The brief now
 * asks for at least 30x that density AND a continuous per-frame physics
 * response to the cursor — either alone would strain the DOM approach, and
 * the two together would not run at 60fps as separate elements. This is a
 * full rewrite onto a single <canvas>, redrawn every frame with a plain
 * `requestAnimationFrame` loop instead of per-element GSAP tweens:
 *
 *   1. The word is still sampled from a real offscreen canvas trace in
 *      Orbitron 900, after `document.fonts.load` resolves — unchanged
 *      mechanic, just a much finer adaptive grid (down to 1px) and a 20,000
 *      point cap instead of 600.
 *   2. Particle state lives in a plain array of small objects, not DOM
 *      nodes — target position, a spring-style offset from that target, and
 *      per-particle formation timing jitter.
 *   3. One `requestAnimationFrame` loop does both jobs the old code split
 *      across GSAP tweens: during formation it eases each particle's offset
 *      from its scatter start down to zero on its own delay/duration; once
 *      formed, the same offset field is instead driven by distance to the
 *      pointer, so dots within `REPEL_RADIUS` push away and ease back the
 *      moment the pointer leaves. Unifying "arriving" and "fleeing the
 *      cursor" onto the same offset value means there is only ever one
 *      source of truth for where a dot actually is.
 *   4. Drawing is batched by colour: particles are bucketed once (by their
 *      position along the Spectrum sweep) so each frame sets `fillStyle`
 *      ~24 times total rather than once per particle, which is what keeps
 *      20,000 `fillRect` calls a frame cheap.
 *
 * The real word is always in the DOM as text, and the canvas is
 * `aria-hidden`. When the formation runs, the text is only made visually
 * transparent, so this reads as the word "Pantheon" to a screen reader
 * whether or not the canvas trick ran at all. If sampling fails for any
 * reason the text simply stays visible and no canvas work happens.
 *
 * Reduced motion: no canvas is created, no rAF loop starts, no pointer
 * listener is attached. The styled text is the whole feature.
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
        // Reduced motion: skip the sampling, the canvas, and the loop.
        if (ctx.conditions?.reduced) return;

        const canvas = s.querySelector<HTMLCanvasElement>(".pw-canvas");
        const fallback = s.querySelector<HTMLElement>(".pw-fallback");
        const core = s.querySelector<HTMLElement>(".pw-seed");
        if (!canvas || !fallback) return;

        const g2d = canvas.getContext("2d");
        if (!g2d) return;

        let ro: ResizeObserver | null = null;
        let trigger: ScrollTrigger | null = null;
        let rafId = 0;
        let particles: Particle[] = [];
        let buckets: Particle[][] = [];
        let boxW = 0;
        let boxH = 0;
        let dotRadius = 1;
        let phase: "idle" | "scattered" | "forming" | "formed" = "idle";
        let formStart = 0;
        let lastWidth = 0;
        let pointerX: number | null = null;
        let pointerY: number | null = null;

        const BUCKET_COUNT = 24;

        /** Sample the word to a point set at CSS-pixel resolution. */
        const sample = (w: number, h: number) => {
          const sampler = document.createElement("canvas");
          sampler.width = Math.max(1, Math.floor(w));
          sampler.height = Math.max(1, Math.floor(h));
          const cxt = sampler.getContext("2d", { willReadFrequently: true });
          if (!cxt) return { pts: [] as { x: number; y: number }[], grid: 1 };

          const REF = 100;
          cxt.font = `900 ${REF}px Orbitron, sans-serif`;
          const refW = cxt.measureText("PANTHEON").width;
          if (!refW) return { pts: [], grid: 1 };
          const size = Math.min((w * 0.92 * REF) / refW, h * 0.8);

          cxt.clearRect(0, 0, sampler.width, sampler.height);
          cxt.font = `900 ${size}px Orbitron, sans-serif`;
          cxt.textAlign = "center";
          cxt.textBaseline = "middle";
          cxt.fillStyle = "#000";
          cxt.fillText("PANTHEON", sampler.width / 2, sampler.height / 2);

          let data: Uint8ClampedArray;
          try {
            data = cxt.getImageData(0, 0, sampler.width, sampler.height).data;
          } catch {
            return { pts: [], grid: 1 };
          }

          // Step the grid coarser until the raw count already fits under the
          // cap, rather than sampling fine and slicing the array down — a
          // slice drops points in row-major order, which knocks alternate
          // rows out of phase and reads as diagonal noise instead of a clean
          // stipple of the letterforms.
          const collect = (grid: number) => {
            const pts: { x: number; y: number }[] = [];
            const step = Math.max(1, Math.round(grid));
            for (let y = 0; y < sampler.height; y += step) {
              for (let x = 0; x < sampler.width; x += step) {
                if (data[(y * sampler.width + x) * 4 + 3] > 128) {
                  pts.push({ x, y });
                }
              }
            }
            return pts;
          };

          let grid = GRIDS[0];
          let pts = collect(grid);
          for (let i = 1; i < GRIDS.length && pts.length > MAX_DOTS; i++) {
            grid = GRIDS[i];
            pts = collect(grid);
          }
          return { pts, grid };
        };

        const build = () => {
          const rect = s.getBoundingClientRect();
          const w = Math.round(rect.width);
          const h = Math.round(rect.height);
          if (w < 40 || h < 20) return false;

          const { pts, grid } = sample(w, h);
          if (pts.length < 40) return false;

          const dpr = Math.min(2, window.devicePixelRatio || 1);
          canvas.width = Math.round(w * dpr);
          canvas.height = Math.round(h * dpr);
          canvas.style.width = `${w}px`;
          canvas.style.height = `${h}px`;
          g2d.setTransform(dpr, 0, 0, dpr, 0, 0);

          boxW = w;
          boxH = h;
          dotRadius = Math.max(0.55, grid * 0.3);

          particles = pts.map((p) => ({
            tx: p.x,
            ty: p.y,
            offX: 0,
            offY: 0,
            startOffX: 0,
            startOffY: 0,
            startScale: gsap.utils.random(0.2, 0.6),
            curScale: 1,
            curAlpha: 1,
            delay: gsap.utils.random(0, 0.5),
            dur: gsap.utils.random(0.9, 1.7),
            colorRGB: spectrumAt(p.x / w),
          }));

          // Bucket once per build: sorted by target x, sliced into equal
          // runs. Colour already tracks x (the Spectrum sweep), so a
          // contiguous run in x-sorted order is also a contiguous run in
          // colour, which is what lets each bucket share one fillStyle. Only
          // used once formed — during the brief forming transition each
          // particle's alpha differs, so that phase draws unbatched instead.
          const byX = [...particles].sort((a, b) => a.tx - b.tx);
          buckets = [];
          const per = Math.ceil(byX.length / BUCKET_COUNT) || 1;
          for (let i = 0; i < byX.length; i += per) {
            buckets.push(byX.slice(i, i + per));
          }

          lastWidth = w;
          return true;
        };

        /**
         * Every dot starts inside the seed core, same lineage device v2
         * introduced: a disc at the box centre, sampled by sqrt so points
         * spread evenly over the area instead of piling up in the middle.
         */
        const scatter = () => {
          const cx = boxW / 2;
          const cy = boxH / 2;
          const spread = (core?.getBoundingClientRect().width ?? 64) * 0.42;
          for (const p of particles) {
            const a = gsap.utils.random(0, Math.PI * 2);
            const r = Math.sqrt(gsap.utils.random(0, 1)) * spread;
            const sx = cx + Math.cos(a) * r;
            const sy = cy + Math.sin(a) * r;
            p.startOffX = sx - p.tx;
            p.startOffY = sy - p.ty;
            p.offX = p.startOffX;
            p.offY = p.startOffY;
            p.curScale = p.startScale;
            // Invisible while clustered, same as v2's `opacity: 0` on the
            // scattered dots — only the seed core shows until formation
            // actually starts.
            p.curAlpha = 0;
          }
          phase = "scattered";
        };

        const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

        const drawFrame = () => {
          g2d.clearRect(0, 0, boxW, boxH);

          // Scattered: nothing paints — the cluster is invisible until
          // `form()` starts fading it in, matching v2.
          if (phase === "scattered") return;

          if (phase === "forming") {
            // Alpha differs per particle during the transition, so this
            // phase draws unbatched. It only lasts ~2s once per page view.
            for (const p of particles) {
              if (p.curAlpha <= 0) continue;
              const x = p.tx + p.offX;
              const y = p.ty + p.offY;
              const r = dotRadius * p.curScale;
              g2d.fillStyle = p.curAlpha >= 1
                ? p.colorRGB
                : p.colorRGB.replace("rgb(", "rgba(").replace(")", `, ${p.curAlpha})`);
              g2d.fillRect(x - r, y - r, r * 2, r * 2);
            }
            return;
          }

          // Formed: fully opaque and batched by colour bucket, since this is
          // the steady state the cursor-repulsion loop redraws every frame.
          for (const bucket of buckets) {
            if (!bucket.length) continue;
            g2d.fillStyle = bucket[0].colorRGB;
            for (const p of bucket) {
              const x = p.tx + p.offX;
              const y = p.ty + p.offY;
              g2d.fillRect(x - dotRadius, y - dotRadius, dotRadius * 2, dotRadius * 2);
            }
          }
        };

        const tick = () => {
          rafId = requestAnimationFrame(tick);

          if (phase === "forming") {
            const now = performance.now();
            let allDone = true;
            for (const p of particles) {
              const elapsed = (now - formStart) / 1000 - p.delay;
              if (elapsed <= 0) {
                allDone = false;
                continue;
              }
              const t = Math.min(1, elapsed / p.dur);
              if (t < 1) allDone = false;
              const eased = easeOutCubic(t);
              p.offX = p.startOffX * (1 - eased);
              p.offY = p.startOffY * (1 - eased);
              p.curScale = p.startScale + (1 - p.startScale) * eased;
              p.curAlpha = eased;
            }
            if (allDone) {
              for (const p of particles) {
                p.offX = 0;
                p.offY = 0;
                p.curScale = 1;
                p.curAlpha = 1;
              }
              phase = "formed";
            }
          } else if (phase === "formed") {
            if (pointerX !== null && pointerY !== null) {
              for (const p of particles) {
                const px = p.tx + p.offX;
                const py = p.ty + p.offY;
                const dx = px - pointerX;
                const dy = py - pointerY;
                const distSq = dx * dx + dy * dy;
                if (distSq < REPEL_RADIUS_SQ && distSq > 0.01) {
                  const dist = Math.sqrt(distSq);
                  const force = 1 - dist / REPEL_RADIUS;
                  p.offX += (dx / dist) * force * PUSH_STRENGTH;
                  p.offY += (dy / dist) * force * PUSH_STRENGTH;
                  const mag = Math.hypot(p.offX, p.offY);
                  if (mag > MAX_OFFSET) {
                    p.offX = (p.offX / mag) * MAX_OFFSET;
                    p.offY = (p.offY / mag) * MAX_OFFSET;
                  }
                }
                p.offX *= OFFSET_DECAY;
                p.offY *= OFFSET_DECAY;
              }
            } else {
              for (const p of particles) {
                p.offX *= OFFSET_DECAY;
                p.offY *= OFFSET_DECAY;
              }
            }
          }

          drawFrame();
        };

        const form = () => {
          formStart = performance.now();
          phase = "forming";
          if (core) {
            gsap.to(core, {
              opacity: 0,
              scale: 1.5,
              duration: 0.75,
              ease: "power2.out",
            });
          }
          gsap.to(fallback, { opacity: 0, duration: 0.6, delay: 0.25 });
        };

        const onPointerMove = (e: PointerEvent) => {
          const rect = canvas.getBoundingClientRect();
          pointerX = e.clientX - rect.left;
          pointerY = e.clientY - rect.top;
        };
        const onPointerLeave = () => {
          pointerX = null;
          pointerY = null;
        };

        if (!build()) return;

        gsap.set(fallback, { opacity: 1 });
        if (core) {
          gsap.set(core, { opacity: 1, scale: 1, transformOrigin: "50% 50%" });
        }
        scatter();
        drawFrame();
        rafId = requestAnimationFrame(tick);

        trigger = ScrollTrigger.create({
          trigger: s,
          start: "top 78%",
          once: true,
          onEnter: form,
        });

        canvas.addEventListener("pointermove", onPointerMove);
        canvas.addEventListener("pointerleave", onPointerLeave);
        canvas.addEventListener("pointercancel", onPointerLeave);

        if (typeof ResizeObserver !== "undefined") {
          ro = new ResizeObserver(() => {
            const w = Math.round(s.getBoundingClientRect().width);
            if (Math.abs(w - lastWidth) < 24) return;
            const wasFormed = phase === "formed" || phase === "forming";
            if (!build()) return;
            if (wasFormed) {
              for (const p of particles) {
                p.offX = 0;
                p.offY = 0;
                p.curScale = 1;
                p.curAlpha = 1;
              }
              phase = "formed";
            } else {
              scatter();
            }
            drawFrame();
          });
          ro.observe(s);
        }

        return () => {
          cancelAnimationFrame(rafId);
          canvas.removeEventListener("pointermove", onPointerMove);
          canvas.removeEventListener("pointerleave", onPointerLeave);
          canvas.removeEventListener("pointercancel", onPointerLeave);
          ro?.disconnect();
          trigger?.kill();
          g2d.clearRect(0, 0, canvas.width, canvas.height);
          gsap.set(fallback, { opacity: 1, clearProps: "opacity" });
          if (core) {
            gsap.killTweensOf(core);
            gsap.set(core, { clearProps: "opacity,transform" });
          }
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
      <canvas
        aria-hidden="true"
        className="pw-canvas pointer-events-auto absolute inset-0 h-full w-full"
      />
      {/* The seed, one last time, at the point every dot comes out of.
          Centred on the box because that is where `scatter()` clusters, so
          the two never have to agree on a number. */}
      <span
        aria-hidden="true"
        className="pw-seed pointer-events-none absolute left-1/2 top-1/2 block w-[54px] -translate-x-1/2 -translate-y-1/2 sm:w-[64px]"
      >
        <SeedCore uid="wordmark" className="h-auto w-full" />
      </span>
      <p className="pw-fallback pointer-events-none display absolute inset-0 flex items-center justify-center text-[11vw] leading-none text-ink sm:text-[9vw] lg:text-[clamp(3rem,8vw,7rem)]">
        PANTHEON
      </p>
    </div>
  );
}
