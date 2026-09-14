import { prisma } from '@/lib/db'

const cashGroups = ['CASH','BANK','CASH_AND_BANK']
function inferGroup(accountNo: string, name: string) {
  const s = `${accountNo} ${name}`.toLowerCase()
  if (/revenue|sales|pendapatan|penjualan/.test(s)) return 'Revenue'
  if (/cogs|hpp|harga pokok/.test(s)) return 'Cost of Revenue'
  if (/expense|beban|biaya/.test(s)) return 'Operating Expenses'
  if (/cash|bank|kas/.test(s)) return 'Cash & Bank'
  if (/receivable|piutang/.test(s)) return 'Accounts Receivable'
  if (/inventory|persediaan/.test(s)) return 'Inventory'
  if (/payable|hutang|utang/.test(s)) return 'Accounts Payable'
  if (/equity|modal|retained|laba ditahan/.test(s)) return 'Equity'
  return 'Other'
}

export async function consolidatedReport(from: Date, to: Date) {
  const companies = await prisma.company.findMany({ where: { active: true }, orderBy: { name: 'asc' } })
  const mappings = await prisma.accountMapping.findMany({ where: { type: 'REPORTING' } })
  const map = new Map(mappings.map(m => [`${m.companyId}:${m.accountNo}`, m.consolidatedKey]))
  const lines = await prisma.journalLine.findMany({
    where: { journal: { transDate: { gte: from, lte: to }, company: { active: true } } },
    include: { journal: true, account: true }
  })
  const rows = new Map<string, Record<string, number>>()
  for (const l of lines) {
    const key = map.get(`${l.journal.companyId}:${l.accountNo}`) || l.account?.reportGroup || inferGroup(l.accountNo, l.account?.name || '')
    if (!rows.has(key)) rows.set(key, {})
    const r = rows.get(key)!
    const amount = Number(l.credit) - Number(l.debit)
    r[l.journal.companyId] = (r[l.journal.companyId] || 0) + amount
  }
  const result = [...rows.entries()].map(([key, values]) => ({ key, values, total: Object.values(values).reduce((a,b)=>a+b,0) }))
  return { companies, rows: result }
}
