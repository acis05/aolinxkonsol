import { prisma } from '@/lib/db'
import { openDatabase } from '@/lib/accurate/oauth'
import { NextResponse } from 'next/server'
export async function POST(req:Request){
  const f=await req.formData()
  const accurateDbId=String(f.get('accurateDbId')||'')
  const name=String(f.get('name')||'')
  if(!accurateDbId || !name) throw new Error('Database Accurate wajib dipilih')
  const opened=await openDatabase(accurateDbId)
  await prisma.company.upsert({
    where:{accurateDbId},
    update:{name,accurateHost:opened.host,sessionId:opened.sessionId,active:true},
    create:{name,accurateDbId,accurateHost:opened.host,sessionId:opened.sessionId}
  })
  return NextResponse.redirect(new URL('/companies?company=added',req.url),303)
}
