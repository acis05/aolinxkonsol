import { prisma } from '@/lib/db'

export type TxnMatchStatus='MATCHED'|'PARTIAL'|'UNMATCHED'
export type MatchConfidence='HIGH'|'MEDIUM'|'LOW'

type TxLine={
  lineId:string;journalId:string;companyId:string;accountId:string;accountNo:string
  journalNumber:string;journalDate:Date;description:string;memo:string;customerNo:string;vendorNo:string
  raw:number;amount:number;direction:'DEBIT'|'CREDIT';reference:string;tokens:string[]
}

const clean=(v:any)=>String(v||'').trim()
const normalize=(v:string)=>v.toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()
const tokens=(...parts:string[])=>[...new Set(normalize(parts.join(' ')).split(' ').filter(x=>x.length>=3))]
const refFrom=(...parts:string[])=>{
  const s=parts.join(' ')
  const candidates=s.match(/[A-Z0-9][A-Z0-9._\/-]{3,}/gi)||[]
  return candidates.map(x=>x.toLowerCase()).find(x=>/\d/.test(x))||''
}
const days=(a:Date,b:Date)=>Math.abs(a.getTime()-b.getTime())/86400000

async function loadLines(accountId:string,from:Date,to:Date):Promise<TxLine[]>{
  const rows=await prisma.journalLine.findMany({
    where:{accountId,journal:{transDate:{gte:from,lte:to}}},
    include:{journal:{select:{id:true,companyId:true,number:true,transDate:true,description:true}}},
    orderBy:[{journal:{transDate:'asc'}},{id:'asc'}]
  })
  return rows.map((r:any)=>{
    const debit=Number(r.debit||0),credit=Number(r.credit||0),raw=debit-credit
    const number=clean(r.journal.number),desc=clean(r.journal.description),memo=clean(r.memo),customer=clean(r.customerNo),vendor=clean(r.vendorNo)
    const direction: TxLine['direction'] = raw >= 0 ? 'DEBIT' : 'CREDIT'
    const line: TxLine = {
      lineId:r.id,journalId:r.journal.id,companyId:r.journal.companyId,accountId:String(r.accountId||''),accountNo:clean(r.accountNo),
      journalNumber:number,journalDate:r.journal.transDate,description:desc,memo,customerNo:customer,vendorNo:vendor,
      raw,amount:Math.abs(raw),direction,reference:refFrom(number,desc,memo),tokens:tokens(number,desc,memo,customer,vendor)
    }
    return line
  }).filter(x=>x.amount>0.000001)
}

function overlap(a:string[],b:string[]){
  if(!a.length||!b.length)return 0
  const bs=new Set(b);let n=0
  for(const t of a)if(bs.has(t))n++
  return n/Math.max(a.length,b.length)
}

function candidateScore(a:TxLine,b:TxLine,amountTolerance:number,dateToleranceDays:number){
  if(a.direction===b.direction)return null
  const amountDiff=Math.abs(a.amount-b.amount)
  const dateDiff=days(a.journalDate,b.journalDate)
  const sameRef=!!a.reference&&a.reference===b.reference
  const textOverlap=overlap(a.tokens,b.tokens)
  const exactAmount=amountDiff<=amountTolerance
  const dateOk=dateDiff<=dateToleranceDays
  // Guard against false positives: a candidate needs exact/near amount, or a shared explicit reference.
  if(!exactAmount&&!sameRef)return null
  if(!dateOk&&!sameRef)return null
  let score=0
  if(exactAmount)score+=60
  else score+=Math.max(0,35-Math.min(35,amountDiff/Math.max(1,a.amount)*100))
  if(sameRef)score+=30
  if(dateOk)score+=Math.max(0,15-(dateDiff/Math.max(1,dateToleranceDays))*10)
  score+=Math.min(10,textOverlap*20)
  return{score,amountDiff,dateDiff,sameRef,textOverlap,exactAmount}
}

function confidence(score:number):MatchConfidence{return score>=90?'HIGH':score>=70?'MEDIUM':'LOW'}

export type TransactionMatch={
  source:TxLine;target:TxLine|null;status:TxnMatchStatus;confidence:MatchConfidence|null
  matchedAmount:number;difference:number;dateDifferenceDays:number|null;score:number|null;reason:string
}

function matchPair(source:TxLine[],target:TxLine[],amountTolerance:number,dateToleranceDays:number){
  const unused=new Set(target.map((_,i)=>i));const matches:TransactionMatch[]=[]
  for(const a of source){
    let best:{i:number;meta:NonNullable<ReturnType<typeof candidateScore>>}|null=null
    for(const i of unused){
      const meta=candidateScore(a,target[i],amountTolerance,dateToleranceDays)
      if(!meta)continue
      if(!best||meta.score>best.meta.score||(meta.score===best.meta.score&&meta.dateDiff<best.meta.dateDiff))best={i,meta}
    }
    if(!best){matches.push({source:a,target:null,status:'UNMATCHED',confidence:null,matchedAmount:0,difference:a.amount,dateDifferenceDays:null,score:null,reason:'Tidak ditemukan transaksi lawan yang memenuhi nominal/reference dan toleransi tanggal.'});continue}
    unused.delete(best.i);const b=target[best.i],m=best.meta
    const matchedAmount=Math.min(a.amount,b.amount),difference=Math.abs(a.amount-b.amount)
    const status:TxnMatchStatus=difference<=amountTolerance?'MATCHED':'PARTIAL'
    const why=[m.sameRef?'reference sama':null,m.exactAmount?'nominal cocok':'nominal sebagian cocok',`selisih tanggal ${Math.round(m.dateDiff)} hari`,m.textOverlap>0.25?'memo/deskripsi mirip':null].filter(Boolean).join(' • ')
    matches.push({source:a,target:b,status,confidence:confidence(m.score),matchedAmount,difference,dateDifferenceDays:m.dateDiff,score:m.score,reason:why})
  }
  for(const i of unused){
    const b=target[i]
    // Represent target-only transactions by mirroring into source for UI consistency through targetOnly flag encoded in reason.
    matches.push({source:b,target:null,status:'UNMATCHED',confidence:null,matchedAmount:0,difference:b.amount,dateDifferenceDays:null,score:null,reason:'TARGET_ONLY: Belum ditemukan transaksi lawan pada sisi A.'})
  }
  return matches
}

export async function transactionReconciliationReport(userId:string,from:Date,to:Date,amountTolerance=1,dateToleranceDays=7){
  const mappings=await prisma.eliminationMapping.findMany({where:{userId,active:true},include:{sourceCompany:true,targetCompany:true,sourceAccount:true,targetAccount:true},orderBy:{createdAt:'asc'}})
  const rows=[] as any[]
  for(const m of mappings){
    const [a,b]=await Promise.all([loadLines(m.sourceAccountId,from,to),loadLines(m.targetAccountId,from,to)])
    const matches=matchPair(a,b,amountTolerance,dateToleranceDays)
    const matched=matches.filter(x=>x.status==='MATCHED').length,partial=matches.filter(x=>x.status==='PARTIAL').length,unmatched=matches.filter(x=>x.status==='UNMATCHED').length
    const matchedAmount=matches.filter(x=>x.status!=='UNMATCHED').reduce((s,x)=>s+x.matchedAmount,0)
    const high=matches.filter(x=>x.confidence==='HIGH').length
    rows.push({
      mappingId:m.id,sourceCompany:m.sourceCompany.name,targetCompany:m.targetCompany.name,
      sourceAccountNo:m.sourceAccount.accountNo,sourceAccountName:m.sourceAccount.name,targetAccountNo:m.targetAccount.accountNo,targetAccountName:m.targetAccount.name,
      matches,summary:{matched,partial,unmatched,total:matches.length,matchedAmount,highConfidence:high},
      currentJournalAmount:Number(m.amount||0),currentJournalDate:m.eliminationDate
    })
  }
  return{rows,summary:{pairs:rows.length,matched:rows.reduce((s,r)=>s+r.summary.matched,0),partial:rows.reduce((s,r)=>s+r.summary.partial,0),unmatched:rows.reduce((s,r)=>s+r.summary.unmatched,0),matchedAmount:rows.reduce((s,r)=>s+r.summary.matchedAmount,0)},from,to,amountTolerance,dateToleranceDays}
}

export async function transactionMatchedAmountForMapping(userId:string,mappingId:string,from:Date,to:Date,amountTolerance=1,dateToleranceDays=7){
  const m=await prisma.eliminationMapping.findFirst({where:{id:mappingId,userId,active:true},include:{sourceCompany:true,targetCompany:true,sourceAccount:true,targetAccount:true}})
  if(!m)return null
  const [a,b]=await Promise.all([loadLines(m.sourceAccountId,from,to),loadLines(m.targetAccountId,from,to)])
  const matches=matchPair(a,b,amountTolerance,dateToleranceDays)
  const usable=matches.filter(x=>x.status==='MATCHED'||x.status==='PARTIAL')
  return{mapping:m,matches,amount:usable.reduce((s,x)=>s+x.matchedAmount,0),matched:usable.length}
}
