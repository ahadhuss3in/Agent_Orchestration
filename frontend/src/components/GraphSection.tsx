import { GRAPH_NODES, GRAPH_EDGES } from "@/lib/content";
import { Orb } from "./Orb";

/** Centre of the constellation, in the overlay SVG's coordinate space. */
const CX = 300;
const CY = 210;

/**
 * Entity tones. The seed's own Ignition red carries into PERSON so the
 * traveling sigil visibly propagates its colour into the graph it becomes;
 * ORG and LOCATION take the Signal pair that owns this section.
 */
const TONE: Record<string, string> = {
  PERSON: "var(--grad-seed-b)",
  ORG: "var(--grad-graph-b)",
  LOCATION: "var(--grad-graph-a)",
};

const LEGEND = [
  { label: "Person", tone: TONE.PERSON },
  { label: "Organization", tone: TONE.ORG },
  { label: "Location", tone: TONE.LOCATION },
];

function point(i: number) {
  if (i < 0) return { x: CX, y: CY };
  const n = GRAPH_NODES[i];
  return { x: n.x, y: n.y };
}

/**
 * Pure markup — a server component. All motion lives in `SeedJourney`.
 *
 * Layout note: v1 had the constellation in a right-hand column. It is now
 * centred at full width under the copy, which is what makes the handoff in
 * feedback #5 honest — the traveling sigil is asked to finish at the
 * horizontal centre of the viewport, and the graph's central node has to be
 * at that same screen coordinate for the crossfade to read as one continuous
 * object rather than a jump.
 */
export function GraphSection() {
  return (
    <section
      id="graph"
      aria-labelledby="graph-heading"
      className="sec-graph relative overflow-hidden py-24 lg:py-36"
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
              One call turns that sentence into a graph.
            </h2>
          </div>

          <div className="max-w-[58ch] lg:pt-2">
            <p className="graph-body font-mono text-[15px] leading-relaxed text-ink-dim">
              Extraction runs once. A single LLM call returns typed entities,
              meaning the people, organizations and locations named in the
              seed, plus the relationships between them and a short qualitative
              briefing on what is actually going on.
            </p>

            <p className="graph-body mt-5 font-mono text-[15px] leading-relaxed text-ink-dim">
              All of it is written into Neo4j. The write is idempotent, so
              re-running the same seed updates the graph in place rather than
              stacking a second copy of every node beside the first.
            </p>
          </div>
        </div>

        {/* Decorative: every entity type and the idea of edges is already
            stated in the copy and the legend below. */}
        <div
          className="graph-visual relative mx-auto mt-14 aspect-[600/420] w-full max-w-[760px] lg:mt-20"
          aria-hidden="true"
        >
          {/* The seed, arriving. Starts invisible on wide viewports: the
              journey controller crossfades it in at the exact screen position
              the traveling flyer reaches. */}
          <div className="graph-center-orb absolute left-1/2 top-1/2 w-[24%] -translate-x-1/2 -translate-y-1/2">
            <Orb uid="graph" className="h-auto w-full" />
          </div>

          <svg
            viewBox="0 0 600 420"
            className="absolute inset-0 h-full w-full"
            aria-hidden="true"
            focusable="false"
            role="presentation"
          >
            <g>
              {GRAPH_EDGES.map(([a, b], i) => {
                const p1 = point(a);
                const p2 = point(b);
                return (
                  <line
                    key={`e${i}`}
                    className="edge-path"
                    x1={p1.x}
                    y1={p1.y}
                    x2={p2.x}
                    y2={p2.y}
                    stroke="var(--grad-graph-b)"
                    strokeOpacity={a < 0 ? 0.5 : 0.28}
                    strokeWidth={a < 0 ? 1.6 : 1.1}
                    pathLength={1}
                    strokeDasharray={1}
                    strokeDashoffset={0}
                  />
                );
              })}
            </g>

            <g>
              {GRAPH_NODES.map((n) => {
                const tone = TONE[n.label] ?? "var(--grad-graph-b)";
                return (
                  <g key={n.id} className="gnode">
                    <circle
                      cx={n.x}
                      cy={n.y}
                      r="15"
                      fill="none"
                      stroke={tone}
                      strokeOpacity="0.45"
                      strokeWidth="1"
                    />
                    <circle cx={n.x} cy={n.y} r="6.5" fill={tone} />
                    <text
                      x={n.x}
                      y={n.y + 32}
                      textAnchor="middle"
                      fill="var(--ink-dim)"
                      fontSize="9.5"
                      letterSpacing="1.6"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {n.label}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        </div>

        <ul className="reveal-target mt-10 flex flex-wrap justify-center gap-x-6 gap-y-3">
          {LEGEND.map((item) => (
            <li
              key={item.label}
              className="flex items-center gap-2 font-mono text-[12px] text-ink-dim"
            >
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full"
                style={{ background: item.tone }}
              />
              {item.label}
            </li>
          ))}
          <li className="flex items-center gap-2 font-mono text-[12px] text-ink-dim">
            <span
              aria-hidden="true"
              className="h-px w-5"
              style={{ background: "var(--line-strong)" }}
            />
            Extracted relationship
          </li>
        </ul>
      </div>
    </section>
  );
}
