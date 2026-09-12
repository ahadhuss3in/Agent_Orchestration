"""
THE THREE IDS
-------------
chunk_id    a readable, stable label for one chunk of text.
            Example: "seed-a1b2c3d4:seed.pdf:0"
            It is stored in the Qdrant payload so humans and prompts can read
            it, and it is what Neo4j records as provenance.

point_id    Qdrant insists a point id is a UUID (or integer), and it must be
            deterministic so a re-run updates the same point instead of adding
            a duplicate. So we hash chunk_id into a UUIDv5. Same chunk_id
            always gives the same point_id. This is the whole idempotency fix.

entity_id   a stable identity for one entity, scoped to one seed.
            Example: "seed-a1b2c3d4:person-jane-doe"
            The seed_id prefix is what keeps two different seeds that both
            mention "Jane Doe" from collapsing into one Neo4j node.
"""

import re
import uuid
NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "ai-engine/knowledge-base")


def slugify(text: str) -> str:
    """Turn "Jane  Doe!" into "jane-doe".

    Everything that is not a lowercase letter or digit becomes a single dash.
    Used to build readable ids from human names.
    """
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")


def chunk_id(seed_id: str, source: str, index: int) -> str:
    """Stable label for one chunk.
    """
    return f"{seed_id}:{source}:{index}"


def point_id(cid: str) -> str:
    """Qdrant point id for a chunk_id. Deterministic UUIDv5."""
    return str(uuid.uuid5(NAMESPACE, cid))


def entity_id(seed_id: str, entity_type: str, name: str) -> str:
    """Stable, seed-scoped identity for one entity.
       entity_id("seed-x", "Person", "Jane Doe") -> "seed-x:person-jane-doe"
    """
    return f"{seed_id}:{entity_type.lower()}-{slugify(name)}"
