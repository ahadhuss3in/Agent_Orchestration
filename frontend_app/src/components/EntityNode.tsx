"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { nodeRadius } from "@/lib/layout";
import type { Archetype } from "@/lib/api";
import { ARCHETYPE_CODE } from "@/lib/archetypes";

export type EntityNodeData = {
  label: string;
  type: string;
  degree: number;
  /** Non-null when the entity is in the agent pool. */
  agentRank: number | null;
  /** Set once a human assigns a personality. */
  archetype: Archetype | null;
};

export type EntityFlowNode = Node<EntityNodeData, "entity">;

// Shape carries the entity type; colour is never the only signal.
const TYPE_GLYPH: Record<string, string> = {
  Person: "\u25C6", // diamond
  Organization: "\u25A0", // square
  Location: "\u25B2", // triangle
  Event: "\u25CF", // circle
  Entity: "\u25C7", // hollow diamond
};

function EntityNodeView({ data, selected }: NodeProps<EntityFlowNode>) {
  const r = nodeRadius(data.degree);
  const size = r * 2;
  return (
    <div
      className="entity-node"
      style={{ width: size, height: size }}
      data-selected={selected}
      data-pool={data.agentRank != null}
      data-promoted={data.archetype != null}
    >
      {/* Handles sit at the node centre so React Flow passes centre
          coordinates to the edge, which clips to the rim itself. */}
      <Handle
        type="target"
        position={Position.Top}
        style={{ left: "50%", top: "50%", transform: "translate(-50%,-50%)" }}
      />
      <div className="entity-dot" style={{ width: size, height: size }}>
        {TYPE_GLYPH[data.type] ?? TYPE_GLYPH.Entity}
      </div>
      {data.archetype && (
        <span className="agent-badge" title={data.archetype}>
          {ARCHETYPE_CODE[data.archetype]}
        </span>
      )}
      {/* Name is an overlay outside the measured box: the wrapper stays
          exactly the circle, labels never inflate collision extents. */}
      <div className="entity-name" title={data.label}>
        {data.label}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{ left: "50%", top: "50%", transform: "translate(-50%,-50%)" }}
      />
    </div>
  );
}

export default memo(EntityNodeView);
