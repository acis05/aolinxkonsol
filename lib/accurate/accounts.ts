import { accurateGet } from './client'
import type { AccountType } from '@prisma/client'

export function mapAccountType(v:any):AccountType{
  const s=String(v||'').toUpperCase()
  if(['CASH_BANK','ACCOUNT_RECEIVABLE','INVENTORY','FIXED_ASSET','ACCUMULATED_DEPRECIATION','OTHER_ASSET','OTHER_CURRENT_ASSET'].includes(s))return'ASSET'
  if(['ACCOUNT_PAYABLE','LONG_TERM_LIABILITY','OTHER_CURRENT_LIABILITY'].includes(s))return'LIABILITY'
  if(s==='EQUITY')return'EQUITY'
  if(['REVENUE','OTHER_INCOME'].includes(s))return'REVENUE'
  if(['EXPENSE','OTHER_EXPENSE','COGS'].includes(s))return'EXPENSE'
  return'OTHER'
}

export async function listGlAccounts(opts:{userId:string;host:string;sessionId:string;page?:number;pageSize?:number}){
  return accurateGet<any>(opts.userId,opts.host,'/accurate/api/glaccount/list.do',opts.sessionId,{
    fields:'id,no,name,accountType,parentNo',
    'sp.page':opts.page||1,
    'sp.pageSize':opts.pageSize||100,
    'sp.sort':'no|asc'
  })
}

export function unwrapAccounts(body:any):any[]{return Array.isArray(body?.d)?body.d:Array.isArray(body)?body:[]}

export async function listAllGlAccounts(opts:{userId:string;host:string;sessionId:string;pageSize?:number}){
  const rows:any[]=[]
  const pageSize=opts.pageSize||100
  let page=1
  let pageCount=1
  do{
    const body=await listGlAccounts({...opts,page,pageSize})
    rows.push(...unwrapAccounts(body))
    pageCount=Math.max(1,Number(body?.sp?.pageCount||1))
    page++
  }while(page<=pageCount && page<=500)
  return rows
}
