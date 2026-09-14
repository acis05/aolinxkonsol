export type AccurateListResponse<T = any> = {
  d?: T[]
  s?: boolean
  message?: string
  sp?: { page?: number; pageSize?: number; pageCount?: number; rowCount?: number }
  [key: string]: any
}

export async function accurateGet<T>(host: string, path: string, sessionId: string | null | undefined, params: Record<string, string | number | undefined> = {}) {
  const url = new URL(path, host.endsWith('/') ? host : host + '/')
  Object.entries(params).forEach(([k, v]) => { if (v !== undefined) url.searchParams.set(k, String(v)) })
  const headers: Record<string,string> = { Accept: 'application/json' }
  if (process.env.ACCURATE_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.ACCURATE_ACCESS_TOKEN}`
  if (sessionId) headers['X-Session-ID'] = sessionId
  const res = await fetch(url, { headers, redirect: 'follow', cache: 'no-store' })
  const text = await res.text()
  let body: any
  try { body = JSON.parse(text) } catch { body = { raw: text } }
  if (!res.ok) throw new Error(`Accurate ${res.status}: ${body?.message || text.slice(0,300)}`)
  return body as T
}
