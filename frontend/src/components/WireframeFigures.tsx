/**
 * Hand-authored wireframe humanoids: connected line segments plus small
 * circular joints. No fills, no raster assets, no downloaded art.
 *
 * Geometry now lives in `@/lib/figures` so the same art can be emitted two
 * ways:
 *
 *   <WireframeSprite />  one <symbol> per figure, near the top of the
 *                        document, instanced with <use>. Cheapest option and
 *                        what every decorative instance uses.
 *
 *   <InlineFigure />     the same strokes emitted as real <path> elements, so
 *                        GSAP can animate stroke-dashoffset per stroke (the
 *                        intro's hand-drawn reveal) or grab one limb out of
 *                        the figure (the Agents mitosis). A <use> shadow tree
 *                        cannot be reached from script, which is the whole
 *                        reason this second path exists.
 *
 * Stroke colour comes from `currentColor`, so an instance is tinted by
 * setting `color` on (or above) the <svg>.
 *
 * Server components — pure markup.
 */

import type { FigureId } from "@/lib/content";
import { FIGURES, viewBoxOf } from "@/lib/figures";

const S = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

const IDS = Object.keys(FIGURES) as FigureId[];

export function WireframeSprite() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="0"
      height="0"
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}
    >
      <defs>
        {IDS.map((id) => {
          const f = FIGURES[id];
          return (
            <symbol key={id} id={`wf-${id}`} viewBox={viewBoxOf(id)}>
              <g {...S}>
                {f.outlines.map((c, i) => (
                  <circle key={`o${i}`} cx={c.cx} cy={c.cy} r={c.r} />
                ))}
                {f.strokes.map((d, i) => (
                  <path key={`s${i}`} d={d} />
                ))}
              </g>
              <g fill="currentColor">
                {f.joints.map((c, i) => (
                  <circle key={`j${i}`} cx={c.cx} cy={c.cy} r={c.r} />
                ))}
              </g>
            </symbol>
          );
        })}
      </defs>
    </svg>
  );
}

/**
 * One instance of a wireframe figure, via <use>.
 *
 * Decorative: the persona name and description always sit next to it as real
 * text, so the drawing carries no unique information and is hidden from
 * assistive tech.
 */
export function Figure({
  id,
  className = "",
  style,
}: {
  id: FigureId;
  className?: string;
  style?: React.CSSProperties;
}) {
  const f = FIGURES[id];
  return (
    <svg
      viewBox={viewBoxOf(id)}
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
      style={style}
    >
      <use href={`#wf-${id}`} width={f.w} height={f.h} />
    </svg>
  );
}

/**
 * The same figure with every stroke as an addressable element.
 *
 * `pathLength={1}` + `strokeDasharray={1}` normalises every stroke to a
 * single unit of length, so one shared tween from `strokeDashoffset: 1` to
 * `0` draws them all at a consistent rate no matter how long each really is.
 * That is what makes the intro's reveal look hand-drawn rather than having
 * the long staff finish last.
 */
export function InlineFigure({
  id,
  className = "",
  strokeClass = "wf-stroke",
  jointClass = "wf-joint",
}: {
  id: FigureId;
  className?: string;
  strokeClass?: string;
  jointClass?: string;
}) {
  const f = FIGURES[id];
  return (
    <svg
      viewBox={viewBoxOf(id)}
      className={className}
      aria-hidden="true"
      focusable="false"
      role="presentation"
    >
      <g {...S}>
        {f.outlines.map((c, i) => (
          <circle
            key={`o${i}`}
            className={strokeClass}
            cx={c.cx}
            cy={c.cy}
            r={c.r}
            pathLength={1}
            strokeDasharray={1}
          />
        ))}
        {f.strokes.map((d, i) => (
          <path
            key={`s${i}`}
            className={strokeClass}
            data-stroke={i}
            d={d}
            pathLength={1}
            strokeDasharray={1}
          />
        ))}
      </g>
      <g fill="currentColor">
        {f.joints.map((c, i) => (
          <circle
            key={`j${i}`}
            className={jointClass}
            cx={c.cx}
            cy={c.cy}
            r={c.r}
          />
        ))}
      </g>
    </svg>
  );
}
