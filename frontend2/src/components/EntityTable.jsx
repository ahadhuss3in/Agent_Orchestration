// Compact table of extracted entities. entity_id is shown because it is what
// Neo4j keys on and what you search when debugging.
export default function EntityTable({ entities }) {
  if (!entities.length) return null
  return (
    <div>
      <h3 className="section-title">Entities ({entities.length})</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Entity id</th>
            </tr>
          </thead>
          <tbody>
            {entities.map((entity) => (
              <tr key={entity.entity_id}>
                <td>{entity.name}</td>
                <td>
                  <span className="tag">{entity.type}</span>
                </td>
                <td className="mono small">{entity.entity_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
