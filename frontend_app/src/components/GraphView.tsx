"use client";

import { useCallback, useMemo, useState } from "react";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  MiniMap,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import EntityNodeView, { type EntityFlowNode } from "./EntityNode";
import BalloonEdge, { type BalloonEdgeData } from "./BalloonEdge";
import { layoutGraph } from "@/lib/layout";
import type { Graph, GraphEdge, GraphNode } from "@/lib/api";

const nodeTypes = { entity: EntityNodeView };
const edgeTypes = { balloon: BalloonEdge };

export type Selection =
  | { kind: "node"; node: GraphNode; degree: number }
  | { kind: "edge"; edge: GraphEdge }
  | null;

/** Positions come from the force layout; degree rides along for node sizing. */
function buildGraphElements(graph: Graph) {
  const positioned = layoutGraph(graph);
  const count = positioned.length || 1;
  const center = {
    x: positioned.reduce((sum, n) => sum + n.x, 0) / count,
    y: positioned.reduce((sum, n) => sum + n.y, 0) / count,
  };

  const nodes: EntityFlowNode[] = positioned.map((node) => ({
    id: node.id,
    type: "entity",
    position: { x: node.x, y: node.y },
    data: { label: node.name, type: node.type, degree: node.degree },
  }));

  const edges: Edge[] = graph.edges.map((edge, index) => ({
    id: `edge-${index}`,
    source: edge.source,
    target: edge.target,
    type: "balloon",
    markerEnd: {
      type: MarkerType.ArrowClosed,
      width: 12,
      height: 12,
      color: "rgba(245,245,245,0.45)",
    },
    data: {
      label: edge.type,
      center,
      dim: false,
      edge,
    } satisfies BalloonEdgeData & { edge: GraphEdge },
  }));

  return { nodes, edges };
}

export default function GraphView({
  graph,
  onSelect,
}: {
  graph: Graph;
  onSelect: (selection: Selection) => void;
}) {
  // Controlled React Flow state. Without onNodesChange the drag is discarded,
  // which is what made the graph feel frozen. Initialised synchronously so
  // fitView runs with the nodes already present; the parent remounts this
  // component per seed (key), so the initial value is enough.
  const initial = useMemo(() => buildGraphElements(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityFlowNode>(
    initial.nodes,
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Clicking a node pins its highlight; it stays until the pane is clicked.
  // Hover previews another node, then falls back to the pinned one.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const focusId = hoveredId ?? selectedId;

  const rebuild = useCallback(() => {
    const built = buildGraphElements(graph);
    setNodes(built.nodes);
    setEdges(built.edges);
  }, [graph, setNodes, setEdges]);

  // Neighbours of the focused node, including itself. Null means "no focus".
  const neighbours = useMemo(() => {
    if (!focusId) return null;
    const set = new Set<string>([focusId]);
    for (const edge of graph.edges) {
      if (edge.source === focusId) set.add(edge.target);
      if (edge.target === focusId) set.add(edge.source);
    }
    return set;
  }, [focusId, graph.edges]);

  // Styling is derived, never written back into state, so it cannot fight a drag.
  const displayNodes = useMemo<EntityFlowNode[]>(
    () =>
      nodes.map((node) => ({
        ...node,
        style: {
          ...node.style,
          opacity: neighbours ? (neighbours.has(node.id) ? 1 : 0.08) : 1,
        },
      })),
    [nodes, neighbours],
  );

  const displayEdges = useMemo<Edge[]>(
    () =>
      edges.map((edge) => {
        const dim = neighbours
          ? !(edge.source === focusId || edge.target === focusId)
          : false;
        return { ...edge, data: { ...(edge.data as BalloonEdgeData), dim } };
      }),
    [edges, neighbours, focusId],
  );

  return (
    <ReactFlow
      nodes={displayNodes}
      edges={displayEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeClick={(_, node) => {
        const original = graph.nodes.find((n) => n.id === node.id);
        const degree = (node.data as { degree?: number }).degree ?? 0;
        setSelectedId(node.id);
        if (original) onSelect({ kind: "node", node: original, degree });
      }}
      onEdgeClick={(_, edge) => {
        const original = (edge.data as { edge?: GraphEdge } | undefined)?.edge;
        if (original) onSelect({ kind: "edge", edge: original });
      }}
      onNodeMouseEnter={(_, node) => setHoveredId(node.id)}
      onNodeMouseLeave={() => setHoveredId(null)}
      onPaneClick={() => {
        setSelectedId(null);
        setHoveredId(null);
        onSelect(null);
      }}
      fitView
      minZoom={0.1}
      maxZoom={2.5}
      nodesConnectable={false}
      elementsSelectable
      elevateEdgesOnSelect
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={22}
        size={1}
        color="rgba(245,245,245,0.10)"
      />
      <Controls showInteractive={false} />
      <MiniMap
        pannable
        zoomable
        nodeColor={() => "#2a2a2a"}
        maskColor="rgba(9,9,9,0.7)"
      />
      <Panel position="top-left">
        <button className="btn" onClick={rebuild}>
          Re-layout
        </button>
      </Panel>
    </ReactFlow>
  );
}
