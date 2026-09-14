import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'
import { appUrl } from '@/lib/app-url'

export async function POST(req: Request) {
  await prisma.accurateOAuthCredential.deleteMany({ where: { id: 'primary' } })
  return NextResponse.redirect(appUrl('/companies?oauth=disconnected', req), 303)
}
