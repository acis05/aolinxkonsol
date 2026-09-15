import { accurateGet } from './client'

export type JournalListOptions = {
  userId: string
  host: string
  sessionId?: string | null
  from?: string
  to?: string
  lastUpdateFrom?: string
  page?: number
  pageSize?: number
  includeLines?: boolean
}

export async function listJournalVouchers(opts: JournalListOptions) {
  const path = process.env.ACCURATE_JOURNAL_LIST_PATH || '/accurate/api/journal-voucher/list.do'
  const basicFields = 'id,number,transDate,description,lastUpdate'
  const params: Record<string,string|number|undefined> = {
    fields: opts.includeLines === false ? basicFields : `${basicFields},detailJournalVoucher`,
    'sp.page': opts.page || 1,
    'sp.pageSize': opts.pageSize || Number(process.env.ACCURATE_JOURNAL_PAGE_SIZE || 100),
    // lastUpdate membuat quick sync stabil: hanya delta yang berubah sejak watermark.
    // Sorting lastUpdate lalu id/number membantu pagination incremental tetap deterministik.
    'sp.sort': opts.lastUpdateFrom ? 'lastUpdate|asc;number|asc' : 'transDate|asc;number|asc'
  }

  if (opts.from && opts.to) {
    params['filter.transDate.op'] = 'BETWEEN'
    params['filter.transDate.val[0]'] = opts.from
    params['filter.transDate.val[1]'] = opts.to
  } else if (opts.from) {
    params['filter.transDate.op'] = 'GREATER_EQUAL_THAN'
    params['filter.transDate.val'] = opts.from
  } else if (opts.to) {
    params['filter.transDate.op'] = 'LESS_EQUAL_THAN'
    params['filter.transDate.val'] = opts.to
  }

  if (opts.lastUpdateFrom) {
    params['filter.lastUpdate.op'] = 'GREATER_THAN'
    params['filter.lastUpdate.val'] = opts.lastUpdateFrom
  }

  return accurateGet<any>(opts.userId, opts.host, path, opts.sessionId, params)
}

export async function detailJournalVoucher(opts: { userId: string; host: string; sessionId?: string | null; id: string }) {
  const path = process.env.ACCURATE_JOURNAL_DETAIL_PATH || '/accurate/api/journal-voucher/detail.do'
  return accurateGet<any>(opts.userId, opts.host, path, opts.sessionId, { id: opts.id })
}

export function unwrapList(body: any): any[] {
  if (Array.isArray(body)) return body
  if (Array.isArray(body?.d)) return body.d
  if (Array.isArray(body?.data)) return body.data
  if (Array.isArray(body?.result)) return body.result
  return []
}

export function unwrapDetail(body: any): any {
  if (body?.r && typeof body.r === 'object' && !Array.isArray(body.r)) return body.r
  if (body?.d && typeof body.d === 'object' && !Array.isArray(body.d)) return body.d
  if (body?.data && typeof body.data === 'object' && !Array.isArray(body.data)) return body.data
  if (body?.result && typeof body.result === 'object' && !Array.isArray(body.result)) return body.result
  return body
}

export function journalDetailLines(detail:any):any[] {
  if (!detail) return []
  const candidates = [detail?.detailJournalVoucher,detail?.detailJournalVouchers,detail?.detailJournalVoucherList,detail?.journalVoucherDetail,detail?.journalVoucherDetails,detail?.details,detail?.detail,detail?.lines]
  for (const value of candidates) if (Array.isArray(value)) return value
  for (const key of ['r','d','data','result']) {
    const nested=detail?.[key]
    if(nested && nested!==detail){const found=journalDetailLines(nested);if(found.length)return found}
  }
  return []
}

export function pageInfo(body:any){
  return {page:Math.max(1,Number(body?.sp?.page||1)),pageCount:Math.max(1,Number(body?.sp?.pageCount||1)),rowCount:Math.max(0,Number(body?.sp?.rowCount||0)),pageSize:Math.max(1,Number(body?.sp?.pageSize||20))}
}
