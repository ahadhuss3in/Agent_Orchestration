import type { Archetype } from "./api";

/**
 * The four archetypes, mirroring services/Orchestration/agents/archetypes.py
 * and frontend/src/lib/content.ts. The Orchestrator is deliberately absent: it
 * is a system role the engine supplies, never assigned to an entity.
 */
export const ARCHETYPES: { id: Archetype; name: string; role: string }[] = [
  { id: "strategist", name: "The Strategist", role: "Plans forward" },
  { id: "skeptic", name: "The Skeptic", role: "Tests the claim" },
  { id: "loyalist", name: "The Loyalist", role: "Defends the position" },
  { id: "wildcard", name: "The Wildcard", role: "Breaks the frame" },
];

/** Two-letter code for the node badge and the picker. */
export const ARCHETYPE_CODE: Record<Archetype, string> = {
  strategist: "St",
  skeptic: "Sk",
  loyalist: "Lo",
  wildcard: "Wi",
};

export const ARCHETYPE_BY_ID = Object.fromEntries(
  ARCHETYPES.map((a) => [a.id, a]),
) as Record<Archetype, { id: Archetype; name: string; role: string }>;
