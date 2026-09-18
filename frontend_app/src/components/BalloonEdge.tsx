"use client";

import { useState } from "react";
import { EdgeLabelRenderer, type EdgeProps } from "@xyflow/react";

export type BalloonEdgeData = {
  label: string;
  dim: boolean;
  /** Radius of each endpoint's circle, so the curve can clip to the rim. */
  sourceRadius: number;
  targetRadius: number;
  /** Position of this edge within its parallel group. */
  parallelIndex: number;
  parallelCount: number;
  /**
   * Live graph centroid. GraphView mutates this object in place on every
   * physics tick, so the bow direction stays correct as the cloud moves.
   */
  center: { x: number; y: number };
};

type Pt = { x: number; y: number };

/** Walk from a point towards `via` by `radius`, landing on the circle rim. */
function clipTowards(from: Pt, via: Pt, radius: number): Pt {
  const dx = via.x - from.x;
  const dy = via.y - from.y;
  const d = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / d) * radius, y: from.y + (dy / d) * radius };
}

/**
 * An edge that bows outward, away from the graph centre.
 *
 * Handles sit at each node's centre, so both ends are clipped back to the
 * circle rim along the curve tangent; the arrowhead lands on the rim instead
 * of on an invisible bounding box. Edges between the same pair of nodes are
 * spread by their index so they do not overlap, and a self-loop is drawn as a
 * proper arc above the node. Labels appear on hover or selection only.
 */
export default function BalloonEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  source,
  target,
  selected,
  data,
  markerEnd,
  style,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false);
  const edge = data as unknown as BalloonEdgeData;

  let path: string;
  let labelX: number;
  let labelY: number;

  if (source === target) {
    // Self-loop: a bezier arcing above the node's rim.
    const r = edge.sourceRadius;
    const loopR = r + 26;
    const spread = 0.85;
    const a1 = -Math.PI / 2 - spread;
    const a2 = -Math.PI / 2 + spread;
    const sx = sourceX + r * Math.cos(a1);
    const sy = sourceY + r * Math.sin(a1);
    const tx = sourceX + r * Math.cos(a2);
    const ty = sourceY + r * Math.sin(a2);
    const c1x = sourceX + loopR * Math.cos(a1);
    const c1y = sourceY + loopR * Math.sin(a1);
    const c2x = sourceX + loopR * Math.cos(a2);
    const c2y = sourceY + loopR * Math.sin(a2);
    path = `M ${sx},${sy} C ${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`;
    labelX = sourceX;
    labelY = sourceY - loopR * 0.9 - 6;
  } else {
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

    // Fan parallel edges apart so two relationships between the same pair do
    // not draw the exact same curve.
    const fan =
      edge.parallelCount > 1
        ? (edge.parallelIndex - (edge.parallelCount - 1) / 2) * 34
        : 0;
    const bow = Math.min(160, distance * 0.32) + 18 + fan;
    const controlX = midX + nx * bow;
    const controlY = midY + ny * bow;
    const control = { x: controlX, y: controlY };

    const start = clipTowards(
      { x: sourceX, y: sourceY },
      control,
      edge.sourceRadius,
    );
    const end = clipTowards(
      { x: targetX, y: targetY },
      control,
      edge.targetRadius,
    );

    path = `M ${start.x},${start.y} Q ${controlX},${controlY} ${end.x},${end.y}`;
    // Quadratic midpoint (t = 0.5), where the label sits.
    labelX = 0.25 * start.x + 0.5 * controlX + 0.25 * end.x;
    labelY = 0.25 * start.y + 0.5 * controlY + 0.25 * end.y;
  }

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
