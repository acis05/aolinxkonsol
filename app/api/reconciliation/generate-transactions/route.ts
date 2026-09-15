import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { appUrl } from '@/lib/app-url'
import { transactionMatchedAmountForMapping, transactionReconciliationReport } from '@/lib/consolidation/transaction-reconciliation'

const date=(v:string,end=false)=>{const d=new Date(`${v}T${end?'23:59:59.999':'00:00:00.000'}Z`);return Number.isNaN(d.getTime())?null:d}
async function saveAmount(userId:string,mappingId:string,eliminationDate:Date,asOf:Date,amount:number){
  const m=await prisma.eliminationMapping.findFirst({where:{id:mappingId,userId,active:true},include:{sourceAccount:true,targetAccount:true}})
  if(!m||amount<=0)return false
  // Determine entry direction from balances through the selected period. Source is reduced; target receives the opposite side.
  const sourceRaw=await prisma.journalLine.aggregate({where:{accountId:m.sourceAccountId,journal:{transDate:{lte:asOf}}},_sum:{debit:true,credit:true}})
  const targetRaw=await prisma.journalLine.aggregate({where:{accountId:m.targetAccountId,journal:{transDate:{lte:asOf}}},_sum:{debit:true,credit:true}})
  const a=Number(sourceRaw._sum.debit||0)-Number(sourceRaw._sum.credit||0),b=Number(targetRaw._sum.debit||0)-Number(targetRaw._sum.credit||0)
  if(!a||!b||Math.sign(a)===Math.sign(b))return false
  const sourceAdj=-Math.sign(a)*amount,targetAdj=-sourceAdj
  await prisma.eliminationMapping.update({where:{id:m.id},data:{eliminationDate,amount,sourceDebit:Math.max(sourceAdj,0),sourceCredit:Math.max(-sourceAdj,0),targetDebit:Math.max(targetAdj,0),targetCredit:Math.max(-targetAdj,0)}})
  return true
}

export async function POST(req:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.redirect(appUrl('/login',req),303)
  const f=await req.formData();const fromText=String(f.get('from')||''),toText=String(f.get('to')||''),from=date(fromText),to=date(toText,true),journalDate=date(toText)
  const amountTolerance=Math.max(0,Number(f.get('amountTolerance')||1)||0),dateTolerance=Math.max(0,Number(f.get('dateTolerance')||7)||0)
  if(!from||!to||!journalDate)return NextResponse.redirect(appUrl('/reconciliation?mode=transactions&error=date',req),303)
  const mode=String(f.get('mode')||'single')
  if(mode==='all'){
    const report=await transactionReconciliationReport(user.id,from,to,amountTolerance,dateTolerance);let count=0
    for(const row of report.rows){if(row.summary.matchedAmount>0&&await saveAmount(user.id,row.mappingId,journalDate,to,row.summary.matchedAmount))count++}
    return NextResponse.redirect(appUrl(`/reconciliation?mode=transactions&from=${fromText}&to=${toText}&amountTolerance=${amountTolerance}&dateTolerance=${dateTolerance}&generatedTxAll=${count}`,req),303)
  }
  const mappingId=String(f.get('mappingId')||'');const r=await transactionMatchedAmountForMapping(user.id,mappingId,from,to,amountTolerance,dateTolerance)
  if(!r||r.amount<=0||!(await saveAmount(user.id,mappingId,journalDate,to,r.amount)))return NextResponse.redirect(appUrl(`/reconciliation?mode=transactions&from=${fromText}&to=${toText}&error=pair`,req),303)
  return NextResponse.redirect(appUrl(`/reconciliation?mode=transactions&from=${fromText}&to=${toText}&generatedTx=1`,req),303)
}
