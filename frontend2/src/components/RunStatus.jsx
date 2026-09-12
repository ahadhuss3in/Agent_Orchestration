// Shows a spinner and elapsed seconds while the pipeline runs. A full run is
// many LLM calls, so this is the only feedback the user gets until it returns.
export default function RunStatus({ running, elapsed }) {
  if (!running) return null
  return (
    <div className="status" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>Running pipeline... {elapsed}s</span>
      <span className="muted small">
        intake, store, extract, graph write. This can take up to a minute.
      </span>
    </div>
  )
}
