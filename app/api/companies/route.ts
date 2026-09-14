import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'
export async function POST(req:Request){const f=await req.formData();await prisma.company.create({data:{name:String(f.get('name')),accurateHost:String(f.get('accurateHost')),sessionId:String(f.get('sessionId'))}});return NextResponse.redirect(new URL('/companies',req.url),303)}
