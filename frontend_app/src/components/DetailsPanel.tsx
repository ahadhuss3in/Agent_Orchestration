"use client";

import type { Agent, Archetype } from "@/lib/api";
import { ARCHETYPE_BY_ID } from "@/lib/archetypes";
import AgentChat from "./AgentChat";
import ArchetypePicker from "./ArchetypePicker";
import type { Selection } from "./GraphView";

function Chunks({ ids }: { ids: string[] }) {
  if (!ids?.length) {
    return <p className="text-ink-dim text-xs">No chunk citation recorded.</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {ids.map((id) => (
        <li
          key={id}
          className="text-ink-dim text-[11px] leading-snug break-all"
          title={id}
        >
          {id}
        </li>
      ))}
    </ul>
  );
}

function AgentBlock({
  agent,
  onPromote,
}: {
  agent: Agent;
  onPromote: (entityId: string, archetype: Archetype | null) => void;
}) {
  const archetype = agent.archetype ? ARCHETYPE_BY_ID[agent.archetype] : null;
  return (
    <div className="flex flex-col gap-4 border-t border-line pt-4">
      <div className="flex flex-col gap-1">
        <p className="hud-label text-ink-dim">Agent</p>
        <p className="text-ink text-xs">
          Rank {agent.rank} {"\u00B7"} degree {agent.degree} {"\u00B7"}{" "}
          {archetype ? archetype.name : "no archetype"}
        </p>
        {archetype && (
          <p className="text-ink-dim text-[11px]">{archetype.role}</p>
        )}
      </div>
      <div className="flex flex-col gap-2">
        <p className="hud-label text-ink-dim">Archetype</p>
        <ArchetypePicker
          value={agent.archetype}
          onChange={(next) => onPromote(agent.entity_id, next)}
        />
      </div>
      <AgentChat key={agent.agent_id} agent={agent} />
    </div>
  );
}

export default function DetailsPanel({
  selection,
  nameById,
  agentsByEntity,
  onPromote,
  onClose,
}: {
  selection: Selection;
  nameById: Map<string, string>;
  agentsByEntity: Map<string, Agent>;
  onPromote: (entityId: string, archetype: Archetype | null) => void;
  onClose: () => void;
}) {
  if (!selection) {
    return (
      <div className="flex h-full flex-col items-start justify-center gap-2 px-5 text-center">
        <p className="hud-label text-ink-dim">Details</p>
        <p className="text-ink-dim text-xs">
          Click a node or an edge to see its description and the chunks it is
          grounded in.
        </p>
      </div>
    );
  }

  const agent =
    selection.kind === "node" ? agentsByEntity.get(selection.node.id) : undefined;

  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <p className="hud-label text-ink-dim">
          {selection.kind === "node" ? "Entity" : "Relationship"}
        </p>
        <button className="text-ink-dim hover:text-ink text-xs" onClick={onClose}>
          close
        </button>
      </div>

      {selection.kind === "node" ? (
        <>
          <div className="flex flex-col gap-1">
            <h2 className="display text-2xl">{selection.node.name}</h2>
            <p className="hud-label text-ink-dim">{selection.node.type}</p>
          </div>
          {selection.node.role_in_seed && (
            <div className="flex flex-col gap-1">
              <p className="hud-label text-ink-dim">Role</p>
              <p className="text-ink text-xs">{selection.node.role_in_seed}</p>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <p className="hud-label text-ink-dim">Description</p>
            <p className="text-ink text-xs leading-relaxed">
              {selection.node.description || "None recorded."}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="hud-label text-ink-dim">
              Cited chunks ({selection.node.source_chunk_ids.length})
            </p>
            <Chunks ids={selection.node.source_chunk_ids} />
          </div>
          {agent && <AgentBlock agent={agent} onPromote={onPromote} />}
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <p className="hud-label text-ink-dim">{selection.edge.type}</p>
            <div className="text-ink text-sm">
              <span>{nameById.get(selection.edge.source) ?? selection.edge.source}</span>
              <span className="text-ink-dim"> {"\u2192"} </span>
              <span>{nameById.get(selection.edge.target) ?? selection.edge.target}</span>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <p className="hud-label text-ink-dim">Description</p>
            <p className="text-ink text-xs leading-relaxed">
              {selection.edge.description || "None recorded."}
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <p className="hud-label text-ink-dim">
              Grounded in ({selection.edge.source_chunk_ids.length})
            </p>
            <Chunks ids={selection.edge.source_chunk_ids} />
          </div>
        </>
      )}
    </div>
  );
}
