import { NextRequest, NextResponse } from 'next/server'
import { exchangeAuthorizationCode } from '@/lib/accurate/oauth'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')
  if (error) return NextResponse.redirect(new URL(`/companies?oauthError=${encodeURIComponent(error)}`, req.url))
  if (!code) return NextResponse.redirect(new URL('/companies?oauthError=missing_code', req.url))
  const expectedState = req.cookies.get('accurate_oauth_state')?.value
  if (!state || !expectedState || state !== expectedState) return NextResponse.redirect(new URL('/companies?oauthError=invalid_state', req.url))
  try {
    await exchangeAuthorizationCode(code)
    const res = NextResponse.redirect(new URL('/companies?oauth=connected', req.url))
    res.cookies.delete('accurate_oauth_state')
    return res
  } catch (e:any) {
    return NextResponse.redirect(new URL(`/companies?oauthError=${encodeURIComponent(e.message || 'oauth_failed')}`, req.url))
  }
}
