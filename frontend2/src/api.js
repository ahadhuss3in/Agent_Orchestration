// All network calls to the knowledge-base API live here, so components do not
// deal with fetch or error shapes directly.

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:8000'

async function parse(res) {
  // The API returns JSON on success and on handled errors ({"detail": ...}).
  // Read it once, and fall back to an empty object if the body is not JSON.
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(data.detail || `Request failed (${res.status})`)
  }
  return data
}

export async function submitSeed(file) {
  // FormData matches the FastAPI endpoint's File parameter. Do not set
  // Content-Type by hand, the browser must add the multipart boundary.
  const body = new FormData()
  body.append('file', file)

  const res = await fetch(`${API_BASE}/seed`, { method: 'POST', body })
  return parse(res)
}

export async function deleteSeed(seedId) {
  const res = await fetch(`${API_BASE}/seed/${encodeURIComponent(seedId)}`, {
    method: 'DELETE',
  })
  return parse(res)
}
