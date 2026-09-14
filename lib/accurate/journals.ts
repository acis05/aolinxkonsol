import { accurateGet } from './client'

export type JournalListOptions = {
  userId: string
  host: string
  sessionId?: string | null
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export async function listJournalVouchers(opts: JournalListOptions) {
  const path = process.env.ACCURATE_JOURNAL_LIST_PATH || '/accurate/api/journal-voucher/list.do'
  const params: Record<string,string|number|undefined> = {
    fields: 'id,number,transDate,description,lastUpdate',
    'sp.page': opts.page || 1,
    'sp.pageSize': opts.pageSize || 100,
    'sp.sort': 'transDate|asc;number|asc'
  }

  // Accurate menggunakan format tanggal dd/MM/yyyy untuk filter API.
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
  return body?.d ?? body?.r ?? body?.data ?? body?.result ?? body
}

export function journalDetailLines(detail:any):any[] {
  const candidates = [
    detail?.detailJournalVoucher,
    detail?.detailJournalVouchers,
    detail?.detailJournalVoucherList,
    detail?.details,
    detail?.detail,
    detail?.journalVoucherDetail,
    detail?.journalVoucherDetails,
    detail?.lines
  ]
  for (const value of candidates) if (Array.isArray(value)) return value
  return []
}

export function pageInfo(body:any){
  return {
    page: Math.max(1, Number(body?.sp?.page || 1)),
    pageCount: Math.max(1, Number(body?.sp?.pageCount || 1)),
    rowCount: Math.max(0, Number(body?.sp?.rowCount || 0)),
    pageSize: Math.max(1, Number(body?.sp?.pageSize || 20))
  }
}
