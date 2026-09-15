"use client";

import { memo } from "react";
import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";

import { nodeRadius } from "@/lib/layout";

export type EntityNodeData = {
  label: string;
  type: string;
  degree: number;
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
  const size = nodeRadius(data.degree) * 2;
  return (
    <div className="entity-node" data-selected={selected}>
      <Handle type="target" position={Position.Top} />
      <div className="entity-dot" style={{ width: size, height: size }}>
        {TYPE_GLYPH[data.type] ?? TYPE_GLYPH.Entity}
      </div>
      <div className="entity-name" title={data.label}>
        {data.label}
      </div>
      <Handle type="source" position={Position.Bottom} />
    </div>
  );
}

export default memo(EntityNodeView);
