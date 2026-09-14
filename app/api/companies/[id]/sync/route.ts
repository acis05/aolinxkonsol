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

async function mapLimit<T,R>(items:T[],limit:number,fn:(item:T,index:number)=>Promise<R>):Promise<R[]>{
  const out=new Array<R>(items.length)
  let cursor=0
  async function worker(){
    while(true){
      const i=cursor++
      if(i>=items.length)return
      out[i]=await fn(items[i],i)
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,items.length)},()=>worker()))
  return out
}

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
    let detailCalls=0
    let listIncludesLines=true
    const failures:string[]=[]

    do{
      let body:any
      try{
        body=await listJournalVouchers({userId:user.id,host:c.accurateHost!,sessionId:c.sessionId,from:from||undefined,to:to||undefined,page,pageSize:100,includeLines:listIncludesLines})
      }catch(e){
        // Beberapa versi Accurate mungkin menolak field nested di list. Fallback aman.
        if(listIncludesLines){
          listIncludesLines=false
          body=await listJournalVouchers({userId:user.id,host:c.accurateHost!,sessionId:c.sessionId,from:from||undefined,to:to||undefined,page,pageSize:100,includeLines:false})
        }else throw e
      }
      const rows=unwrapList(body)
      const pi=pageInfo(body)
      pageCount=pi.pageCount

      // Utamakan detailJournalVoucher yang sudah ikut dalam list. Hanya jurnal yang
      // tidak membawa lines yang membutuhkan detail.do. Fetch fallback dilakukan
      // parallel terbatas supaya ratusan jurnal tidak menunggu satu per satu.
      const resolved=await mapLimit(rows,8,async(item:any)=>{
        const rawId=item?.id ?? item?.number
        if(rawId===undefined||rawId===null)return {item,error:`page ${page}: journal tanpa id`}
        const aid=String(rawId)
        const inlineLines=journalDetailLines(item)
        if(inlineLines.length)return {item,aid,detail:item,lines:inlineLines}
        try{
          detailCalls++
          const raw=await detailJournalVoucher({userId:user.id,host:c.accurateHost!,sessionId:c.sessionId,id:aid})
          const detail=unwrapDetail(raw)
          const lines=journalDetailLines(detail)
          return {item,aid,detail,lines,raw}
        }catch(e:any){
          return {item,aid,error:String(e?.message||e).slice(0,220)}
        }
      })

      // DB write tetap sekuensial agar upsert akun yang sama tidak race.
      for(const r of resolved as any[]){
        const item=r.item||{}
        const aid=r.aid
        if(r.error||!aid){failures.push(`${item?.number||aid||'unknown'}: ${r.error||'id tidak valid'}`);continue}
        const detail=r.detail||item
        const lines=r.lines||[]
        if(!lines.length){failures.push(`${item?.number||aid}: response detail tidak memiliki detailJournalVoucher`);continue}

        const j=await prisma.journal.upsert({
          where:{companyId_accurateId:{companyId:id,accurateId:aid}},
          update:{number:str(detail?.number??item?.number),transDate:dateFromAccurate(detail?.transDate??item?.transDate),description:str(detail?.description??item?.description),lastUpdate:detail?.lastUpdate||item?.lastUpdate?dateFromAccurate(detail?.lastUpdate??item?.lastUpdate):null,raw:detail},
          create:{companyId:id,accurateId:aid,number:str(detail?.number??item?.number),transDate:dateFromAccurate(detail?.transDate??item?.transDate),description:str(detail?.description??item?.description),lastUpdate:detail?.lastUpdate||item?.lastUpdate?dateFromAccurate(detail?.lastUpdate??item?.lastUpdate):null,raw:detail}
        })
        await prisma.journalLine.deleteMany({where:{journalId:j.id}})

        const createLines:any[]=[]
        for(const l of lines){
          const accountNo=String(l?.accountNo ?? l?.account?.no ?? '').trim()
          if(!accountNo){failures.push(`${item?.number||aid}: baris jurnal tanpa accountNo`);continue}
          const existing=await prisma.account.findUnique({where:{companyId_accountNo:{companyId:id,accountNo}}})
          const name=String(l?.accountName ?? l?.account?.name ?? existing?.name ?? accountNo)
          const incomingType=l?.accountType ?? l?.account?.accountType
          const type=incomingType?mapAccountType(incomingType):(existing?.type||'OTHER')
          const a=await prisma.account.upsert({where:{companyId_accountNo:{companyId:id,accountNo}},update:{name,...(incomingType?{type}: {})},create:{companyId:id,accountNo,name,type}})
          const amount=Math.abs(Number(l?.amount||0))
          const t=String(l?.amountType||'').toUpperCase()
          const debit=t==='DEBIT'?amount:Math.abs(Number(l?.debit||0))
          const credit=t==='CREDIT'?amount:Math.abs(Number(l?.credit||0))
          createLines.push({journalId:j.id,accountId:a.id,accountNo,memo:str(l?.memo),debit,credit,customerNo:str(l?.customerNo),vendorNo:str(l?.vendorNo),projectNo:str(l?.projectNo),department:str(l?.departmentName)})
        }
        if(createLines.length){await prisma.journalLine.createMany({data:createLines});lineTotal+=createLines.length}
        total++
      }
      page++
    }while(page<=pageCount && page<=1000)

    const qs=new URLSearchParams({synced:String(total),lines:String(lineTotal),detailCalls:String(detailCalls),pages:String(pageCount)})
    if(failures.length){qs.set('syncFailed',String(failures.length));qs.set('syncError',failures.slice(0,3).join(' | ').slice(0,900))}
    return NextResponse.redirect(appUrl(`/companies?${qs.toString()}`,req),303)
  }catch(e:any){
    return NextResponse.redirect(appUrl(`/companies?syncError=${encodeURIComponent(String(e?.message||e).slice(0,900))}`,req),303)
  }
}
