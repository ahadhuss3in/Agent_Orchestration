"use client";

import { TYPE_GLYPH } from "./EntityNode";

// Same order the entity types are introduced elsewhere, so the legend reads
// like the rest of the console.
const TYPES = ["Person", "Organization", "Location", "Event", "Entity"] as const;

/**
 * A small key for the graph, pinned to the canvas.
 *
 * Nothing in the graph carries meaning by colour alone, so the legend explains
 * the two signals that do carry meaning: the shape glyph (entity type) and the
 * ring/badge (agent pool and archetype).
 */
export default function GraphLegend() {
  return (
    <div className="graph-legend" role="group" aria-label="Graph legend">
      <p className="hud-label text-ink-dim">Legend</p>
      <ul className="graph-legend-list">
        {TYPES.map((type) => (
          <li key={type} className="graph-legend-item">
            <span className="graph-legend-glyph" aria-hidden="true">
              {TYPE_GLYPH[type] ?? TYPE_GLYPH.Entity}
            </span>
            <span className="graph-legend-name">{type}</span>
          </li>
        ))}
      </ul>
      <p className="graph-legend-note">
        Dashed ring: agent candidate {"\u00B7"} code badge: archetype
      </p>
    </div>
  );
}
