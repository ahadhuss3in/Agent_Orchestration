"use client";

import { useState } from "react";
import { EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";

export type BalloonEdgeData = {
  label: string;
  center: { x: number; y: number };
  dim: boolean;
};

/**
 * An edge that bows outward, away from the graph centre.
 *
 * The control point of the quadratic is pushed along the perpendicular of the
 * node pair, on whichever side points away from the centre, so every edge
 * curves out and the cloud reads as a balloon rather than a tangle of straight
 * chords. The label only appears on hover or selection.
 */
export default function BalloonEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  selected,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const edge = data as unknown as BalloonEdgeData;

  const dx = targetX - sourceX;
  const dy = targetY - sourceY;
  const distance = Math.hypot(dx, dy) || 1;
  const midX = (sourceX + targetX) / 2;
  const midY = (sourceY + targetY) / 2;

  // Perpendicular to the pair, flipped so it points away from the centre.
  let nx = -dy / distance;
  let ny = dx / distance;
  const awayX = midX - edge.center.x;
  const awayY = midY - edge.center.y;
  if (nx * awayX + ny * awayY < 0) {
    nx = -nx;
    ny = -ny;
  }

  const bow = Math.min(160, distance * 0.32) + 18;
  const controlX = midX + nx * bow;
  const controlY = midY + ny * bow;
  const path = `M ${sourceX},${sourceY} Q ${controlX},${controlY} ${targetX},${targetY}`;

  // Quadratic midpoint (t = 0.5), where the label sits.
  const labelX = 0.25 * sourceX + 0.5 * controlX + 0.25 * targetX;
  const labelY = 0.25 * sourceY + 0.5 * controlY + 0.25 * targetY;

  const active = hovered || selected;
  const opacity = edge.dim ? 0.05 : 1;

  return (
    <>
      <path
        d={path}
        fill="none"
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: active ? "var(--seed-a)" : "rgba(245,245,245,0.16)",
          strokeWidth: active ? 1.6 : 1,
          opacity,
        }}
      />
      {/* Wide invisible stroke so the thin curve is easy to hover and click. */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={26}
        style={{ pointerEvents: "stroke", cursor: "pointer" }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      {active && (
        <EdgeLabelRenderer>
          <div
            className="edge-label nodrag nopan"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              opacity: edge.dim ? 0.15 : 1,
            }}
          >
            {edge.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
