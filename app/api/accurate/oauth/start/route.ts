import { NextResponse } from 'next/server'
import { buildAuthorizeUrl } from '@/lib/accurate/oauth'
import { getCurrentUser } from '@/lib/auth'
import { appUrl, getPublicOrigin } from '@/lib/app-url'
import { createOAuthState } from '@/lib/oauth-state'

export async function GET(req:Request){
  const user=await getCurrentUser()
  if(!user)return NextResponse.redirect(appUrl('/login',req))
  try{
    const callback=process.env.ACCURATE_REDIRECT_URI
    if(!callback)throw new Error('ACCURATE_REDIRECT_URI belum diisi')
    const cb=new URL(callback)
    const publicOrigin=new URL(getPublicOrigin(req))
    if(cb.origin!==publicOrigin.origin){
      throw new Error(`Domain callback OAuth (${cb.origin}) berbeda dengan domain aplikasi (${publicOrigin.origin}). Samakan ACCURATE_REDIRECT_URI dan APP_URL.`)
    }
    const state=createOAuthState(user.id)
    const res=NextResponse.redirect(buildAuthorizeUrl(state))
    // Cookie ini hanya lapisan tambahan; callback tidak lagi bergantung padanya.
    res.cookies.set('accurate_oauth_state',state,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:600,path:'/'})
    return res
  }catch(e:any){
    return NextResponse.redirect(appUrl(`/companies?oauthError=${encodeURIComponent(e?.message||'oauth_start_failed')}`,req))
  }
}
