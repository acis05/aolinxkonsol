/**
 * Resolve the public origin of the application.
 *
 * Railway/other reverse proxies run the Node process on an internal address
 * such as 0.0.0.0:8080. `request.url` can therefore contain that internal
 * address even though the browser is using a public HTTPS domain.
 *
 * Priority:
 * 1. APP_URL / NEXT_PUBLIC_APP_URL explicitly configured by the operator.
 * 2. Railway's public domain environment variable.
 * 3. Reverse-proxy forwarded headers.
 * 4. Request URL origin as a local-development fallback.
 */
export function getPublicOrigin(request?: Request) {
  const configured = process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL
  if (configured) return configured.replace(/\/$/, '')

  const railwayDomain = process.env.RAILWAY_PUBLIC_DOMAIN
  if (railwayDomain) return `https://${railwayDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`

  if (request) {
    const forwardedHost = request.headers.get('x-forwarded-host')
    const host = forwardedHost || request.headers.get('host')
    const forwardedProto = request.headers.get('x-forwarded-proto')
    const proto = forwardedProto?.split(',')[0]?.trim() || 'https'

    // Never deliberately construct a public redirect to an internal bind host.
    if (host && !/^(0\.0\.0\.0|127\.0\.0\.1)(:\d+)?$/i.test(host)) {
      return `${proto}://${host}`
    }

    try {
      const origin = new URL(request.url).origin
      if (!/^https?:\/\/(0\.0\.0\.0|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return origin
    } catch {
      // ignored: caller will get a clear configuration error below
    }
  }

  // Local dev fallback only. In Railway, set APP_URL or rely on RAILWAY_PUBLIC_DOMAIN.
  if (process.env.NODE_ENV !== 'production') return 'http://localhost:3000'

  throw new Error('Public application URL tidak ditemukan. Isi APP_URL=https://domain-anda.up.railway.app di Railway Variables.')
}

export function appUrl(path: string, request?: Request) {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return new URL(normalizedPath, `${getPublicOrigin(request)}/`)
}
