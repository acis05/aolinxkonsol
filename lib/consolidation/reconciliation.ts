import { prisma } from '@/lib/db'

type MappingWithRefs = Awaited<ReturnType<typeof getMappings>>[number]

async function getMappings(userId:string){
  return prisma.eliminationMapping.findMany({
    where:{userId,active:true},
    include:{sourceCompany:true,targetCompany:true,sourceAccount:true,targetAccount:true},
    orderBy:[{sourceCompany:{name:'asc'}},{targetCompany:{name:'asc'}},{createdAt:'asc'}]
  })
}

async function rawBalances(accountIds:string[],to:Date){
  if(!accountIds.length)return new Map<string,number>()
  const rows=await prisma.journalLine.groupBy({
    by:['accountId'],
    where:{accountId:{in:accountIds},journal:{transDate:{lte:to}}},
    _sum:{debit:true,credit:true}
  })
  const map=new Map<string,number>()
  for(const r of rows){
    if(!r.accountId)continue
    map.set(r.accountId,Number(r._sum.debit||0)-Number(r._sum.credit||0))
  }
  return map
}

function presentation(type:string,raw:number){
  return ['ASSET','EXPENSE'].includes(type)?raw:-raw
}

export type ReconciliationRow={
  mappingId:string
  sourceCompanyId:string;sourceCompany:string;sourceAccountId:string;sourceAccountNo:string;sourceAccountName:string
  targetCompanyId:string;targetCompany:string;targetAccountId:string;targetAccountNo:string;targetAccountName:string
  sourceRaw:number;targetRaw:number;sourceBalance:number;targetBalance:number
  amount:number;difference:number
  status:'MATCHED'|'DIFFERENCE'|'UNMATCHED'|'POSITION_CONFLICT'|'NO_BALANCE'
  sourceDebit:number;sourceCredit:number;targetDebit:number;targetCredit:number
  currentJournalDate:Date;currentJournalAmount:number
}

function reconcilePair(m:MappingWithRefs,balances:Map<string,number>,tolerance:number):ReconciliationRow{
  const rawA=balances.get(m.sourceAccountId)||0
  const rawB=balances.get(m.targetAccountId)||0
  const absA=Math.abs(rawA),absB=Math.abs(rawB)
  const amount=Math.min(absA,absB)
  const difference=Math.abs(absA-absB)
  const epsilon=Math.max(0,Number(tolerance)||0)
  let status:ReconciliationRow['status']='NO_BALANCE'
  if(absA<=epsilon&&absB<=epsilon)status='NO_BALANCE'
  else if(absA<=epsilon||absB<=epsilon)status='UNMATCHED'
  else if(Math.sign(rawA)===Math.sign(rawB))status='POSITION_CONFLICT'
  else if(difference<=epsilon)status='MATCHED'
  else status='DIFFERENCE'

  let sourceDebit=0,sourceCredit=0,targetDebit=0,targetCredit=0
  if(amount>0&&Math.sign(rawA)!==Math.sign(rawB)){
    const sourceAdj=-Math.sign(rawA)*amount
    const targetAdj=-sourceAdj
    sourceDebit=Math.max(sourceAdj,0);sourceCredit=Math.max(-sourceAdj,0)
    targetDebit=Math.max(targetAdj,0);targetCredit=Math.max(-targetAdj,0)
  }
  return{
    mappingId:m.id,
    sourceCompanyId:m.sourceCompanyId,sourceCompany:m.sourceCompany.name,sourceAccountId:m.sourceAccountId,sourceAccountNo:m.sourceAccount.accountNo,sourceAccountName:m.sourceAccount.name,
    targetCompanyId:m.targetCompanyId,targetCompany:m.targetCompany.name,targetAccountId:m.targetAccountId,targetAccountNo:m.targetAccount.accountNo,targetAccountName:m.targetAccount.name,
    sourceRaw:rawA,targetRaw:rawB,
    sourceBalance:presentation(m.sourceAccount.type,rawA),targetBalance:presentation(m.targetAccount.type,rawB),
    amount,difference,status,sourceDebit,sourceCredit,targetDebit,targetCredit,
    currentJournalDate:m.eliminationDate,currentJournalAmount:Number(m.amount||0)
  }
}

export async function reconciliationReport(userId:string,to:Date,tolerance=1){
  const mappings=await getMappings(userId)
  const accountIds=[...new Set(mappings.flatMap(m=>[m.sourceAccountId,m.targetAccountId]))]
  const balances=await rawBalances(accountIds,to)
  const rows=mappings.map(m=>reconcilePair(m,balances,tolerance))
  const summary={
    total:rows.length,
    matched:rows.filter(r=>r.status==='MATCHED').length,
    difference:rows.filter(r=>r.status==='DIFFERENCE').length,
    unmatched:rows.filter(r=>r.status==='UNMATCHED').length,
    conflict:rows.filter(r=>r.status==='POSITION_CONFLICT').length,
    matchedAmount:rows.filter(r=>r.status==='MATCHED').reduce((s,r)=>s+r.amount,0),
    differenceAmount:rows.filter(r=>r.status==='DIFFERENCE').reduce((s,r)=>s+r.difference,0)
  }
  return{rows,summary,to,tolerance}
}

export async function reconciliationForMapping(userId:string,mappingId:string,to:Date,tolerance=1){
  const m=await prisma.eliminationMapping.findFirst({
    where:{id:mappingId,userId,active:true},
    include:{sourceCompany:true,targetCompany:true,sourceAccount:true,targetAccount:true}
  })
  if(!m)return null
  const balances=await rawBalances([m.sourceAccountId,m.targetAccountId],to)
  return reconcilePair(m as MappingWithRefs,balances,tolerance)
}
