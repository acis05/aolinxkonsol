import { prisma } from '@/lib/db'

export type ReportValueMap = Record<string, number>
export type ReportRow = {
  id: string
  kind: 'section' | 'account' | 'subtotal' | 'total' | 'check'
  label: string
  accountNo?: string
  accountId?: string
  values: ReportValueMap
  elimination: number
  consolidated: number
  emphasize?: boolean
}

export type ConsolidatedReport = {
  companies: Array<{id:string;name:string}>
  from: Date
  to: Date
  pnl: ReportRow[]
  balanceSheet: ReportRow[]
  eliminationRows: Array<{id:string;label:string;source:number;target:number;amount:number}>
  pnlSummary: {revenue:number;grossProfit:number;operatingProfit:number;netProfit:number}
  balanceSummary: {assets:number;liabilities:number;equity:number;difference:number}
}

const ZERO: ReportValueMap = {}

function addValues(a:ReportValueMap,b:ReportValueMap,companyIds:string[]):ReportValueMap{
  const out:ReportValueMap={}
  for(const id of companyIds)out[id]=(a[id]||0)+(b[id]||0)
  return out
}
function subValues(a:ReportValueMap,b:ReportValueMap,companyIds:string[]):ReportValueMap{
  const out:ReportValueMap={}
  for(const id of companyIds)out[id]=(a[id]||0)-(b[id]||0)
  return out
}
function totalValues(v:ReportValueMap){return Object.values(v).reduce((a,b)=>a+b,0)}
function sumRows(rows:ReportRow[],companyIds:string[]){
  let values:ReportValueMap={};let elimination=0
  for(const r of rows){if(r.kind!=='account')continue;values=addValues(values,r.values,companyIds);elimination+=r.elimination}
  return {values,elimination,consolidated:totalValues(values)+elimination}
}
function totalRow(id:string,label:string,values:ReportValueMap,elimination:number,kind:'subtotal'|'total'|'check'='subtotal'):ReportRow{
  return{id,kind,label,values,elimination,consolidated:totalValues(values)+elimination,emphasize:kind==='total'||kind==='check'}
}
function section(id:string,label:string):ReportRow{return{id,kind:'section',label,values:{},elimination:0,consolidated:0}}

function accurateGroup(account:any){
  const g=String(account.reportGroup||'').toUpperCase()
  if(g)return g
  // Backward compatible untuk COA yang disinkron sebelum reportGroup disimpan.
  const name=String(account.name||'').toLowerCase()
  if(account.type==='REVENUE') return name.includes('lain')?'OTHER_INCOME':'REVENUE'
  if(account.type==='EXPENSE'){
    if(name.includes('harga pokok')||name.includes('hpp')||name.includes('cogs'))return 'COGS'
    if(name.includes('lain'))return 'OTHER_EXPENSE'
    return 'EXPENSE'
  }
  if(account.type==='ASSET'){
    if(name.includes('kas')||name.includes('bank'))return 'CASH_BANK'
    if(name.includes('piutang'))return 'ACCOUNT_RECEIVABLE'
    if(name.includes('persediaan')||name.includes('inventory'))return 'INVENTORY'
    if(name.includes('akumulasi penyusutan')||name.includes('akumulasi depresiasi'))return 'ACCUMULATED_DEPRECIATION'
    if(name.includes('aset tetap')||name.includes('aktiva tetap'))return 'FIXED_ASSET'
    return 'OTHER_ASSET'
  }
  if(account.type==='LIABILITY'){
    if(name.includes('hutang')||name.includes('utang'))return 'ACCOUNT_PAYABLE'
    return 'OTHER_CURRENT_LIABILITY'
  }
  if(account.type==='EQUITY')return 'EQUITY'
  return 'OTHER'
}

function normalSign(type:string,debit:number,credit:number){
  return ['ASSET','EXPENSE'].includes(type)?debit-credit:credit-debit
}

async function accountBalances(userId:string,from:Date|undefined,to:Date,companyIds:string[]){
  const lines=await prisma.journalLine.findMany({
    where:{journal:{companyId:{in:companyIds},transDate:{...(from?{gte:from}:{}),lte:to}}},
    include:{journal:true,account:true}
  })
  const byAccount=new Map<string,{account:any;values:ReportValueMap}>()
  for(const l of lines){
    if(!l.account)continue
    const key=l.account.id
    if(!byAccount.has(key))byAccount.set(key,{account:l.account,values:{}})
    const row=byAccount.get(key)!
    row.values[l.journal.companyId]=(row.values[l.journal.companyId]||0)+normalSign(l.account.type,Number(l.debit),Number(l.credit))
  }
  return {lines,byAccount}
}

function makeAccountRows(byAccount:Map<string,{account:any;values:ReportValueMap}>,companyIds:string[],elims:Map<string,number>,groups:string[]){
  return [...byAccount.values()]
    .filter(x=>groups.includes(accurateGroup(x.account)))
    .sort((a,b)=>String(a.account.accountNo).localeCompare(String(b.account.accountNo),'id',{numeric:true}))
    .map(x=>{
      const elimination=elims.get(x.account.id)||0
      return {
        id:`account:${x.account.id}`,
        kind:'account' as const,
        label:x.account.name,
        accountNo:x.account.accountNo,
        accountId:x.account.id,
        values:x.values,
        elimination,
        consolidated:totalValues(x.values)+elimination
      }
    })
}

function eliminationAdjustments(mappings:any[],byAccount:Map<string,{account:any;values:ReportValueMap}>){
  const map=new Map<string,number>()
  const rows:any[]=[]
  for(const m of mappings){
    const av=byAccount.get(m.sourceAccountId)?.values||{}
    const bv=byAccount.get(m.targetAccountId)?.values||{}
    const a=totalValues(av),b=totalValues(bv)
    const amount=Math.min(Math.abs(a),Math.abs(b))
    if(amount>0){
      const aAdj=-Math.sign(a||1)*amount
      const bAdj=-Math.sign(b||1)*amount
      map.set(m.sourceAccountId,(map.get(m.sourceAccountId)||0)+aAdj)
      map.set(m.targetAccountId,(map.get(m.targetAccountId)||0)+bAdj)
    }
    rows.push({id:m.id,label:`${m.sourceAccount.accountNo} ${m.sourceAccount.name} ↔ ${m.targetAccount.accountNo} ${m.targetAccount.name}`,source:a,target:b,amount})
  }
  return{map,rows}
}

export async function consolidatedReport(userId:string,from:Date,to:Date):Promise<ConsolidatedReport>{
  const companies:Array<{id:string;name:string}>=await prisma.company.findMany({where:{userId,active:true},orderBy:{name:'asc'},select:{id:true,name:true}})
  const companyIds=companies.map(c=>c.id)
  const mappings=await prisma.eliminationMapping.findMany({where:{userId,active:true},include:{sourceAccount:true,targetAccount:true}})

  const pnlData=await accountBalances(userId,from,to,companyIds)
  const bsData=await accountBalances(userId,undefined,to,companyIds)
  const pnlElim=eliminationAdjustments(mappings,pnlData.byAccount)
  const bsElim=eliminationAdjustments(mappings,bsData.byAccount)

  // LABA RUGI
  const revenue=makeAccountRows(pnlData.byAccount,companyIds,pnlElim.map,['REVENUE'])
  const cogs=makeAccountRows(pnlData.byAccount,companyIds,pnlElim.map,['COGS'])
  const operatingExp=makeAccountRows(pnlData.byAccount,companyIds,pnlElim.map,['EXPENSE'])
  const otherIncome=makeAccountRows(pnlData.byAccount,companyIds,pnlElim.map,['OTHER_INCOME'])
  const otherExp=makeAccountRows(pnlData.byAccount,companyIds,pnlElim.map,['OTHER_EXPENSE'])
  const rRev=sumRows(revenue,companyIds),rCogs=sumRows(cogs,companyIds),rOpExp=sumRows(operatingExp,companyIds),rOtherInc=sumRows(otherIncome,companyIds),rOtherExp=sumRows(otherExp,companyIds)
  const grossValues=subValues(rRev.values,rCogs.values,companyIds),grossElim=rRev.elimination-rCogs.elimination
  const operatingValues=subValues(grossValues,rOpExp.values,companyIds),operatingElim=grossElim-rOpExp.elimination
  const netValues=subValues(addValues(operatingValues,rOtherInc.values,companyIds),rOtherExp.values,companyIds)
  const netElim=operatingElim+rOtherInc.elimination-rOtherExp.elimination
  const pnl:ReportRow[]=[
    section('sec-revenue','PENDAPATAN USAHA'),...revenue,totalRow('tot-revenue','Total Pendapatan Usaha',rRev.values,rRev.elimination),
    section('sec-cogs','BEBAN POKOK PENDAPATAN'),...cogs,totalRow('tot-cogs','Total Beban Pokok Pendapatan',rCogs.values,rCogs.elimination),
    totalRow('gross-profit','LABA (RUGI) KOTOR',grossValues,grossElim,'total'),
    section('sec-opex','BEBAN USAHA'),...operatingExp,totalRow('tot-opex','Total Beban Usaha',rOpExp.values,rOpExp.elimination),
    totalRow('operating-profit','LABA (RUGI) USAHA',operatingValues,operatingElim,'total'),
    section('sec-other-income','PENDAPATAN LAIN-LAIN'),...otherIncome,totalRow('tot-other-income','Total Pendapatan Lain-lain',rOtherInc.values,rOtherInc.elimination),
    section('sec-other-exp','BEBAN LAIN-LAIN'),...otherExp,totalRow('tot-other-exp','Total Beban Lain-lain',rOtherExp.values,rOtherExp.elimination),
    totalRow('net-profit','LABA (RUGI) BERSIH',netValues,netElim,'total')
  ]

  // NERACA - saldo kumulatif s.d. tanggal laporan.
  const currentAssets=makeAccountRows(bsData.byAccount,companyIds,bsElim.map,['CASH_BANK','ACCOUNT_RECEIVABLE','INVENTORY','OTHER_CURRENT_ASSET'])
  const nonCurrentAssets=makeAccountRows(bsData.byAccount,companyIds,bsElim.map,['FIXED_ASSET','ACCUMULATED_DEPRECIATION','OTHER_ASSET'])
  // fallback aset lama yang belum memiliki reportGroup
  const fallbackAssets=makeAccountRows(bsData.byAccount,companyIds,bsElim.map,['OTHER']).filter(r=>bsData.byAccount.get(r.accountId!)?.account?.type==='ASSET')
  nonCurrentAssets.push(...fallbackAssets)
  const currentLiab=makeAccountRows(bsData.byAccount,companyIds,bsElim.map,['ACCOUNT_PAYABLE','OTHER_CURRENT_LIABILITY'])
  const longLiab=makeAccountRows(bsData.byAccount,companyIds,bsElim.map,['LONG_TERM_LIABILITY'])
  const equity=makeAccountRows(bsData.byAccount,companyIds,bsElim.map,['EQUITY'])
  const rCA=sumRows(currentAssets,companyIds),rNCA=sumRows(nonCurrentAssets,companyIds),rCL=sumRows(currentLiab,companyIds),rLL=sumRows(longLiab,companyIds),rEq=sumRows(equity,companyIds)
  const assetValues=addValues(rCA.values,rNCA.values,companyIds),assetElim=rCA.elimination+rNCA.elimination
  const liabValues=addValues(rCL.values,rLL.values,companyIds),liabElim=rCL.elimination+rLL.elimination

  // Laba/rugi tahun berjalan masuk ke ekuitas agar persamaan akuntansi tetap terbaca sebelum closing.
  const yearStart=new Date(to.getFullYear(),0,1)
  const ytdData=await accountBalances(userId,yearStart,to,companyIds)
  const ytdElim=eliminationAdjustments(mappings,ytdData.byAccount)
  const yRev=makeAccountRows(ytdData.byAccount,companyIds,ytdElim.map,['REVENUE'])
  const yCogs=makeAccountRows(ytdData.byAccount,companyIds,ytdElim.map,['COGS'])
  const yOp=makeAccountRows(ytdData.byAccount,companyIds,ytdElim.map,['EXPENSE'])
  const yOI=makeAccountRows(ytdData.byAccount,companyIds,ytdElim.map,['OTHER_INCOME'])
  const yOE=makeAccountRows(ytdData.byAccount,companyIds,ytdElim.map,['OTHER_EXPENSE'])
  const syRev=sumRows(yRev,companyIds),syCogs=sumRows(yCogs,companyIds),syOp=sumRows(yOp,companyIds),syOI=sumRows(yOI,companyIds),syOE=sumRows(yOE,companyIds)
  const ytdValues=subValues(addValues(subValues(subValues(syRev.values,syCogs.values,companyIds),syOp.values,companyIds),syOI.values,companyIds),syOE.values,companyIds)
  const ytdElimination=syRev.elimination-syCogs.elimination-syOp.elimination+syOI.elimination-syOE.elimination
  const ytdRow=totalRow('current-year-profit','Laba (Rugi) Tahun Berjalan',ytdValues,ytdElimination,'subtotal')
  const equityWithProfitValues=addValues(rEq.values,ytdValues,companyIds),equityWithProfitElim=rEq.elimination+ytdElimination
  const leValues=addValues(liabValues,equityWithProfitValues,companyIds),leElim=liabElim+equityWithProfitElim
  const differenceValues=subValues(assetValues,leValues,companyIds),differenceElim=assetElim-leElim

  const balanceSheet:ReportRow[]=[
    section('sec-current-assets','ASET LANCAR'),...currentAssets,totalRow('tot-current-assets','Total Aset Lancar',rCA.values,rCA.elimination),
    section('sec-noncurrent-assets','ASET TIDAK LANCAR'),...nonCurrentAssets,totalRow('tot-noncurrent-assets','Total Aset Tidak Lancar',rNCA.values,rNCA.elimination),
    totalRow('total-assets','TOTAL ASET',assetValues,assetElim,'total'),
    section('sec-current-liab','LIABILITAS JANGKA PENDEK'),...currentLiab,totalRow('tot-current-liab','Total Liabilitas Jangka Pendek',rCL.values,rCL.elimination),
    section('sec-long-liab','LIABILITAS JANGKA PANJANG'),...longLiab,totalRow('tot-long-liab','Total Liabilitas Jangka Panjang',rLL.values,rLL.elimination),
    totalRow('total-liabilities','TOTAL LIABILITAS',liabValues,liabElim,'total'),
    section('sec-equity','EKUITAS'),...equity,ytdRow,totalRow('total-equity','TOTAL EKUITAS',equityWithProfitValues,equityWithProfitElim,'total'),
    totalRow('total-liab-equity','TOTAL LIABILITAS DAN EKUITAS',leValues,leElim,'total'),
    totalRow('balance-check','SELISIH / BALANCE CHECK',differenceValues,differenceElim,'check')
  ]

  const pnlElimById=new Map(pnlElim.rows.map((x:any)=>[x.id,x]))
  const bsElimById=new Map(bsElim.rows.map((x:any)=>[x.id,x]))
  const eliminationRows=mappings.map((m:any)=>{
    const isPnl=['REVENUE','EXPENSE'].includes(m.sourceAccount.type)||['REVENUE','EXPENSE'].includes(m.targetAccount.type)
    return (isPnl?pnlElimById.get(m.id):bsElimById.get(m.id)) || pnlElimById.get(m.id) || bsElimById.get(m.id)
  }).filter(Boolean) as Array<{id:string;label:string;source:number;target:number;amount:number}>

  return{
    companies,from,to,pnl,balanceSheet,
    eliminationRows,
    pnlSummary:{revenue:rRev.consolidated,grossProfit:totalValues(grossValues)+grossElim,operatingProfit:totalValues(operatingValues)+operatingElim,netProfit:totalValues(netValues)+netElim},
    balanceSummary:{assets:totalValues(assetValues)+assetElim,liabilities:totalValues(liabValues)+liabElim,equity:totalValues(equityWithProfitValues)+equityWithProfitElim,difference:totalValues(differenceValues)+differenceElim}
  }
}
