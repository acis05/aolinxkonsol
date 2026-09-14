import { NextRequest, NextResponse } from 'next/server'
import { exchangeAuthorizationCode } from '@/lib/accurate/oauth'
import { appUrl } from '@/lib/app-url'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(appUrl(`/companies?oauthError=${encodeURIComponent(error)}`, req))
  }
  if (!code) {
    return NextResponse.redirect(appUrl('/companies?oauthError=missing_code', req))
  }

  const expectedState = req.cookies.get('accurate_oauth_state')?.value
  if (!state || !expectedState || state !== expectedState) {
    return NextResponse.redirect(appUrl('/companies?oauthError=invalid_state', req))
  }

  try {
    await exchangeAuthorizationCode(code)
    const res = NextResponse.redirect(appUrl('/companies?oauth=connected', req))
    res.cookies.delete('accurate_oauth_state')
    return res
  } catch (e: any) {
    const message = e?.message || 'oauth_failed'
    return NextResponse.redirect(appUrl(`/companies?oauthError=${encodeURIComponent(message)}`, req))
  }
}
