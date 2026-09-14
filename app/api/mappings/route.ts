import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'
import { appUrl } from '@/lib/app-url'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.redirect(appUrl('/login',req),303)
  const f=await req.formData()
  const sourceAccountId=String(f.get('sourceAccountId')||'')
  const targetAccountId=String(f.get('targetAccountId')||'')
  const note=String(f.get('note')||'').trim()
  if(!sourceAccountId||!targetAccountId||sourceAccountId===targetAccountId)return NextResponse.redirect(appUrl('/mappings?error=account',req),303)

  // Company diinfer langsung dari akun. Ini mencegah mismatch antara dropdown database dan akun.
  const [sa,ta]=await Promise.all([
    prisma.account.findFirst({where:{id:sourceAccountId,company:{userId:user.id,active:true}},select:{id:true,companyId:true}}),
    prisma.account.findFirst({where:{id:targetAccountId,company:{userId:user.id,active:true}},select:{id:true,companyId:true}})
  ])
  if(!sa||!ta)return NextResponse.redirect(appUrl('/mappings?error=account',req),303)
  if(sa.companyId===ta.companyId)return NextResponse.redirect(appUrl('/mappings?error=same-company',req),303)

  await prisma.eliminationMapping.upsert({
    where:{userId_sourceAccountId_targetAccountId:{userId:user.id,sourceAccountId,targetAccountId}},
    update:{sourceCompanyId:sa.companyId,targetCompanyId:ta.companyId,note:note||null,active:true},
    create:{userId:user.id,sourceCompanyId:sa.companyId,sourceAccountId,targetCompanyId:ta.companyId,targetAccountId,note:note||null}
  })
  return NextResponse.redirect(appUrl('/mappings?saved=1',req),303)
}
