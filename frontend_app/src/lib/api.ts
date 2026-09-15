// Every network call to the knowledge-base API lives here.

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8000";

export type EntityType =
  | "Person"
  | "Organization"
  | "Location"
  | "Event"
  | "Entity";

export type GraphNode = {
  id: string;
  name: string;
  type: EntityType;
  description: string;
  role_in_seed: string;
  source_chunk_ids: string[];
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

export type RunSummary = {
  seed_id: string;
  status: string;
  phase: string;
  chunks_stored: number;
  entities: { entity_id: string; name: string; type: EntityType }[];
  relationships: { source_name: string; type: string; target_name: string }[];
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
