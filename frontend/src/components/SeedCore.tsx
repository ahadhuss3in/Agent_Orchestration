/**
 * The seed's core, on its own.
 *
 * `Orb` is the full sigil — four rings, sixty ticks, four orbiting particles.
 * At 190px that reads as a built instrument; at 16px it reads as grey mush.
 * This is the one part of it that survives being small: the faceted gem at the
 * centre, in the same Ignition gradient, with the same facet cuts and the same
 * white highlight triangle. Geometry is `Orb`'s gem scaled by 16/34, not
 * redrawn, so the two are literally the same shape.
 *
 * It exists because the lineage has to stay legible after the Agents section,
 * where the throughline stops being a set piece and becomes a mark: the light
 * at the top of the Orchestrator's staff, the core inside the agent you chat
 * to, the point the wordmark's dots fly out of. Ignition regardless of which
 * section it is sitting in — same rule as `Orb`'s gem, because the colour is
 * the seed's identity and not the section's.
 *
 * Server component, pure markup. Decorative everywhere it is used.
 */
const R_GEM = 16;
const R_TRI = 9;

/* Fixed precision for the same reason `Orb` does it: the raw float out of
   Math.cos can differ in its last bit between the server's engine and the
   browser's, which React reports as a hydration mismatch. */
const gemPts = Array.from({ length: 8 }, (_, i) => {
  const a = (i / 8) * Math.PI * 2 - Math.PI / 8;
  return `${(24 + Math.cos(a) * R_GEM).toFixed(2)},${(24 + Math.sin(a) * R_GEM).toFixed(2)}`;
}).join(" ");

const triPts = Array.from({ length: 3 }, (_, i) => {
  const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
  return `${(24 + Math.cos(a) * R_TRI).toFixed(2)},${(24 + Math.sin(a) * R_TRI).toFixed(2)}`;
}).join(" ");

export function SeedCore({
  uid,
  className = "",
  ring = true,
}: {
  /** Unique per instance: SVG gradient ids are document-global. */
  uid: string;
  className?: string;
  /** The dashed perimeter. Drop it below about 20px, where it fills in. */
  ring?: boolean;
}) {
  const g = `sc-${uid}`;
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      <defs>
        <linearGradient id={g} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffb08a" />
          <stop offset="38%" stopColor="var(--grad-seed-a)" />
          <stop offset="100%" stopColor="var(--grad-seed-b)" />
        </linearGradient>
      </defs>

      {ring && (
        <circle
          cx="24"
          cy="24"
          r="22"
          fill="none"
          stroke="var(--grad-seed-a)"
          strokeOpacity="0.5"
          strokeWidth="1.1"
          strokeDasharray="1 5"
          strokeLinecap="round"
        />
      )}

      <polygon
        points={gemPts}
        fill={`url(#${g})`}
        stroke="var(--grad-seed-b)"
        strokeOpacity="0.6"
        strokeWidth="1"
      />
      <g stroke="#ffffff" strokeOpacity="0.5" strokeWidth="1" fill="none">
        <path d="M24 8 L36.2 24 L24 40 L11.8 24 Z" />
        <line x1="11.8" y1="24" x2="36.2" y2="24" />
      </g>
      <polygon points={triPts} fill="#ffffff" fillOpacity="0.42" />
    </svg>
  );
}
