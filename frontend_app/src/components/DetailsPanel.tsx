"use client";

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

export default function DetailsPanel({
  selection,
  nameById,
  onClose,
}: {
  selection: Selection;
  nameById: Map<string, string>;
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
