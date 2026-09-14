import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'
import { appUrl } from '@/lib/app-url'
import { getCurrentUser } from '@/lib/auth'
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){const user=await getCurrentUser();if(!user)return NextResponse.redirect(appUrl('/login',req),303);const{id}=await params;await prisma.eliminationMapping.deleteMany({where:{id,userId:user.id}});return NextResponse.redirect(appUrl('/mappings?deleted=1',req),303)}
