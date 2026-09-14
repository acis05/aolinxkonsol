import { accurateGet } from './client'
import type { AccountType } from '@prisma/client'
export function mapAccountType(v:any):AccountType{const s=String(v||'').toUpperCase();if(/ASSET|CASH|BANK|RECEIVABLE|INVENTORY|FIXED/.test(s))return'ASSET';if(/LIABILITY|PAYABLE|DEBT/.test(s))return'LIABILITY';if(/EQUITY|CAPITAL|RETAINED/.test(s))return'EQUITY';if(/REVENUE|INCOME|SALES/.test(s))return'REVENUE';if(/EXPENSE|COGS|COST/.test(s))return'EXPENSE';return'OTHER'}
export async function listGlAccounts(opts:{userId:string;host:string;sessionId:string;page?:number;pageSize?:number}){return accurateGet<any>(opts.userId,opts.host,'/accurate/api/glaccount/list.do',opts.sessionId,{fields:'id,no,name,accountType,type,parentNo,active','sp.page':opts.page||1,'sp.pageSize':opts.pageSize||100,'sp.sort':'no|asc'})}
export function unwrapAccounts(body:any):any[]{return Array.isArray(body?.d)?body.d:Array.isArray(body)?body:[]}
