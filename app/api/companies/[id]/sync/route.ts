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
    let skippedUnchanged=0

    // Cache COA sekali di awal. Ini menghindari query database per baris jurnal.
    const cachedAccounts=await prisma.account.findMany({where:{companyId:id}})
    const accountByNo=new Map(cachedAccounts.map(a=>[a.accountNo,a]))
    const accountByAccurateId=new Map(cachedAccounts.filter(a=>a.accurateId).map(a=>[String(a.accurateId),a]))
    const accountsByName=new Map<string,typeof cachedAccounts>()
    for(const a of cachedAccounts){const arr=accountsByName.get(a.name)||[];arr.push(a);accountsByName.set(a.name,arr)}

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
      // Preload jurnal yang sudah pernah sinkron. Jika lastUpdate sama dan lines sudah
      // tersedia, detail.do tidak perlu dipanggil lagi. Resync data besar jadi sangat cepat.
      const pageIds=rows.map((x:any)=>String(x?.id??x?.number??'')).filter(Boolean)
      const existingJournals=pageIds.length?await prisma.journal.findMany({
        where:{companyId:id,accurateId:{in:pageIds}},
        select:{accurateId:true,lastUpdate:true,_count:{select:{lines:true}}}
      }):[]
      const existingById=new Map(existingJournals.map(j=>[j.accurateId,j]))

      const resolved=await mapLimit(rows,6,async(item:any)=>{
        const rawId=item?.id ?? item?.number
        if(rawId===undefined||rawId===null)return {item,error:`page ${page}: journal tanpa id`}
        const aid=String(rawId)
        const existingJournal=existingById.get(aid)
        const itemLastUpdate=item?.lastUpdate?dateFromAccurate(item.lastUpdate):null
        if(existingJournal && existingJournal._count.lines>0 && itemLastUpdate && existingJournal.lastUpdate && Math.abs(itemLastUpdate.getTime()-existingJournal.lastUpdate.getTime())<1000){
          return {item,aid,skip:true,lineCount:existingJournal._count.lines}
        }
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
        if(r.skip){skippedUnchanged++;lineTotal+=Number(r.lineCount||0);total++;continue}
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
          // Response detail Accurate dapat mengirim referensi akun dalam beberapa bentuk:
          // accountNo langsung, object account/glAccount, atau hanya ID akun. Karena COA
          // sudah disinkronkan, ID Accurate bisa kita resolve kembali ke nomor akun.
          const accountObj=l?.account ?? l?.glAccount ?? l?.glaccount ?? l?.accountInfo ?? null
          const accountAccurateIdRaw=
            l?.accountId ?? l?.glAccountId ?? l?.glaccountId ??
            accountObj?.id ?? accountObj?.accountId ?? accountObj?.glAccountId
          const accountAccurateId=accountAccurateIdRaw===undefined||accountAccurateIdRaw===null?null:String(accountAccurateIdRaw)

          let accountNo=String(
            l?.accountNo ?? l?.glAccountNo ?? l?.accountCode ?? l?.no ??
            accountObj?.no ?? accountObj?.accountNo ?? accountObj?.code ?? accountObj?.accountCode ?? ''
          ).trim()

          let existing=accountNo ? accountByNo.get(accountNo) || null : null

          // Detail JV sering hanya membawa accountId/glAccountId. Resolve dari cache COA.
          if(!existing && accountAccurateId){
            existing=accountByAccurateId.get(accountAccurateId)||null
            if(existing && !accountNo)accountNo=existing.accountNo
          }

          // Fallback terakhir: resolve berdasarkan nama jika unik di company tersebut.
          const accountNameHint=String(
            l?.accountName ?? l?.glAccountName ?? accountObj?.name ?? ''
          ).trim()
          if(!existing && !accountNo && accountNameHint){
            const byName=accountsByName.get(accountNameHint)||[]
            if(byName.length===1){existing=byName[0];accountNo=byName[0].accountNo}
          }

          if(!accountNo){
            const keys=Object.keys(l||{}).slice(0,18).join(',')
            failures.push(`${item?.number||aid}: akun tidak ditemukan (keys: ${keys||'kosong'})`)
            continue
          }

          const name=String(accountNameHint || existing?.name || accountNo)
          const incomingType=l?.accountType ?? l?.glAccountType ?? accountObj?.accountType ?? accountObj?.type
          const type=incomingType?mapAccountType(incomingType):(existing?.type||'OTHER')
          const a=await prisma.account.upsert({
            where:{companyId_accountNo:{companyId:id,accountNo}},
            update:{name,...(incomingType?{type,reportGroup:String(incomingType).toUpperCase()}: {}),...(accountAccurateId?{accurateId:accountAccurateId}: {})},
            create:{companyId:id,accountNo,name,type,...(incomingType?{reportGroup:String(incomingType).toUpperCase()}: {}),...(accountAccurateId?{accurateId:accountAccurateId}: {})}
          })
          accountByNo.set(a.accountNo,a)
          if(a.accurateId)accountByAccurateId.set(String(a.accurateId),a)
          const amount=Math.abs(Number(l?.amount ?? l?.value ?? 0))
          const t=String(l?.amountType ?? l?.type ?? '').toUpperCase()
          const debit=t==='DEBIT'?amount:Math.abs(Number(l?.debit ?? l?.debitAmount ?? 0))
          const credit=t==='CREDIT'?amount:Math.abs(Number(l?.credit ?? l?.creditAmount ?? 0))
          createLines.push({journalId:j.id,accountId:a.id,accountNo,memo:str(l?.memo??l?.description),debit,credit,customerNo:str(l?.customerNo??l?.customer?.no),vendorNo:str(l?.vendorNo??l?.vendor?.no),projectNo:str(l?.projectNo??l?.project?.no),department:str(l?.departmentName??l?.department?.name)})
        }
        if(createLines.length){await prisma.journalLine.createMany({data:createLines});lineTotal+=createLines.length}
        total++
      }
      page++
    }while(page<=pageCount && page<=1000)

    const qs=new URLSearchParams({synced:String(total),lines:String(lineTotal),detailCalls:String(detailCalls),pages:String(pageCount),skipped:String(skippedUnchanged)})
    if(failures.length){qs.set('syncFailed',String(failures.length));qs.set('syncError',failures.slice(0,3).join(' | ').slice(0,900))}
    return NextResponse.redirect(appUrl(`/companies?${qs.toString()}`,req),303)
  }catch(e:any){
    return NextResponse.redirect(appUrl(`/companies?syncError=${encodeURIComponent(String(e?.message||e).slice(0,900))}`,req),303)
  }
}
