"use client";

import { useState, type SyntheticEvent } from "react";

import { queryAgent, type Agent, type Citation } from "@/lib/api";

type Turn = {
  role: "operator" | "agent";
  text: string;
  citations?: Citation[];
};

/**
 * One agent's chat thread.
 *
 * The thread shown here is only the current session; the agent's real memory
 * lives in Neo4j and is replayed by the backend on every turn. Mounted with
 * `key={agent_id}` so switching agents starts a fresh visible log.
 */
export default function AgentChat({ agent }: { agent: Agent }) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(event: SyntheticEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || busy) return;

    setInput("");
    setError(null);
    setBusy(true);
    setTurns((prev) => [...prev, { role: "operator", text: message }]);

    try {
      const reply = await queryAgent(agent.agent_id, message);
      setTurns((prev) => [
        ...prev,
        { role: "agent", text: reply.reply, citations: reply.citations },
      ]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="hud-label text-ink-dim">Talk</p>

      {turns.length === 0 && (
        <p className="text-ink-dim text-xs leading-relaxed">
          Ask {agent.name} something. It answers from this seed&apos;s stored
          chunks and remembers the thread.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {turns.map((turn, index) => (
          <div key={index} className="flex flex-col gap-1">
            <p className="hud-label text-ink-dim">
              {turn.role === "operator" ? "Operator" : agent.name}
            </p>
            <p className="text-ink text-xs leading-relaxed whitespace-pre-wrap">
              {turn.text}
            </p>
            {turn.citations && turn.citations.length > 0 && (
              <p className="text-ink-dim text-[10px] leading-snug break-words">
                {turn.citations.length} citation
                {turn.citations.length === 1 ? "" : "s"}:{" "}
                {turn.citations
                  .map((c) => c.source)
                  .filter(Boolean)
                  .slice(0, 3)
                  .join(", ")}
              </p>
            )}
          </div>
        ))}
        {busy && <p className="hud-label text-ink-dim">{"\u2026"}</p>}
      </div>

      {error && (
        <p className="border border-line-strong px-2 py-1.5 text-[10px] leading-relaxed text-ink">
          {error}
        </p>
      )}

      <form onSubmit={send} className="flex flex-col gap-2">
        <textarea
          className="field resize-none"
          rows={2}
          value={input}
          placeholder="Ask a question"
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              send(event);
            }
          }}
          disabled={busy}
        />
        <button
          type="submit"
          className="btn justify-center"
          disabled={busy || !input.trim()}
        >
          {busy ? "Thinking" : "Send"}
        </button>
      </form>
    </div>
  );
}
