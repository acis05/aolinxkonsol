import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { buildAuthorizeUrl } from '@/lib/accurate/oauth'
import { getCurrentUser } from '@/lib/auth'
import { appUrl } from '@/lib/app-url'
export async function GET(req:Request){const user=await getCurrentUser();if(!user)return NextResponse.redirect(appUrl('/login',req));const state=crypto.randomBytes(24).toString('base64url');const res=NextResponse.redirect(buildAuthorizeUrl(state));res.cookies.set('accurate_oauth_state',state,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:600,path:'/'});return res}
