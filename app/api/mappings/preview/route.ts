import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

function endOfDate(v:string){
  const d=new Date(`${v}T23:59:59.999Z`)
  return Number.isNaN(d.getTime())?null:d
}
async function rawBalance(accountId:string,to:Date){
  const agg=await prisma.journalLine.aggregate({
    where:{accountId,journal:{transDate:{lte:to}}},
    _sum:{debit:true,credit:true}
  })
  return Number(agg._sum.debit||0)-Number(agg._sum.credit||0)
}
export async function POST(req:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const body=await req.json().catch(()=>({}))
  const sourceAccountId=String(body.sourceAccountId||''),targetAccountId=String(body.targetAccountId||'')
  const to=endOfDate(String(body.eliminationDate||''))
  if(!sourceAccountId||!targetAccountId||!to)return NextResponse.json({error:'Akun dan tanggal wajib diisi.'},{status:400})
  const [sa,ta]=await Promise.all([
    prisma.account.findFirst({where:{id:sourceAccountId,company:{userId:user.id,active:true}},include:{company:true}}),
    prisma.account.findFirst({where:{id:targetAccountId,company:{userId:user.id,active:true}},include:{company:true}})
  ])
  if(!sa||!ta||sa.companyId===ta.companyId)return NextResponse.json({error:'Pilih akun dari dua database yang berbeda.'},{status:400})
  const [rawA,rawB]=await Promise.all([rawBalance(sa.id,to),rawBalance(ta.id,to)])
  const amount=Math.min(Math.abs(rawA),Math.abs(rawB))
  let sourceDebit=0,sourceCredit=0,targetDebit=0,targetCredit=0
  if(amount>0){
    const sourceAdj=-Math.sign(rawA)*amount
    const targetAdj=-sourceAdj
    sourceDebit=Math.max(sourceAdj,0);sourceCredit=Math.max(-sourceAdj,0)
    targetDebit=Math.max(targetAdj,0);targetCredit=Math.max(-targetAdj,0)
  }
  const present=(a:any,raw:number)=>['ASSET','EXPENSE'].includes(a.type)?raw:-raw
  return NextResponse.json({
    status:amount>0?'BALANCED':'NO_BALANCE',amount,
    sourceBalance:present(sa,rawA),targetBalance:present(ta,rawB),
    sourceDebit,sourceCredit,targetDebit,targetCredit,
    sourceLabel:`${sa.company.name} — ${sa.accountNo} ${sa.name}`,
    targetLabel:`${ta.company.name} — ${ta.accountNo} ${ta.name}`
  })
}
