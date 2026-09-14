import { prisma } from '@/lib/db'
import { detailJournalVoucher, listJournalVouchers, unwrapDetail, unwrapList } from '@/lib/accurate/journals'
import { NextResponse } from 'next/server'

function dateFromAccurate(v:any){ if(!v) return new Date(); if(/^\d{2}\/\d{2}\/\d{4}/.test(v)){const [d,m,y]=v.slice(0,10).split('/').map(Number);return new Date(y,m-1,d)} return new Date(v) }
function detailLines(d:any){return d?.detailJournalVoucher || d?.detailJournalVouchers || d?.details || d?.detail || []}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  const {id}=await params;const f=await req.formData();const from=String(f.get('from')||'');const to=String(f.get('to')||'');
  const c=await prisma.company.findUniqueOrThrow({where:{id}});if(!c.accurateHost) throw new Error('Company host belum diisi')
  let page=1;let total=0
  while(page<=200){
    const body=await listJournalVouchers({host:c.accurateHost,sessionId:c.sessionId,from:from||undefined,to:to||undefined,page,pageSize:100});const rows=unwrapList(body);if(!rows.length) break
    for(const item of rows){
      const aid=String(item.id ?? item.number); let detail:any=item
      try{ detail=unwrapDetail(await detailJournalVoucher({host:c.accurateHost!,sessionId:c.sessionId,id:aid})) }catch{}
      const j=await prisma.journal.upsert({where:{companyId_accurateId:{companyId:id,accurateId:aid}},update:{number:item.number?String(item.number):null,transDate:dateFromAccurate(item.transDate||detail.transDate),description:item.description||detail.description||null,raw:detail},create:{companyId:id,accurateId:aid,number:item.number?String(item.number):null,transDate:dateFromAccurate(item.transDate||detail.transDate),description:item.description||detail.description||null,raw:detail}})
      await prisma.journalLine.deleteMany({where:{journalId:j.id}})
      for(const l of detailLines(detail)){
        const accountNo=String(l.accountNo||l.account?.no||'UNKNOWN'); const name=String(l.accountName||l.account?.name||accountNo)
        const a=await prisma.account.upsert({where:{companyId_accountNo:{companyId:id,accountNo}},update:{name},create:{companyId:id,accountNo,name}})
        const amount=Number(l.amount||0); const t=String(l.amountType||'').toUpperCase(); const debit=t==='DEBIT'?amount:Number(l.debit||0); const credit=t==='CREDIT'?amount:Number(l.credit||0)
        await prisma.journalLine.create({data:{journalId:j.id,accountId:a.id,accountNo,memo:l.memo||null,debit,credit,customerNo:l.customerNo||null,vendorNo:l.vendorNo||null,projectNo:l.projectNo||null,department:l.departmentName||null}})
      }
      total++
    }
    if(rows.length<100) break;page++
  }
  return NextResponse.redirect(new URL(`/companies?synced=${total}`,req.url),303)
}
