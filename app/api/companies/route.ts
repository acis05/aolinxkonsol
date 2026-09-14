import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { appUrl } from '@/lib/app-url'

export async function POST(req: Request) {
  const form = await req.formData()
  const accurateDbId = String(form.get('accurateDbId') || '').trim()
  const name = String(form.get('name') || '').trim()

  if (!accurateDbId || !name) {
    return NextResponse.redirect(appUrl('/companies?companyError=invalid_company', req), 303)
  }

  await prisma.company.upsert({
    where: { accurateDbId },
    update: { name, active: true },
    create: { accurateDbId, name, active: true }
  })

  return NextResponse.redirect(appUrl('/companies?company=added', req), 303)
}
