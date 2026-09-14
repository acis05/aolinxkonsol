import { prisma } from '@/lib/db'
import { decryptSecret, encryptSecret } from '@/lib/crypto'

const AUTHORIZE_URL = 'https://account.accurate.id/oauth/authorize'
const TOKEN_URL = 'https://account.accurate.id/oauth/token'
const ACCOUNT_API = 'https://account.accurate.id'

type TokenResponse = {
  access_token: string
  refresh_token: string
  token_type?: string
  expires_in: number
  scope?: string
  user?: { id?: string | number; name?: string; email?: string }
}

function credentials() {
  const clientId = process.env.ACCURATE_CLIENT_ID
  const clientSecret = process.env.ACCURATE_CLIENT_SECRET
  const redirectUri = process.env.ACCURATE_REDIRECT_URI
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('ACCURATE_CLIENT_ID, ACCURATE_CLIENT_SECRET, dan ACCURATE_REDIRECT_URI wajib diisi')
  }
  return { clientId, clientSecret, redirectUri }
}

export function buildAuthorizeUrl(state: string) {
  const { clientId, redirectUri } = credentials()
  const url = new URL(AUTHORIZE_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', process.env.ACCURATE_OAUTH_SCOPES || 'journal_voucher_view')
  url.searchParams.set('state', state)
  return url.toString()
}

async function tokenRequest(body: URLSearchParams): Promise<TokenResponse> {
  const { clientId, clientSecret } = credentials()
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body,
    cache: 'no-store'
  })
  const text = await res.text()
  let json: any
  try { json = JSON.parse(text) } catch { json = { raw: text } }
  if (!res.ok || !json.access_token) throw new Error(`OAuth Accurate gagal (${res.status}): ${json.error_description || json.error || text.slice(0,300)}`)
  return json
}

export async function exchangeAuthorizationCode(code: string) {
  const { redirectUri } = credentials()
  const token = await tokenRequest(new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri
  }))
  await saveToken(token)
  return token
}

async function saveToken(token: TokenResponse) {
  const expiresAt = new Date(Date.now() + Number(token.expires_in || 0) * 1000)
  await prisma.accurateOAuthCredential.upsert({
    where: { id: 'primary' },
    update: {
      accessTokenEncrypted: encryptSecret(token.access_token),
      refreshTokenEncrypted: encryptSecret(token.refresh_token),
      tokenType: token.token_type || 'bearer',
      scope: token.scope || null,
      expiresAt,
      accurateUserId: token.user?.id != null ? String(token.user.id) : null,
      accurateUserName: token.user?.name || null,
      accurateUserEmail: token.user?.email || null
    },
    create: {
      id: 'primary',
      accessTokenEncrypted: encryptSecret(token.access_token),
      refreshTokenEncrypted: encryptSecret(token.refresh_token),
      tokenType: token.token_type || 'bearer',
      scope: token.scope || null,
      expiresAt,
      accurateUserId: token.user?.id != null ? String(token.user.id) : null,
      accurateUserName: token.user?.name || null,
      accurateUserEmail: token.user?.email || null
    }
  })
}

export async function getOAuthStatus() {
  const row = await prisma.accurateOAuthCredential.findUnique({ where: { id: 'primary' } })
  if (!row) return { connected: false as const }
  return {
    connected: true as const,
    expiresAt: row.expiresAt,
    scope: row.scope,
    userName: row.accurateUserName,
    userEmail: row.accurateUserEmail
  }
}

export async function getValidAccessToken() {
  const row = await prisma.accurateOAuthCredential.findUnique({ where: { id: 'primary' } })
  if (!row) throw new Error('Accurate belum terhubung via OAuth')
  const refreshBeforeMs = 24 * 60 * 60 * 1000
  if (row.expiresAt.getTime() - Date.now() > refreshBeforeMs) return decryptSecret(row.accessTokenEncrypted)

  const refresh = decryptSecret(row.refreshTokenEncrypted)
  const token = await tokenRequest(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }))
  if (!token.refresh_token) token.refresh_token = refresh
  await saveToken(token)
  return token.access_token
}

async function accountGet(path: string, params: Record<string,string> = {}) {
  const token = await getValidAccessToken()
  const url = new URL(path, ACCOUNT_API)
  Object.entries(params).forEach(([k,v]) => url.searchParams.set(k,v))
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'follow', cache: 'no-store' })
  const text = await res.text()
  let body: any
  try { body = JSON.parse(text) } catch { body = { raw: text } }
  if (!res.ok || body?.s === false) throw new Error(`Accurate API gagal (${res.status}): ${body?.d?.join?.(', ') || body?.message || text.slice(0,300)}`)
  return body
}

export type AccurateDatabase = { id: number; alias: string; expired?: boolean; demo?: boolean; sample?: boolean }

export async function listDatabases(): Promise<AccurateDatabase[]> {
  const body = await accountGet('/api/db-list.do')
  return Array.isArray(body?.d) ? body.d : []
}

export async function openDatabase(dbId: string | number) {
  const body = await accountGet('/api/open-db.do', { id: String(dbId) })
  if (!body?.host || !body?.session) throw new Error('Response open-db.do tidak mengandung host/session')
  return { host: String(body.host), sessionId: String(body.session) }
}
