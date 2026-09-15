import { prisma } from '@/lib/db'
import { NextResponse } from 'next/server'
import { appUrl } from '@/lib/app-url'
import { getCurrentUser } from '@/lib/auth'

function startOfDate(v:string){const d=new Date(`${v}T00:00:00.000Z`);return Number.isNaN(d.getTime())?null:d}
function endOfDate(v:string){const d=new Date(`${v}T23:59:59.999Z`);return Number.isNaN(d.getTime())?null:d}
async function rawBalance(accountId:string,to:Date){
  const agg=await prisma.journalLine.aggregate({where:{accountId,journal:{transDate:{lte:to}}},_sum:{debit:true,credit:true}})
  return Number(agg._sum.debit||0)-Number(agg._sum.credit||0)
}

export async function POST(req:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.redirect(appUrl('/login',req),303)
  const f=await req.formData()
  const sourceAccountId=String(f.get('sourceAccountId')||'')
  const targetAccountId=String(f.get('targetAccountId')||'')
  const eliminationDateText=String(f.get('eliminationDate')||'')
  const eliminationDate=startOfDate(eliminationDateText)
  const balanceTo=endOfDate(eliminationDateText)
  const note=String(f.get('note')||'').trim()
  if(!sourceAccountId||!targetAccountId||sourceAccountId===targetAccountId||!eliminationDate||!balanceTo)return NextResponse.redirect(appUrl('/mappings?error=account',req),303)

  const [sa,ta]=await Promise.all([
    prisma.account.findFirst({where:{id:sourceAccountId,company:{userId:user.id,active:true}},select:{id:true,companyId:true}}),
    prisma.account.findFirst({where:{id:targetAccountId,company:{userId:user.id,active:true}},select:{id:true,companyId:true}})
  ])
  if(!sa||!ta)return NextResponse.redirect(appUrl('/mappings?error=account',req),303)
  if(sa.companyId===ta.companyId)return NextResponse.redirect(appUrl('/mappings?error=same-company',req),303)

  const [rawA,rawB]=await Promise.all([rawBalance(sa.id,balanceTo!),rawBalance(ta.id,balanceTo!)])
  const amount=Math.min(Math.abs(rawA),Math.abs(rawB))
  if(amount<=0)return NextResponse.redirect(appUrl('/mappings?error=no-balance',req),303)
  const sourceAdj=-Math.sign(rawA)*amount
  const targetAdj=-sourceAdj
  const sourceDebit=Math.max(sourceAdj,0),sourceCredit=Math.max(-sourceAdj,0)
  const targetDebit=Math.max(targetAdj,0),targetCredit=Math.max(-targetAdj,0)

  await prisma.eliminationMapping.upsert({
    where:{userId_sourceAccountId_targetAccountId:{userId:user.id,sourceAccountId,targetAccountId}},
    update:{sourceCompanyId:sa.companyId,targetCompanyId:ta.companyId,note:note||null,active:true,eliminationDate,amount,sourceDebit,sourceCredit,targetDebit,targetCredit},
    create:{userId:user.id,sourceCompanyId:sa.companyId,sourceAccountId,targetCompanyId:ta.companyId,targetAccountId,note:note||null,eliminationDate,amount,sourceDebit,sourceCredit,targetDebit,targetCredit}
  })
  return NextResponse.redirect(appUrl('/mappings?saved=1',req),303)
}
