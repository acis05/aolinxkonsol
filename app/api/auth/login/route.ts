import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { verifyPassword, createSessionToken } from '@/lib/auth'
import { appUrl } from '@/lib/app-url'
export async function POST(req:Request){const f=await req.formData();const email=String(f.get('email')||'').trim().toLowerCase();const password=String(f.get('password')||'');const user=await prisma.user.findUnique({where:{email}});if(!user||!user.active||!verifyPassword(password,user.passwordHash))return NextResponse.redirect(appUrl('/login?error=1',req),303);const res=NextResponse.redirect(appUrl(user.role==='ADMIN'?'/admin':'/',req),303);res.cookies.set('konsaol_session',createSessionToken(user),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:7*86400});return res}
