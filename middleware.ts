import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
export function middleware(req:NextRequest){const p=req.nextUrl.pathname;const publicPath=p==='/login'||p==='/register'||p.startsWith('/api/auth/');if(publicPath)return NextResponse.next();if(!req.cookies.get('konsaol_session')?.value&& !p.startsWith('/_next') && !p.startsWith('/api/accurate/oauth/callback')){const u=req.nextUrl.clone();u.pathname='/login';u.search='';return NextResponse.redirect(u)}return NextResponse.next()}
export const config={matcher:['/((?!_next/static|_next/image|favicon.ico|konsaol-logo.png|konsaol-icon.png|icon.png).*)']}
