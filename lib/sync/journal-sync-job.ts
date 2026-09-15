import { prisma } from '@/lib/db'
import { detailJournalVoucher, journalDetailLines, listJournalVouchers, pageInfo, unwrapDetail, unwrapList } from '@/lib/accurate/journals'
import { openDatabase } from '@/lib/accurate/oauth'
import { mapAccountType } from '@/lib/accurate/accounts'
import type { SyncJobMode } from '@prisma/client'

const activeJobs = new Set<string>()
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms))

function dateFromAccurate(v:any){
  if(!v)return new Date()
  const s=String(v)
  if(/^\d{2}\/\d{2}\/\d{4}/.test(s)){
    const [datePart,timePart='00:00:00']=s.split(' ')
    const[d,m,y]=datePart.split('/').map(Number)
    const[hh=0,mm=0,ss=0]=timePart.split(':').map(Number)
    return new Date(y,m-1,d,hh,mm,ss)
  }
  const d=new Date(v)
  return Number.isNaN(d.getTime())?new Date():d
}
function apiDate(v:Date){const d=String(v.getDate()).padStart(2,'0'),m=String(v.getMonth()+1).padStart(2,'0');return `${d}/${m}/${v.getFullYear()}`}
function apiTimestamp(v:Date){const d=String(v.getDate()).padStart(2,'0'),m=String(v.getMonth()+1).padStart(2,'0'),h=String(v.getHours()).padStart(2,'0'),mi=String(v.getMinutes()).padStart(2,'0'),s=String(v.getSeconds()).padStart(2,'0');return `${d}/${m}/${v.getFullYear()} ${h}:${mi}:${s}`}
function str(v:any){return v===undefined||v===null?null:String(v)}
async function mapLimit<T,R>(items:T[],limit:number,fn:(item:T,index:number)=>Promise<R>):Promise<R[]>{const out=new Array<R>(items.length);let cursor=0;async function worker(){while(true){const i=cursor++;if(i>=items.length)return;out[i]=await fn(items[i],i)}}await Promise.all(Array.from({length:Math.min(limit,items.length)},()=>worker()));return out}

export async function createJournalSyncJob(opts:{userId:string;companyId:string;mode:SyncJobMode;fromDate?:Date|null;toDate?:Date|null}){
  // Hindari dua sync bersamaan pada database yang sama.
  const existing=await prisma.syncJob.findFirst({where:{userId:opts.userId,companyId:opts.companyId,status:{in:['QUEUED','RUNNING']}},orderBy:{createdAt:'desc'}})
  if(existing)return existing
  return prisma.syncJob.create({data:{userId:opts.userId,companyId:opts.companyId,mode:opts.mode,fromDate:opts.fromDate||null,toDate:opts.toDate||null}})
}

export function launchJournalSyncJob(jobId:string){
  if(activeJobs.has(jobId))return
  activeJobs.add(jobId)
  void processJournalSyncJob(jobId).finally(()=>activeJobs.delete(jobId))
}

export async function ensureJournalSyncJob(jobId:string){
  const job=await prisma.syncJob.findUnique({where:{id:jobId}})
  if(!job||['COMPLETED','CANCELLED','FAILED'].includes(job.status))return job
  // Jika worker mati/restart, polling UI menyalakannya lagi. Lease 120 detik
  // cukup panjang untuk satu batch detail saat Accurate sedang melambat.
  const stale=!job.heartbeatAt || Date.now()-job.heartbeatAt.getTime()>120_000
  if(job.status==='QUEUED'||stale)launchJournalSyncJob(jobId)
  return job
}

export async function processJournalSyncJob(jobId:string){
  // Database lease membuat job aman walau route start dan polling status berjalan
  // di bundle/server instance berbeda. Hanya satu worker yang boleh mengklaim job.
  const staleBefore=new Date(Date.now()-120_000)
  const claimed=await prisma.syncJob.updateMany({
    where:{id:jobId,OR:[{status:{in:['QUEUED','FAILED']}},{status:'RUNNING',heartbeatAt:null},{status:'RUNNING',heartbeatAt:{lt:staleBefore}}]},
    data:{status:'RUNNING',heartbeatAt:new Date(),errorMessage:null}
  })
  if(!claimed.count)return
  let job=await prisma.syncJob.findUnique({where:{id:jobId},include:{company:true}})
  if(!job||job.status==='CANCELLED'||job.status==='COMPLETED')return
  const c0=job.company
  if(!c0.accurateDbId)throw new Error('Database Accurate belum dipilih')
  try{
    if(!job.startedAt)job=await prisma.syncJob.update({where:{id:jobId},data:{startedAt:new Date()},include:{company:true}})
    const opened=await openDatabase(job.userId,c0.accurateDbId)
    let company=await prisma.company.update({where:{id:c0.id},data:{accurateHost:opened.host,sessionId:opened.sessionId}})

    const mode=job.mode
    const from=mode==='PERIOD'&&job.fromDate?apiDate(job.fromDate):undefined
    const to=mode==='PERIOD'&&job.toDate?apiDate(job.toDate):undefined
    // Quick sync memakai watermark sumber Accurate, bukan waktu server. Mundurkan 2 detik
    // untuk menghindari record pada boundary; duplicate aman karena upsert + lastUpdate check.
    const watermark=mode==='QUICK'&&company.journalSyncWatermark?new Date(company.journalSyncWatermark.getTime()-2000):null
    const lastUpdateFrom=watermark?apiTimestamp(watermark):undefined

    const cachedAccounts=await prisma.account.findMany({where:{companyId:company.id}})
    const accountByNo=new Map(cachedAccounts.map(a=>[a.accountNo,a]))
    const accountByAccurateId=new Map(cachedAccounts.filter(a=>a.accurateId).map(a=>[String(a.accurateId),a]))
    const accountsByName=new Map<string,typeof cachedAccounts>()
    for(const a of cachedAccounts){const arr=accountsByName.get(a.name)||[];arr.push(a);accountsByName.set(a.name,arr)}

    let page=Math.max(1,job.currentPage||1),pageCount=Math.max(1,job.pageCount||1)
    let processed=job.processedJournals, lineTotal=job.processedLines, detailCalls=job.detailCalls, skipped=job.skippedUnchanged, failed=job.failedCount
    let maxSourceLastUpdate=job.maxSourceLastUpdate
    let listIncludesLines=true
    const recentErrors:string[]=[]

    do{
      const fresh=await prisma.syncJob.findUnique({where:{id:jobId},select:{status:true}})
      if(!fresh||fresh.status==='CANCELLED')return
      let body:any
      try{
        body=await listJournalVouchers({userId:job.userId,host:company.accurateHost!,sessionId:company.sessionId,from,to,lastUpdateFrom,page,pageSize:Number(process.env.ACCURATE_JOURNAL_PAGE_SIZE||100),includeLines:listIncludesLines})
      }catch(e){
        if(listIncludesLines){listIncludesLines=false;body=await listJournalVouchers({userId:job.userId,host:company.accurateHost!,sessionId:company.sessionId,from,to,lastUpdateFrom,page,pageSize:Number(process.env.ACCURATE_JOURNAL_PAGE_SIZE||100),includeLines:false})}else throw e
      }
      const rows=unwrapList(body), pi=pageInfo(body);pageCount=pi.pageCount
      const pageIds=rows.map((x:any)=>String(x?.id??x?.number??'')).filter(Boolean)
      const existingJournals=pageIds.length?await prisma.journal.findMany({where:{companyId:company.id,accurateId:{in:pageIds}},select:{accurateId:true,lastUpdate:true,_count:{select:{lines:true}}}}):[]
      const existingById=new Map(existingJournals.map(j=>[j.accurateId,j]))

      const resolved=await mapLimit(rows,4,async(item:any)=>{
        const rawId=item?.id??item?.number;if(rawId===undefined||rawId===null)return {item,error:`page ${page}: journal tanpa id`}
        const aid=String(rawId),existingJournal=existingById.get(aid),itemLastUpdate=item?.lastUpdate?dateFromAccurate(item.lastUpdate):null
        if(itemLastUpdate&&(!maxSourceLastUpdate||itemLastUpdate>maxSourceLastUpdate))maxSourceLastUpdate=itemLastUpdate
        if(existingJournal&&existingJournal._count.lines>0&&itemLastUpdate&&existingJournal.lastUpdate&&Math.abs(itemLastUpdate.getTime()-existingJournal.lastUpdate.getTime())<1000)return {item,aid,skip:true,lineCount:existingJournal._count.lines}
        const inlineLines=journalDetailLines(item);if(inlineLines.length)return {item,aid,detail:item,lines:inlineLines}
        try{detailCalls++;const raw=await detailJournalVoucher({userId:job.userId,host:company.accurateHost!,sessionId:company.sessionId,id:aid});const detail=unwrapDetail(raw);return {item,aid,detail,lines:journalDetailLines(detail)}}catch(e:any){return {item,aid,error:String(e?.message||e).slice(0,220)}}
      })

      for(const r of resolved as any[]){
        const item=r.item||{},aid=r.aid
        if(r.skip){skipped++;processed++;continue}
        if(r.error||!aid){failed++;recentErrors.push(`${item?.number||aid||'unknown'}: ${r.error||'id tidak valid'}`);continue}
        const detail=r.detail||item,lines=r.lines||[]
        if(!lines.length){failed++;recentErrors.push(`${item?.number||aid}: response detail tidak memiliki detailJournalVoucher`);continue}
        const j=await prisma.journal.upsert({where:{companyId_accurateId:{companyId:company.id,accurateId:aid}},update:{number:str(detail?.number??item?.number),transDate:dateFromAccurate(detail?.transDate??item?.transDate),description:str(detail?.description??item?.description),lastUpdate:detail?.lastUpdate||item?.lastUpdate?dateFromAccurate(detail?.lastUpdate??item?.lastUpdate):null,raw:detail},create:{companyId:company.id,accurateId:aid,number:str(detail?.number??item?.number),transDate:dateFromAccurate(detail?.transDate??item?.transDate),description:str(detail?.description??item?.description),lastUpdate:detail?.lastUpdate||item?.lastUpdate?dateFromAccurate(detail?.lastUpdate??item?.lastUpdate):null,raw:detail}})
        await prisma.journalLine.deleteMany({where:{journalId:j.id}})
        const createLines:any[]=[]
        for(const l of lines){
          const accountObj=l?.account??l?.glAccount??l?.glaccount??l?.accountInfo??null
          const idRaw=l?.accountId??l?.glAccountId??l?.glaccountId??accountObj?.id??accountObj?.accountId??accountObj?.glAccountId
          const accurateId=idRaw===undefined||idRaw===null?null:String(idRaw)
          let accountNo=String(l?.accountNo??l?.glAccountNo??l?.accountCode??l?.no??accountObj?.no??accountObj?.accountNo??accountObj?.code??accountObj?.accountCode??'').trim()
          let existing=accountNo?accountByNo.get(accountNo)||null:null
          if(!existing&&accurateId){existing=accountByAccurateId.get(accurateId)||null;if(existing&&!accountNo)accountNo=existing.accountNo}
          const nameHint=String(l?.accountName??l?.glAccountName??accountObj?.name??'').trim()
          if(!existing&&!accountNo&&nameHint){const byName=accountsByName.get(nameHint)||[];if(byName.length===1){existing=byName[0];accountNo=byName[0].accountNo}}
          if(!accountNo){failed++;recentErrors.push(`${item?.number||aid}: akun tidak ditemukan`);continue}
          const incomingType=l?.accountType??l?.glAccountType??accountObj?.accountType??accountObj?.type
          const a=await prisma.account.upsert({where:{companyId_accountNo:{companyId:company.id,accountNo}},update:{name:String(nameHint||existing?.name||accountNo),...(incomingType?{type:mapAccountType(incomingType),reportGroup:String(incomingType).toUpperCase()}:{}),...(accurateId?{accurateId}:{})},create:{companyId:company.id,accountNo,name:String(nameHint||existing?.name||accountNo),type:incomingType?mapAccountType(incomingType):(existing?.type||'OTHER'),...(incomingType?{reportGroup:String(incomingType).toUpperCase()}:{}),...(accurateId?{accurateId}:{})}})
          accountByNo.set(a.accountNo,a);if(a.accurateId)accountByAccurateId.set(String(a.accurateId),a)
          const amount=Math.abs(Number(l?.amount??l?.value??0)),t=String(l?.amountType??l?.type??'').toUpperCase(),debit=t==='DEBIT'?amount:Math.abs(Number(l?.debit??l?.debitAmount??0)),credit=t==='CREDIT'?amount:Math.abs(Number(l?.credit??l?.creditAmount??0))
          createLines.push({journalId:j.id,accountId:a.id,accountNo,memo:str(l?.memo??l?.description),debit,credit,customerNo:str(l?.customerNo??l?.customer?.no),vendorNo:str(l?.vendorNo??l?.vendor?.no),projectNo:str(l?.projectNo??l?.project?.no),department:str(l?.departmentName??l?.department?.name)})
        }
        if(createLines.length){await prisma.journalLine.createMany({data:createLines});lineTotal+=createLines.length}
        processed++
      }
      page++
      await prisma.syncJob.update({where:{id:jobId},data:{currentPage:page,pageCount,rowCount:pi.rowCount,processedJournals:processed,processedLines:lineTotal,detailCalls,skippedUnchanged:skipped,failedCount:failed,maxSourceLastUpdate,errorMessage:recentErrors.slice(-3).join(' | ').slice(0,900)||null,heartbeatAt:new Date()}})
      // Beri napas event loop / DB pool di job yang sangat besar.
      await sleep(15)
    }while(page<=pageCount&&page<=10000)

    const finished=new Date()
    const companyUpdate:any={}
    if((mode==='QUICK'||mode==='FULL')&&maxSourceLastUpdate)companyUpdate.journalSyncWatermark=maxSourceLastUpdate
    if(mode==='FULL')companyUpdate.journalFullSyncedAt=finished
    if(Object.keys(companyUpdate).length)await prisma.company.update({where:{id:company.id},data:companyUpdate})
    await prisma.syncJob.update({where:{id:jobId},data:{status:'COMPLETED',finishedAt:finished,heartbeatAt:finished,currentPage:pageCount,pageCount,errorMessage:recentErrors.slice(-3).join(' | ').slice(0,900)||null}})
  }catch(e:any){
    await prisma.syncJob.update({where:{id:jobId},data:{status:'FAILED',errorMessage:String(e?.message||e).slice(0,900),heartbeatAt:new Date()}}).catch(()=>{})
  }
}
