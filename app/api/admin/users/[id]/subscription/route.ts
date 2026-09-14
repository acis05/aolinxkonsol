import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { appUrl } from '@/lib/app-url'
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){const admin=await getCurrentUser();if(!admin||admin.role!=='ADMIN')return NextResponse.redirect(appUrl('/login',req),303);const{id}=await params;const f=await req.formData();const status=String(f.get('status')||'TRIAL') as any,addonSlots=Math.min(5,Math.max(0,Number(f.get('addonSlots')||0))),endsAt=String(f.get('endsAt')||'');const data:any={subscriptionStatus:status,addonSlots};if(status==='ACTIVE')data.subscriptionEndsAt=endsAt?new Date(`${endsAt}T23:59:59`):new Date(Date.now()+365*86400000);if(status==='TRIAL')data.trialEndsAt=new Date(Date.now()+3*86400000);await prisma.user.update({where:{id},data});return NextResponse.redirect(appUrl('/admin?ok=1',req),303)}
