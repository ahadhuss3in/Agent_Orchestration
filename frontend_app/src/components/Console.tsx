"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  deleteSeed,
  fetchGraph,
  fetchSeeds,
  submitSeed,
  type Graph,
  type SeedSummary,
} from "@/lib/api";
import GraphView, { type Selection } from "./GraphView";
import DetailsPanel from "./DetailsPanel";

export default function Console() {
  const [seeds, setSeeds] = useState<SeedSummary[]>([]);
  const [activeSeed, setActiveSeed] = useState<string | null>(null);
  const [graph, setGraph] = useState<Graph | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [file, setFile] = useState<File | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Load the seeds already stored so a run is never required to view a graph.
  useEffect(() => {
    fetchSeeds()
      .then(setSeeds)
      .catch((e: Error) => setError(e.message));
  }, []);

  // A run is tens of seconds of LLM calls; keep a visible clock.
  useEffect(() => {
    if (!running) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    const start = Date.now();
    timerRef.current = setInterval(() => {
      setElapsed(Math.round((Date.now() - start) / 1000));
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [running]);

  const nameById = useMemo(() => {
    const map = new Map<string, string>();
    graph?.nodes.forEach((node) => map.set(node.id, node.name));
    return map;
  }, [graph]);

  async function loadGraph(seedId: string) {
    setSelection(null);
    setActiveSeed(seedId);
    try {
      setGraph(await fetchGraph(seedId));
    } catch (e) {
      setGraph(null);
      setError((e as Error).message);
    }
  }

  async function handleRun() {
    if (!file) {
      setError("Choose a PDF first.");
      return;
    }
    setError(null);
    setRunning(true);
    setElapsed(0);
    try {
      const summary = await submitSeed(file);
      setSeeds(await fetchSeeds());
      await loadGraph(summary.seed_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function handleDelete() {
    if (!activeSeed) return;
    try {
      await deleteSeed(activeSeed);
      setSeeds(await fetchSeeds());
      setGraph(null);
      setActiveSeed(null);
      setSelection(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-paper text-ink">
      <header className="flex items-center justify-between border-b border-line px-5 py-3">
        <div className="flex items-center gap-3">
          <span
            className="h-3 w-3 rounded-full"
            style={{
              background: "linear-gradient(140deg, var(--seed-a), var(--seed-b))",
            }}
          />
          <h1 className="display text-lg">Knowledge Base Console</h1>
        </div>
        <p className="hud-label text-ink-dim">
          Chunks {"\u2192"} Qdrant {"\u00B7"} Entities {"\u2192"} Neo4j
        </p>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-72 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line p-4">
          <section className="flex flex-col gap-2">
            <p className="hud-label text-ink-dim">Stored seeds</p>
            {seeds.length === 0 && (
              <p className="text-ink-dim text-xs">No seeds stored yet.</p>
            )}
            <div className="flex flex-col gap-1">
              {seeds.map((seed) => (
                <button
                  key={seed.seed_id}
                  onClick={() => loadGraph(seed.seed_id)}
                  className={`w-full rounded-sm border px-2.5 py-2 text-left text-[11px] transition-colors ${
                    activeSeed === seed.seed_id
                      ? "border-seed text-ink"
                      : "border-line text-ink-dim hover:border-line-strong hover:text-ink"
                  }`}
                >
                  {seed.seed_id}
                </button>
              ))}
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <p className="hud-label text-ink-dim">Run a new seed</p>
            <label className="field cursor-pointer text-center">
              {file ? file.name : "Choose PDF"}
              <input
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <button
              className="btn btn-primary justify-center"
              onClick={handleRun}
              disabled={running}
            >
              {running ? `Running ${elapsed}s` : "Run pipeline"}
            </button>
            <p className="text-ink-dim text-[10px] leading-relaxed">
              A run clears Qdrant and Neo4j, then inserts only the new seed.
            </p>
          </section>

          {activeSeed && (
            <section className="flex flex-col gap-2">
              <p className="hud-label text-ink-dim">Selected</p>
              <p className="text-ink break-all text-[11px]">{activeSeed}</p>
              <button className="btn btn-danger justify-center" onClick={handleDelete}>
                Delete this seed
              </button>
            </section>
          )}

          {error && (
            <div
              role="alert"
              className="border border-line-strong px-3 py-2 text-[11px] leading-relaxed text-ink"
            >
              {error}
            </div>
          )}
        </aside>

        <main className="relative min-h-0 min-w-0 flex-1">
          {graph ? (
            <GraphView
              key={graph.seed_id}
              graph={graph}
              onSelect={setSelection}
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <p className="display text-xl">No graph on screen</p>
              <p className="text-ink-dim max-w-sm text-xs leading-relaxed">
                Pick a stored seed on the left, or upload a PDF and run the
                pipeline to build the graph.
              </p>
            </div>
          )}
          {running && (
            <div className="absolute inset-0 flex items-center justify-center bg-paper/70">
              <p className="hud-label text-ink">Extracting {elapsed}s</p>
            </div>
          )}
        </main>

        <aside className="w-80 shrink-0 border-l border-line">
          <DetailsPanel
            selection={selection}
            nameById={nameById}
            onClose={() => setSelection(null)}
          />
        </aside>
      </div>
    </div>
  );
}
