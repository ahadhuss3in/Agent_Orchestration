// Each relationship as source -> type -> target, the way it becomes a Neo4j
// edge. The type is uppercased because that is how it is stored.
export default function RelationshipTable({ relationships }) {
  if (!relationships.length) return null
  return (
    <div>
      <h3 className="section-title">Relationships ({relationships.length})</h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Type</th>
              <th>Target</th>
            </tr>
          </thead>
          <tbody>
            {relationships.map((rel, index) => (
              <tr key={index}>
                <td>{rel.source_name}</td>
                <td className="mono small">{rel.type}</td>
                <td>{rel.target_name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
