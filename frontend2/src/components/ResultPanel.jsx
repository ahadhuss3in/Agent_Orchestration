import EntityTable from './EntityTable.jsx'
import RelationshipTable from './RelationshipTable.jsx'

// Renders one successful /seed response.
export default function ResultPanel({ result, onDelete }) {
  const entities = result.entities ?? []
  const relationships = result.relationships ?? []
  const briefing = result.briefing ?? {}
  const briefingSections = [
    ['Threats', briefing.threats],
    ['Key points', briefing.key_points],
    ['Precautions', briefing.precautions],
    ['Predictions', briefing.predictions],
  ]

  return (
    <div className="stack">
      <div className="result-head">
        <div>
          <span className="label">Seed</span>
          <div className="mono seed-id">{result.seed_id}</div>
        </div>
        <span className="pill">{result.phase}</span>
      </div>

      <div className="tiles">
        <div className="tile">
          <span className="tile-num">{result.chunks_stored}</span>
          <span className="muted small">chunks in Qdrant</span>
        </div>
        <div className="tile">
          <span className="tile-num">{entities.length}</span>
          <span className="muted small">entities in Neo4j</span>
        </div>
        <div className="tile">
          <span className="tile-num">{relationships.length}</span>
          <span className="muted small">relationships</span>
        </div>
      </div>

      <EntityTable entities={entities} />
      <RelationshipTable relationships={relationships} />

      <div>
        <h3 className="section-title">Briefing</h3>
        <div className="briefing">
          {briefingSections.map(([title, values]) => (
            <div key={title} className="briefing-block">
              <h4>{title}</h4>
              {values?.length ? (
                <ul>
                  {values.map((value, index) => (
                    <li key={index}>{value}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted small">None</p>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="danger-row">
        <button className="danger" type="button" onClick={onDelete}>
          Delete this seed
        </button>
        {result.deleted && (
          <span className="muted small">
            Removed {result.deleted.qdrant_points} Qdrant points and Neo4j nodes.
          </span>
        )}
      </div>
    </div>
  )
}
