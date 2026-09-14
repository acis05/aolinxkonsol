import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'
export async function POST(req: Request) {
  await prisma.accurateOAuthCredential.deleteMany({ where: { id: 'primary' } })
  return NextResponse.redirect(new URL('/companies?oauth=disconnected', req.url), 303)
}
