import { NextRequest, NextResponse } from 'next/server'
import { exchangeAuthorizationCode, listDatabases } from '@/lib/accurate/oauth'
import { appUrl } from '@/lib/app-url'
import { createSessionToken, SESSION_COOKIE } from '@/lib/auth'
import { parseOAuthState } from '@/lib/oauth-state'
import { prisma } from '@/lib/db'

export const dynamic='force-dynamic'

function withSession(res:NextResponse,user:{id:string;role:string}){
  res.cookies.set(SESSION_COOKIE,createSessionToken(user),{
    httpOnly:true,
    secure:process.env.NODE_ENV==='production',
    sameSite:'lax',
    path:'/',
    maxAge:7*86400,
  })
  res.cookies.delete('accurate_oauth_state')
  return res
}

export async function GET(req:NextRequest){
  const url=new URL(req.url)
  const code=url.searchParams.get('code')
  const state=url.searchParams.get('state')
  const oauthError=url.searchParams.get('error')

  // State membawa identitas user yang ditandatangani, sehingga callback tidak
  // bergantung pada cookie session yang kadang hilang setelah round-trip OAuth.
  const parsed=parseOAuthState(state)
  if(!parsed){
    return NextResponse.redirect(appUrl('/login?error=invalid_oauth_state',req))
  }
  const user=await prisma.user.findUnique({where:{id:parsed.uid}})
  if(!user||!user.active){
    return NextResponse.redirect(appUrl('/login?error=user_not_found',req))
  }

  if(oauthError){
    return withSession(NextResponse.redirect(appUrl(`/companies?oauthError=${encodeURIComponent(oauthError)}`,req)),user)
  }
  if(!code){
    return withSession(NextResponse.redirect(appUrl('/companies?oauthError=missing_code',req)),user)
  }

  try{
    await exchangeAuthorizationCode(code,user.id)
    const databases=await listDatabases(user.id)
    return withSession(NextResponse.redirect(appUrl(`/companies?oauth=connected&dbCount=${databases.length}`,req)),user)
  }catch(e:any){
    return withSession(NextResponse.redirect(appUrl(`/companies?oauthError=${encodeURIComponent(e?.message||'oauth_failed')}`,req)),user)
  }
}
