import { accurateGet } from './client'

export async function listJournalVouchers(opts: { host: string; sessionId?: string | null; from?: string; to?: string; page?: number; pageSize?: number }) {
  const path = process.env.ACCURATE_JOURNAL_LIST_PATH || '/accurate/api/journal-voucher/list.do'
  const params: Record<string,string|number|undefined> = {
    fields: 'id,number,transDate,description,lastUpdate',
    'sp.page': opts.page || 1,
    'sp.pageSize': opts.pageSize || 100,
    'sp.sort': 'transDate|asc'
  }
  if (opts.from && opts.to) {
    params['filter.transDate.op'] = 'BETWEEN'
    params['filter.transDate.val[0]'] = opts.from
    params['filter.transDate.val[1]'] = opts.to
  }
  return accurateGet<any>(opts.host, path, opts.sessionId, params)
}

export async function detailJournalVoucher(opts: { host: string; sessionId?: string | null; id: string }) {
  const path = process.env.ACCURATE_JOURNAL_DETAIL_PATH || '/accurate/api/journal-voucher/detail.do'
  return accurateGet<any>(opts.host, path, opts.sessionId, { id: opts.id })
}

export function unwrapList(body: any): any[] {
  if (Array.isArray(body)) return body
  if (Array.isArray(body?.d)) return body.d
  if (Array.isArray(body?.data)) return body.data
  if (Array.isArray(body?.result)) return body.result
  return []
}

export function unwrapDetail(body: any): any {
  return body?.d ?? body?.data ?? body?.result ?? body
}
