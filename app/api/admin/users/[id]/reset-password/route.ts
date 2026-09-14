import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser, hashPassword } from '@/lib/auth'
import { appUrl } from '@/lib/app-url'
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){const admin=await getCurrentUser();if(!admin||admin.role!=='ADMIN')return NextResponse.redirect(appUrl('/login',req),303);const{id}=await params;const f=await req.formData();const password=String(f.get('password')||'');if(password.length<8)return NextResponse.redirect(appUrl('/admin?error=password_min_8',req),303);await prisma.user.update({where:{id},data:{passwordHash:hashPassword(password)}});return NextResponse.redirect(appUrl('/admin?ok=1',req),303)}
