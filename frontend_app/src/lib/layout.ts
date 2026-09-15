import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

import type { Graph, GraphNode } from "./api";

export type PositionedNode = GraphNode & {
  degree: number;
  x: number;
  y: number;
};

type SimNode = SimulationNodeDatum & PositionedNode;
type SimLink = SimulationLinkDatum<SimNode>;

/** Bigger for well-connected entities, capped so hubs do not swallow the map. */
export function nodeRadius(degree: number) {
  return Math.min(20, 6 + Math.sqrt(degree) * 2.4);
}

/**
 * Run a force layout to completion and return fixed positions.
 *
 * The simulation is ticked synchronously (not animated) so React Flow gets a
 * settled layout in one pass; the user can then drag nodes freely. Degree is
 * carried through so the node view can size itself by connectivity.
 */
export function layoutGraph(
  graph: Graph,
  width = 1100,
  height = 720,
): PositionedNode[] {
  const degree = new Map<string, number>();
  for (const edge of graph.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1);
  }

  const nodes: SimNode[] = graph.nodes.map((node) => ({
    ...node,
    degree: degree.get(node.id) ?? 0,
    x: width / 2 + (Math.random() - 0.5) * width * 0.5,
    y: height / 2 + (Math.random() - 0.5) * height * 0.5,
  }));

  const links: SimLink[] = graph.edges
    .filter((edge) => edge.source !== edge.target)
    .map((edge) => ({ source: edge.source, target: edge.target }));

  const simulation = forceSimulation<SimNode>(nodes)
    .force("charge", forceManyBody<SimNode>().strength(-190))
    .force(
      "link",
      forceLink<SimNode, SimLink>(links)
        .id((node) => node.id)
        .distance(120)
        .strength(0.3),
    )
    .force("center", forceCenter(width / 2, height / 2))
    .force(
      "collide",
      forceCollide<SimNode>().radius((node) => nodeRadius(node.degree) + 10),
    )
    .stop();

  const ticks = Math.min(500, 80 + nodes.length * 2);
  for (let i = 0; i < ticks; i += 1) simulation.tick();

  return nodes;
}
