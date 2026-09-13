import { useEffect, useRef, useState } from 'react'
import { deleteSeed, submitSeed } from './api'
import SeedUpload from './components/SeedUpload.jsx'
import RunStatus from './components/RunStatus.jsx'
import ResultPanel from './components/ResultPanel.jsx'

export default function App() {
  const [file, setFile] = useState(null)
  const [running, setRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const timerRef = useRef(null)

  // A run is 30-60 seconds of LLM calls. Without a ticking clock the UI looks
  // frozen, so show elapsed seconds while the request is in flight.
  useEffect(() => {
    if (!running) {
      clearInterval(timerRef.current)
      return undefined
    }
    const start = Date.now()
    timerRef.current = setInterval(() => {
      setElapsed(Math.round((Date.now() - start) / 1000))
    }, 1000)
    return () => clearInterval(timerRef.current)
  }, [running])

  async function handleRun() {
    if (!file) {
      setError('Choose a PDF first.')
      return
    }
    setError(null)
    setResult(null)
    setElapsed(0)
    setRunning(true)
    try {
      setResult(await submitSeed(file))
    } catch (e) {
      setError(e.message)
    } finally {
      setRunning(false)
    }
  }

  async function handleDelete() {
    if (!result?.seed_id) return
    try {
      const data = await deleteSeed(result.seed_id)
      setResult((prev) => ({ ...prev, deleted: data.deleted }))
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div>
          <h1>KB Console</h1>
          <p className="subtitle">
            Seed PDF to knowledge base: chunks to Qdrant, entities to Neo4j.
          </p>
        </div>
      </header>

      <main className="grid">
        <section className="card">
          <SeedUpload
            file={file}
            running={running}
            onFile={setFile}
            onRun={handleRun}
          />
          <RunStatus running={running} elapsed={elapsed} />
          {error && (
            <div className="banner error" role="alert">
              {error}
            </div>
          )}
        </section>

        <section className="card">
          {result ? (
            <ResultPanel result={result} onDelete={handleDelete} />
          ) : (
            <div className="empty">
              <p>No run yet.</p>
              <p className="muted">
                Upload a PDF and run it. The result panel shows the extracted
                entities, relationships, and briefing.
              </p>
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
