const API_BASE = "/api"

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error ?? `API error: ${response.status}`)
  }
  return response.json() as Promise<T>
}

function apiGet<T>(path: string): Promise<T> {
  return apiFetch<T>(path)
}

function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method: "POST" }
  if (body !== undefined) {
    init.body = JSON.stringify(body)
  }
  return apiFetch<T>(path, init)
}

function apiPut<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PUT", body: JSON.stringify(body) })
}

function apiPatch<T>(path: string, body: unknown): Promise<T> {
  return apiFetch<T>(path, { method: "PATCH", body: JSON.stringify(body) })
}

function apiDelete<T>(path: string): Promise<T> {
  return apiFetch<T>(path, { method: "DELETE" })
}

export { apiGet, apiPost, apiPut, apiPatch, apiDelete }
