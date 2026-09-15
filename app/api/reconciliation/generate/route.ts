import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { appUrl } from '@/lib/app-url'
import { reconciliationForMapping, reconciliationReport } from '@/lib/consolidation/reconciliation'

function startDate(v:string){const d=new Date(`${v}T00:00:00.000Z`);return Number.isNaN(d.getTime())?null:d}
async function save(mappingId:string,userId:string,date:Date,row:any){
  if(!row||row.amount<=0||row.status==='POSITION_CONFLICT'||row.status==='UNMATCHED'||row.status==='NO_BALANCE')return false
  await prisma.eliminationMapping.updateMany({where:{id:mappingId,userId},data:{
    eliminationDate:date,amount:row.amount,
    sourceDebit:row.sourceDebit,sourceCredit:row.sourceCredit,targetDebit:row.targetDebit,targetCredit:row.targetCredit,
    active:true
  }})
  return true
}
export async function POST(req:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.redirect(appUrl('/login',req),303)
  const f=await req.formData();const dateText=String(f.get('date')||'');const date=startDate(dateText);const tolerance=Math.max(0,Number(f.get('tolerance')||1)||0)
  if(!date)return NextResponse.redirect(appUrl('/reconciliation?error=date',req),303)
  const mode=String(f.get('mode')||'single')
  if(mode==='all'){
    const report=await reconciliationReport(user.id,new Date(`${dateText}T23:59:59.999Z`),tolerance)
    let count=0
    for(const row of report.rows.filter(r=>r.status==='MATCHED'))if(await save(row.mappingId,user.id,date,row))count++
    return NextResponse.redirect(appUrl(`/reconciliation?to=${dateText}&tolerance=${tolerance}&generatedAll=${count}`,req),303)
  }
  const mappingId=String(f.get('mappingId')||'')
  const row=await reconciliationForMapping(user.id,mappingId,new Date(`${dateText}T23:59:59.999Z`),tolerance)
  if(!row||!(await save(mappingId,user.id,date,row)))return NextResponse.redirect(appUrl(`/reconciliation?to=${dateText}&tolerance=${tolerance}&error=pair`,req),303)
  return NextResponse.redirect(appUrl(`/reconciliation?to=${dateText}&tolerance=${tolerance}&generated=1`,req),303)
}
