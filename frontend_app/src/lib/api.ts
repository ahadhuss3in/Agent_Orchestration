// Every network call to the knowledge-base API lives here.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export type EntityType =
  | "Person"
  | "Organization"
  | "Location"
  | "Event"
  | "Entity";

/** The four behavioural settings an entity can be promoted into. */
export type Archetype = "strategist" | "skeptic" | "loyalist" | "wildcard";

export type GraphNode = {
  id: string;
  name: string;
  type: EntityType;
  description: string;
  role_in_seed: string;
  source_chunk_ids: string[];
  /** Set only for entities in the agent pool; null otherwise. */
  agent_rank?: number | null;
  archetype?: Archetype | null;
};

export type GraphEdge = {
  source: string;
  target: string;
  type: string;
  description: string;
  source_chunk_ids: string[];
};

export type Graph = {
  seed_id: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type SeedSummary = {
  seed_id: string;
};

/** One candidate in the agent pool, as returned by GET /seed/{id}/agents. */
export type Agent = {
  agent_id: string;
  entity_id: string;
  name: string;
  type: EntityType;
  degree: number;
  rank: number;
  archetype: Archetype | null;
  status: "pool" | "promoted";
  message_count: number;
};

/** A passage behind one agent reply. */
export type Citation = {
  chunk_id: string | null;
  source: string | null;
  score: number;
};

export type AgentReply = {
  agent_id: string;
  name: string;
  archetype: Archetype | null;
  reply: string;
  citations: Citation[];
};

export type RunSummary = {
  seed_id: string;
  status: string;
  phase: string;
  chunks_stored: number;
  entities: { entity_id: string; name: string; type: EntityType }[];
  relationships: { source_name: string; type: string; target_name: string }[];
  agent_pool?: {
    agent_id: string;
    entity_id: string;
    name: string;
    type: EntityType;
    degree: number;
    rank: number;
  }[];
};

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { detail?: string }).detail || `Request failed (${res.status})`);
  }
  return data as T;
}

export async function fetchSeeds(): Promise<SeedSummary[]> {
  const res = await fetch(`${API_BASE}/seeds`, { cache: "no-store" });
  const data = await parse<{ seeds: SeedSummary[] }>(res);
  return data.seeds ?? [];
}

export async function fetchGraph(seedId: string): Promise<Graph> {
  const res = await fetch(`${API_BASE}/seed/${encodeURIComponent(seedId)}/graph`, {
    cache: "no-store",
  });
  return parse<Graph>(res);
}

export async function submitSeed(file: File): Promise<RunSummary> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch(`${API_BASE}/seed`, { method: "POST", body });
  return parse<RunSummary>(res);
}

export async function deleteSeed(seedId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/seed/${encodeURIComponent(seedId)}`, {
    method: "DELETE",
  });
  await parse<unknown>(res);
}

export async function fetchAgents(seedId: string): Promise<Agent[]> {
  const res = await fetch(
    `${API_BASE}/seed/${encodeURIComponent(seedId)}/agents`,
    { cache: "no-store" },
  );
  const data = await parse<{ agents: Agent[] }>(res);
  return data.agents ?? [];
}

/** Assign an archetype, or pass null to leave the entity in the pool. */
export async function promoteAgent(
  seedId: string,
  entityId: string,
  archetype: Archetype | null,
): Promise<void> {
  const res = await fetch(
    `${API_BASE}/seed/${encodeURIComponent(seedId)}/agents/${encodeURIComponent(entityId)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archetype }),
    },
  );
  await parse<unknown>(res);
}

export async function queryAgent(
  agentId: string,
  message: string,
): Promise<AgentReply> {
  const res = await fetch(
    `${API_BASE}/agents/${encodeURIComponent(agentId)}/query`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    },
  );
  return parse<AgentReply>(res);
}
