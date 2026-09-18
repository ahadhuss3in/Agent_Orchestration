"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

import EntityNodeView, {
  type EntityFlowNode,
  type EntityNodeData,
} from "./EntityNode";
import BalloonEdge, { type BalloonEdgeData } from "./BalloonEdge";
import {
  createGraphSimulation,
  nodeRadius,
  reheat,
  warmup,
  type SimNode,
} from "@/lib/layout";
import type { Agent, Graph, GraphEdge, GraphNode } from "@/lib/api";

const nodeTypes = { entity: EntityNodeView };
const edgeTypes = { balloon: BalloonEdge };

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export type Selection =
  | { kind: "node"; node: GraphNode; degree: number }
  | { kind: "edge"; edge: GraphEdge }
  | null;

/** Sum of all node centres, written into the shared edge centroid object. */
function updateCenter(
  center: { x: number; y: number },
  simNodes: SimNode[],
): void {
  const count = simNodes.length || 1;
  let x = 0;
  let y = 0;
  for (const node of simNodes) {
    x += node.x ?? 0;
    y += node.y ?? 0;
  }
  center.x = x / count;
  center.y = y / count;
}

/** Build React Flow elements and the live simulation that owns their positions. */
function buildGraphElements(graph: Graph) {
  const { simulation, nodes: simNodes } = createGraphSimulation(graph);
  // Settle synchronously so the first paint (and fitView) frames a real cloud.
  warmup(simulation);

  const radiusById = new Map(
    simNodes.map((node) => [node.id, nodeRadius(node.degree)]),
  );
  // Mutated in place on every tick so edges read a live centre without a
  // second state update per frame.
  const center = { x: 0, y: 0 };
  updateCenter(center, simNodes);

  const nodes: EntityFlowNode[] = simNodes.map((node) => {
    const r = nodeRadius(node.degree);
    return {
      id: node.id,
      type: "entity",
      // Simulation coordinates are circle centres; React Flow positions the
      // top-left corner of the measured box, which is exactly the circle.
      position: { x: (node.x ?? 0) - r, y: (node.y ?? 0) - r },
      data: {
        label: node.name,
        type: node.type,
        degree: node.degree,
        agentRank: null,
        archetype: null,
      },
    };
  });

  // Group edges by unordered endpoint pair so parallel edges can be fanned.
  const groups = new Map<string, GraphEdge[]>();
  for (const edge of graph.edges) {
    const key =
      edge.source < edge.target
        ? `${edge.source}\u0000${edge.target}`
        : `${edge.target}\u0000${edge.source}`;
    const group = groups.get(key);
    if (group) group.push(edge);
    else groups.set(key, [edge]);
  }

  const edges: Edge[] = graph.edges.map((edge, index) => {
    const key =
      edge.source < edge.target
        ? `${edge.source}\u0000${edge.target}`
        : `${edge.target}\u0000${edge.source}`;
    const group = groups.get(key) ?? [edge];
    return {
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
        dim: false,
        sourceRadius: radiusById.get(edge.source) ?? 8,
        targetRadius: radiusById.get(edge.target) ?? 8,
        parallelIndex: group.indexOf(edge),
        parallelCount: group.length,
        center,
        edge,
      } satisfies BalloonEdgeData & { edge: GraphEdge },
    };
  });

  return { nodes, edges, simulation, simNodes, center };
}

export default function GraphView({
  graph,
  agents,
  focusNodeId,
  onSelect,
}: {
  graph: Graph;
  agents: Agent[];
  focusNodeId: string | null;
  onSelect: (selection: Selection) => void;
}) {
  // Controlled React Flow state. The simulation owns positions while it runs;
  // React Flow owns the pointer during a drag (see the drag handlers below).
  // The parent remounts this component per seed (key), so the initial value is
  // enough and there is one simulation per graph.
  const initial = useMemo(() => buildGraphElements(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<EntityFlowNode>(
    initial.nodes,
  );
  const [edges, , onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  // Clicking a node pins its highlight; it stays until the pane is clicked.
  // Hover previews another node, then falls back to the pinned one.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paused, setPaused] = useState(prefersReducedMotion);
  const focusId = hoveredId ?? selectedId;
  const rfRef = useRef<ReactFlowInstance<EntityFlowNode, Edge> | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);

  // Write the simulation's current positions into React Flow. Pinned nodes
  // (fx/fy set, i.e. being dragged) are skipped so the two never fight.
  const syncPositions = useCallback(() => {
    const byId = new Map(initial.simNodes.map((node) => [node.id, node]));
    setNodes((prev) =>
      prev.map((node) => {
        const sim = byId.get(node.id);
        if (!sim || sim.fx != null || sim.x == null || sim.y == null) {
          return node;
        }
        const r = nodeRadius((node.data as EntityNodeData).degree);
        return { ...node, position: { x: sim.x - r, y: sim.y - r } };
      }),
    );
  }, [initial, setNodes]);

  const cancelLoop = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    runningRef.current = false;
  }, []);

  // One animation frame per tick; stops itself once the simulation settles.
  const startLoop = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    setPaused(false);
    const { simulation } = initial;
    const step = () => {
      if (simulation.alpha() <= simulation.alphaMin()) {
        simulation.stop();
        runningRef.current = false;
        rafRef.current = null;
        setPaused(true);
        return;
      }
      simulation.tick();
      updateCenter(initial.center, initial.simNodes);
      syncPositions();
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [initial, syncPositions]);

  // Settle once on mount, then start the loop unless the user prefers reduced
  // motion (in which case the graph simply appears settled and still).
  useEffect(() => {
    const { simulation } = initial;
    const reduce = prefersReducedMotion();

    if (reduce) {
      while (simulation.alpha() > simulation.alphaMin()) simulation.tick();
      updateCenter(initial.center, initial.simNodes);
      syncPositions();
      return () => {
        simulation.stop();
      };
    }

    startLoop();
    return () => {
      cancelLoop();
      simulation.stop();
    };
  }, [initial, startLoop, cancelLoop, syncPositions]);

  // Stop burning frames while the tab is hidden.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) {
        cancelLoop();
        initial.simulation.stop();
      } else if (initial.simulation.alpha() > initial.simulation.alphaMin()) {
        startLoop();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [initial, cancelLoop, startLoop]);

  // Agent markers are derived from the agents list, not baked into the graph,
  // so promoting an entity lights its node up without rebuilding the layout.
  const agentByEntity = useMemo(
    () => new Map(agents.map((agent) => [agent.entity_id, agent])),
    [agents],
  );

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

  // Jump to a node picked from the pool list. Reads the instance rather than
  // the nodes state so a drag does not retrigger the effect.
  useEffect(() => {
    if (!focusNodeId || !rfRef.current) return;
    const node = rfRef.current.getNode(focusNodeId);
    if (!node) return;
    const r = nodeRadius((node.data as EntityNodeData).degree);
    setSelectedId(focusNodeId);
    rfRef.current.setCenter(node.position.x + r, node.position.y + r, {
      zoom: 1.1,
      duration: 600,
    });
  }, [focusNodeId]);

  // Styling is derived, never written back into state, so it cannot fight a drag.
  const displayNodes = useMemo<EntityFlowNode[]>(
    () =>
      nodes.map((node) => {
        const agent = agentByEntity.get(node.id);
        return {
          ...node,
          data: {
            ...node.data,
            agentRank: agent ? agent.rank : null,
            archetype: agent ? agent.archetype : null,
          },
          style: {
            ...node.style,
            opacity: neighbours ? (neighbours.has(node.id) ? 1 : 0.08) : 1,
          },
        };
      }),
    [nodes, neighbours, agentByEntity],
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
      onInit={(instance) => {
        rfRef.current = instance;
      }}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStart={(_, node) => {
        const sim = initial.simNodes.find((n) => n.id === node.id);
        if (!sim) return;
        const r = nodeRadius((node.data as EntityNodeData).degree);
        sim.fx = node.position.x + r;
        sim.fy = node.position.y + r;
        if (!prefersReducedMotion()) {
          reheat(initial.simulation, 0.3);
          startLoop();
        }
      }}
      onNodeDrag={(_, node) => {
        const sim = initial.simNodes.find((n) => n.id === node.id);
        if (!sim) return;
        const r = nodeRadius((node.data as EntityNodeData).degree);
        sim.fx = node.position.x + r;
        sim.fy = node.position.y + r;
      }}
      onNodeDragStop={(_, node) => {
        const sim = initial.simNodes.find((n) => n.id === node.id);
        if (!sim) return;
        // Release the pin: the node is no longer held and settles by force.
        sim.fx = null;
        sim.fy = null;
        const reduce = prefersReducedMotion();
        if (reduce) {
          while (initial.simulation.alpha() > initial.simulation.alphaMin()) {
            initial.simulation.tick();
          }
          updateCenter(initial.center, initial.simNodes);
          syncPositions();
        } else {
          reheat(initial.simulation, 0.1);
          startLoop();
        }
      }}
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
      <Panel position="top-left" className="graph-panel">
        <button
          className="btn"
          onClick={() => {
            reheat(initial.simulation, 0.6);
            startLoop();
          }}
        >
          Re-layout
        </button>
        <button
          className="btn"
          onClick={() => {
            if (runningRef.current) {
              cancelLoop();
              initial.simulation.stop();
              setPaused(true);
            } else {
              reheat(initial.simulation, 0.15);
              startLoop();
            }
          }}
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </Panel>
    </ReactFlow>
  );
}
