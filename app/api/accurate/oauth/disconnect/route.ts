import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'
import { appUrl } from '@/lib/app-url'
import { getCurrentUser } from '@/lib/auth'
export async function POST(req:Request){const user=await getCurrentUser();if(!user)return NextResponse.redirect(appUrl('/login',req),303);await prisma.accurateOAuthCredential.deleteMany({where:{userId:user.id}});return NextResponse.redirect(appUrl('/companies?oauth=disconnected',req),303)}
