import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { appUrl } from '@/lib/app-url'
export async function POST(req:Request){const f=await req.formData();const name=String(f.get('name')||'').trim();const email=String(f.get('email')||'').trim().toLowerCase();const password=String(f.get('password')||'');if(!name||!email||password.length<8)return NextResponse.redirect(appUrl('/register?error=invalid',req),303);if(await prisma.user.findUnique({where:{email}}))return NextResponse.redirect(appUrl('/register?error=exists',req),303);await prisma.user.create({data:{name,email,passwordHash:hashPassword(password),subscriptionStatus:'TRIAL',trialEndsAt:new Date(Date.now()+3*86400000)}});return NextResponse.redirect(appUrl('/login?registered=1',req),303)}
