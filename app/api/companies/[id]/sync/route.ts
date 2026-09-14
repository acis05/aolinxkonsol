import { prisma } from '@/lib/db'
import { detailJournalVoucher, journalDetailLines, listJournalVouchers, pageInfo, unwrapDetail, unwrapList } from '@/lib/accurate/journals'
import { openDatabase } from '@/lib/accurate/oauth'
import { NextResponse } from 'next/server'
import { appUrl } from '@/lib/app-url'
import { getCurrentUser } from '@/lib/auth'
import { mapAccountType } from '@/lib/accurate/accounts'

function dateFromAccurate(v:any){
  if(!v)return new Date()
  if(/^\d{2}\/\d{2}\/\d{4}/.test(String(v))){
    const[d,m,y]=String(v).slice(0,10).split('/').map(Number)
    return new Date(y,m-1,d)
  }
  const d=new Date(v)
  return Number.isNaN(d.getTime())?new Date():d
}

function apiDate(v:string){
  if(!v)return ''
  if(/^\d{2}\/\d{2}\/\d{4}$/.test(v))return v
  if(/^\d{4}-\d{2}-\d{2}$/.test(v)){
    const[y,m,d]=v.split('-')
    return `${d}/${m}/${y}`
  }
  return v
}

function str(v:any){return v===undefined||v===null?null:String(v)}

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser()
  if(!user)return NextResponse.redirect(appUrl('/login',req),303)
  const{id}=await params
  const f=await req.formData()
  const syncAll=String(f.get('all')||'')==='1'
  const from=syncAll?'':apiDate(String(f.get('from')||''))
  const to=syncAll?'':apiDate(String(f.get('to')||''))
  let c=await prisma.company.findFirstOrThrow({where:{id,userId:user.id}})
  if(!c.accurateDbId)throw new Error('Database Accurate belum dipilih')

  try{
    const opened=await openDatabase(user.id,c.accurateDbId)
    c=await prisma.company.update({where:{id},data:{accurateHost:opened.host,sessionId:opened.sessionId}})

    let page=1
    let pageCount=1
    let total=0
    let lineTotal=0
    const failures:string[]=[]

    do{
      const body=await listJournalVouchers({
        userId:user.id,
        host:c.accurateHost!,
        sessionId:c.sessionId,
        from:from||undefined,
        to:to||undefined,
        page,
        pageSize:100
      })
      const rows=unwrapList(body)
      const pi=pageInfo(body)
      pageCount=pi.pageCount

      for(const item of rows){
        const rawId=item?.id ?? item?.number
        if(rawId===undefined||rawId===null){failures.push(`page ${page}: journal tanpa id`);continue}
        const aid=String(rawId)

        try{
          const detail=unwrapDetail(await detailJournalVoucher({
            userId:user.id,
            host:c.accurateHost!,
            sessionId:c.sessionId,
            id:aid
          }))
          const lines=journalDetailLines(detail)

          if(!lines.length){
            failures.push(`${item?.number||aid}: detail jurnal tidak memiliki baris debit/kredit`)
            continue
          }

          const j=await prisma.journal.upsert({
            where:{companyId_accurateId:{companyId:id,accurateId:aid}},
            update:{
              number:str(detail?.number??item?.number),
              transDate:dateFromAccurate(detail?.transDate??item?.transDate),
              description:str(detail?.description??item?.description),
              lastUpdate:detail?.lastUpdate||item?.lastUpdate?dateFromAccurate(detail?.lastUpdate??item?.lastUpdate):null,
              raw:detail
            },
            create:{
              companyId:id,
              accurateId:aid,
              number:str(detail?.number??item?.number),
              transDate:dateFromAccurate(detail?.transDate??item?.transDate),
              description:str(detail?.description??item?.description),
              lastUpdate:detail?.lastUpdate||item?.lastUpdate?dateFromAccurate(detail?.lastUpdate??item?.lastUpdate):null,
              raw:detail
            }
          })

          await prisma.journalLine.deleteMany({where:{journalId:j.id}})

          for(const l of lines){
            const accountNo=String(l?.accountNo ?? l?.account?.no ?? '').trim()
            if(!accountNo){failures.push(`${item?.number||aid}: baris jurnal tanpa accountNo`);continue}

            const existing=await prisma.account.findUnique({where:{companyId_accountNo:{companyId:id,accountNo}}})
            const name=String(l?.accountName ?? l?.account?.name ?? existing?.name ?? accountNo)
            const incomingType=l?.accountType ?? l?.account?.accountType
            const type=incomingType?mapAccountType(incomingType):(existing?.type||'OTHER')
            const a=await prisma.account.upsert({
              where:{companyId_accountNo:{companyId:id,accountNo}},
              update:{name,...(incomingType?{type}: {})},
              create:{companyId:id,accountNo,name,type}
            })

            const amount=Math.abs(Number(l?.amount||0))
            const t=String(l?.amountType||'').toUpperCase()
            const debit=t==='DEBIT'?amount:Math.abs(Number(l?.debit||0))
            const credit=t==='CREDIT'?amount:Math.abs(Number(l?.credit||0))

            await prisma.journalLine.create({data:{
              journalId:j.id,
              accountId:a.id,
              accountNo,
              memo:str(l?.memo),
              debit,
              credit,
              customerNo:str(l?.customerNo),
              vendorNo:str(l?.vendorNo),
              projectNo:str(l?.projectNo),
              department:str(l?.departmentName)
            }})
            lineTotal++
          }
          total++
        }catch(e:any){
          failures.push(`${item?.number||aid}: ${String(e?.message||e).slice(0,180)}`)
        }
      }
      page++
    }while(page<=pageCount && page<=1000)

    const qs=new URLSearchParams({synced:String(total),lines:String(lineTotal)})
    if(failures.length){
      qs.set('syncFailed',String(failures.length))
      qs.set('syncError',failures.slice(0,3).join(' | ').slice(0,700))
    }
    return NextResponse.redirect(appUrl(`/companies?${qs.toString()}`,req),303)
  }catch(e:any){
    return NextResponse.redirect(appUrl(`/companies?syncError=${encodeURIComponent(String(e?.message||e).slice(0,700))}`,req),303)
  }
}
