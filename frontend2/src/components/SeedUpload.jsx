import { useRef, useState } from 'react'

// The upload control. It accepts a PDF by click or by drag and drop, lets you
// pick the seed type, and hands everything up to App on Run.
export default function SeedUpload({ file, running, onFile, onRun }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function pickFromDrop(event) {
    event.preventDefault()
    setDragging(false)
    const dropped = event.dataTransfer.files?.[0]
    if (dropped) onFile(dropped)
  }

  return (
    <div className="stack">
      <div className="field">
        <label className="label">Seed document</label>
        <div
          className={`dropzone ${dragging ? 'dropzone-active' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={pickFromDrop}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') inputRef.current?.click()
          }}
        >
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            hidden
            onChange={(event) => onFile(event.target.files?.[0] ?? null)}
          />
          {file ? (
            <>
              <span className="dropzone-file">{file.name}</span>
              <span className="muted">{Math.round(file.size / 1024)} KB</span>
            </>
          ) : (
            <>
              <span className="dropzone-title">Drop a PDF here</span>
              <span className="muted">or click to choose one</span>
            </>
          )}
        </div>
      </div>

      <button className="run" type="button" onClick={onRun} disabled={running}>
        {running ? 'Running...' : 'Build knowledge base'}
      </button>
    </div>
  )
}
