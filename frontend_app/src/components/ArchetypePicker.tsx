"use client";

import type { Archetype } from "@/lib/api";
import { ARCHETYPES, ARCHETYPE_CODE } from "@/lib/archetypes";

/**
 * The four-way archetype control plus the "leave as is" choice.
 *
 * Clicking the active archetype again clears it, which is the same as choosing
 * "leave as it is": the entity stays in the pool with no personality.
 */
export default function ArchetypePicker({
  value,
  onChange,
  disabled = false,
}: {
  value: Archetype | null;
  onChange: (archetype: Archetype | null) => void;
  disabled?: boolean;
}) {
  return (
    <div className="archetype-picker" role="group" aria-label="Archetype">
      {ARCHETYPES.map((archetype) => (
        <button
          key={archetype.id}
          type="button"
          className="archetype-option"
          data-active={value === archetype.id}
          aria-pressed={value === archetype.id}
          title={`${archetype.name} \u2014 ${archetype.role}`}
          disabled={disabled}
          onClick={() => onChange(value === archetype.id ? null : archetype.id)}
        >
          {ARCHETYPE_CODE[archetype.id]}
        </button>
      ))}
      <button
        type="button"
        className="archetype-option archetype-none"
        data-active={value === null}
        aria-pressed={value === null}
        title="Leave it as it is"
        disabled={disabled}
        onClick={() => onChange(null)}
      >
        {"\u2014"}
      </button>
    </div>
  );
}
