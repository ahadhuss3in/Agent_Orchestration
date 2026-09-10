import { CubeSigil } from "./CubeSigil";
import { CubeMark } from "./CubeFigure";

/**
 * Pure markup — a server component. All motion lives in `SeedJourney`.
 *
 * WHAT REPLACED THE CONSTELLATION. Through v5 this section drew an SVG
 * constellation: eight fixed nodes at hand-placed coordinates, edges between
 * them, and a hover layer that named each node's entity type. It is gone, and
 * what stands in its place is the seed itself, come apart.
 *
 * That is the whole narrative beat and it was always the intent — the seed
 * BECOMES the graph — but a drawing of a graph beside a drawing of a seed can
 * only ever assert the connection. Now the same thirty-four cubes that made up
 * the seed one section earlier are the nodes here, each one having travelled
 * from its place in the formation to its place in the constellation, with the
 * edges drawn between the objects that actually moved.
 *
 * WHAT IS IN THIS FILE IS THE FINISHED STILL OF THAT. `<CubeSigil graph edges>`
 * is the dispersed layout and its relationships, projected isometrically to
 * flat SVG from `lib/cubes.ts` — the same data the WebGL scene instances. It
 * is server-rendered and it is what a reader sees with JavaScript off, under
 * `prefers-reduced-motion: reduce`, on a device with no WebGL, and below
 * 1024px. On the branch where the live scene does exist, `SeedJourney` fades
 * this still out underneath it and the canvas takes over — so the interactive
 * version is an enhancement over a complete page, never a requirement for one.
 *
 * Layout note, carried forward from v5 and still load-bearing: the visual is
 * centred at full width under the copy rather than sitting in a right-hand
 * column, because the travelling seed is asked to finish at the horizontal
 * centre of the viewport and the graph has to already be there for the handoff
 * to read as one continuous object rather than a jump.
 */

/**
 * THE LEGEND, and the first two entries are the reason it needed rewriting.
 *
 * Through v3 an entity and a plain node were told apart by colour alone —
 * `--grad-seed-a` against `--grad-seed-b`, two swatches of identical size and
 * identical shape. That was already the one genuinely colour-only distinction
 * on the page, and it does not survive a monochrome palette. It should not
 * have survived the accessibility pass either.
 *
 * They are now told apart the way the drawing itself tells them apart: an
 * entity is a SOLID cube, a node that was never promoted is an OUTLINE, and a
 * relationship is a rule. Fill, outline, line — three different marks, legible
 * with no colour at all and legible to anyone who cannot distinguish two greys
 * either.
 */
const LEGEND = [
  {
    label: "Entity, pulled out of the seed",
    shape: "solid" as const,
  },
  {
    label: "Node, still in the graph",
    shape: "outline" as const,
  },
  {
    label: "Extracted relationship",
    shape: "line" as const,
  },
];

const LEGEND_MARK: Record<string, string> = {
  solid: "h-2.5 w-2.5 bg-[color:var(--ink-accent)]",
  outline: "h-2.5 w-2.5 border border-[color:var(--line-strong)]",
  line: "h-px w-5 bg-[color:var(--ink-dim)]",
};

export function GraphSection() {
  return (
    <section
      id="graph"
      aria-labelledby="graph-heading"
      className="sec-graph sec-open relative py-24 lg:py-36"
    >
      <div
        aria-hidden="true"
        className="sec-wash"
        style={{ "--wash-x": "50%", "--wash-y": "62%" } as React.CSSProperties}
      />

      <div className="relative mx-auto w-full max-w-[1440px] px-6 sm:px-8 lg:px-14">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-16">
          <div>
            <span className="stage-rule reveal-target mb-8" aria-hidden="true" />
            <h2
              id="graph-heading"
              className="graph-heading display-sm max-w-[17ch] text-[clamp(1.75rem,4.4vw,3rem)] text-ink"
            >
              One pass turns that sentence into a graph.
            </h2>
          </div>

          <div className="max-w-[58ch] lg:pt-2">
            <p className="graph-body font-mono text-[15px] leading-relaxed text-ink-dim">
              Extraction runs once. A single pass over the seed returns typed
              entities, meaning the people, organizations and locations named
              in it, plus the relationships between them and a short
              qualitative briefing on what is actually going on.
            </p>

            <p className="graph-body mt-5 font-mono text-[15px] leading-relaxed text-ink-dim">
              All of it is written into a real graph, not a mock. Running the
              same seed again updates that graph in place rather than stacking
              a second copy of every node beside the first.
            </p>
          </div>
        </div>

        {/* Decorative: every claim the drawing makes is already in the copy and
            the legend below, so the whole visual carries `aria-hidden`. Unlike
            v5 there are no focusable controls inside it — the interactive
            version of this graph lives on the canvas layer, and its controls
            are real DOM buttons in `CubeStage`'s panel, outside this box. */}
        <div
          aria-hidden="true"
          className="graph-visual relative mx-auto mt-14 aspect-[600/420] w-full max-w-[780px] lg:mt-20"
        >
          {/* THE FINISHED STILL. Present in the server HTML, hidden only on
              the branch where a live scene is actually rendering over it. */}
          <div className="graph-still absolute inset-0">
            <CubeSigil uid="graph" graph edges className="h-full w-full" />
          </div>

          {/* THE ANCHOR.

              `GraphRelay` peels the lineage off the middle of this graph and
              carries it into the Agents section, and it measures THIS element
              to know where the middle is and how big the mark should be. It
              stays in the markup on every branch for that reason, even on the
              one where the live canvas hides its art: an anchor with no size
              would send the relay flyer to the wrong place.

              The art inside it is on its own class so the two facts can be
              controlled separately — the relay owns the wrapper's opacity as
              part of its crossfade, `SeedJourney` owns whether the art inside
              it is drawn at all. */}
          <div className="graph-center-orb absolute left-1/2 top-1/2 w-[52px] -translate-x-1/2 -translate-y-1/2">
            <div className="graph-orb-art">
              <CubeMark uid="graph" className="h-auto w-full" />
            </div>
          </div>
        </div>

        {/* ABOVE THE CANVAS, not under it.

            `CubeStage`'s sticky box covers the whole viewport at z-30 for the
            length of the journey, and this legend sits inside the Graph
            section's ordinary content — so the live constellation painted
            straight over it. Measured at 1440x900 with the graph settled, the
            legend's own copy read 4.31:1 against the cubes on top of it,
            under the 4.5 it needs, and two of the three entries were
            physically obscured by a node.

            A legend that is behind the thing it is a legend for is the wrong
            way round regardless of the number. z-[31] clears the canvas and
            stays below the promotion panel's z-40, so the ordering is
            legend over graph, controls over both. */}
        <ul className="reveal-target relative z-[31] mt-10 flex flex-wrap justify-center gap-x-6 gap-y-3">
          {LEGEND.map((item) => (
            <li
              key={item.label}
              className="flex items-center gap-2 font-mono text-[12px] text-ink-dim"
            >
              <span
                aria-hidden="true"
                className={`shrink-0 ${LEGEND_MARK[item.shape]}`}
              />
              {item.label}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
