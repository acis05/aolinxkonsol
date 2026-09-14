import { NextRequest, NextResponse } from 'next/server'
import { exchangeAuthorizationCode, listDatabases } from '@/lib/accurate/oauth'
import { appUrl } from '@/lib/app-url'
import { getCurrentUser } from '@/lib/auth'

export const dynamic='force-dynamic'

export async function GET(req:NextRequest){
  const user=await getCurrentUser()
  if(!user)return NextResponse.redirect(appUrl('/login',req))
  const url=new URL(req.url)
  const code=url.searchParams.get('code')
  const state=url.searchParams.get('state')
  const error=url.searchParams.get('error')
  if(error)return NextResponse.redirect(appUrl(`/companies?oauthError=${encodeURIComponent(error)}`,req))
  if(!code)return NextResponse.redirect(appUrl('/companies?oauthError=missing_code',req))
  const expected=req.cookies.get('accurate_oauth_state')?.value
  if(!state||!expected||state!==expected)return NextResponse.redirect(appUrl('/companies?oauthError=invalid_state',req))
  try{
    await exchangeAuthorizationCode(code,user.id)
    // Jangan hanya menyimpan token: validasi langsung bahwa token benar-benar
    // dapat membaca daftar database. Ini membuat kegagalan OAuth/API terlihat.
    const databases=await listDatabases(user.id)
    const res=NextResponse.redirect(appUrl(`/companies?oauth=connected&dbCount=${databases.length}`,req))
    res.cookies.delete('accurate_oauth_state')
    return res
  }catch(e:any){
    const res=NextResponse.redirect(appUrl(`/companies?oauthError=${encodeURIComponent(e?.message||'oauth_failed')}`,req))
    res.cookies.delete('accurate_oauth_state')
    return res
  }
}
