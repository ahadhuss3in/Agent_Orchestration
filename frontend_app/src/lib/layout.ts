import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
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
 * Create the force simulation that owns the graph's positions.
 *
 * The simulation stays alive: the caller ticks it per animation frame and it
 * decays on its own ("settle and stop"). Coordinates are circle centres in
 * React Flow's coordinate space; the node wrapper is sized to the circle so
 * position is centre minus radius. Degree rides along for node sizing.
 */
export function createGraphSimulation(
  graph: Graph,
  width = 1100,
  height = 720,
): { simulation: Simulation<SimNode, SimLink>; nodes: SimNode[] } {
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
    .force(
      "charge",
      forceManyBody<SimNode>().strength(-190).distanceMax(900),
    )
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
      forceCollide<SimNode>().radius((node) => nodeRadius(node.degree) + 14),
    )
    .alphaMin(0.02)
    .alphaDecay(0.028)
    .stop();

  return { simulation, nodes };
}

/**
 * Warm the simulation up synchronously so the first paint shows a settled
 * cloud (fitView frames something sane, no initial explosion).
 */
export function warmup(
  simulation: Simulation<SimNode, SimLink>,
  ticks = 60,
): void {
  for (let i = 0; i < ticks; i += 1) simulation.tick();
}

/**
 * Nudge the simulation back to life. Called after a drag ends or when the
 * user asks for a re-layout; keeps the current arrangement and relaxes it.
 *
 * Deliberately does not call d3's `.restart()`: that would start d3's own
 * internal timer and double-tick against the caller's rAF loop. The caller
 * drives every tick with `simulation.tick()`.
 */
export function reheat(simulation: Simulation<SimNode, SimLink>, alpha: number) {
  simulation.alpha(Math.max(simulation.alpha(), alpha)).stop();
}

export type { SimNode, SimLink };
