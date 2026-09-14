import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { BookOpenText, Search } from 'lucide-react'
export const dynamic='force-dynamic'

const money=(n:any)=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:2}).format(Number(n||0))

export default async function Journals({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const user=await requireUser()
  const q=await searchParams
  const companies=await prisma.company.findMany({where:{userId:user.id,active:true},orderBy:{name:'asc'}})
  const companyId=q.company||''
  const keyword=(q.q||'').trim()
  const from=q.from?new Date(`${q.from}T00:00:00`):undefined
  const to=q.to?new Date(`${q.to}T23:59:59.999`):undefined

  const journals=await prisma.journal.findMany({
    where:{
      company:{userId:user.id},
      ...(companyId?{companyId}:{}),
      ...(from||to?{transDate:{...(from?{gte:from}:{}),...(to?{lte:to}:{})}}:{}),
      ...(keyword?{OR:[{number:{contains:keyword,mode:'insensitive'}},{description:{contains:keyword,mode:'insensitive'}}]}:{})
    },
    include:{company:true,lines:{include:{account:true},orderBy:{id:'asc'}}},
    orderBy:[{transDate:'desc'},{number:'desc'}],
    take:500
  })

  const totalLines=journals.reduce((n,j)=>n+j.lines.length,0)
  return <>
    <div className="top"><div><div className="eyebrow">General Ledger Source</div><h1>Jurnal Umum Accurate</h1><div className="muted">Seluruh Journal Voucher yang sudah disinkronkan. Baris debit/kredit inilah sumber laporan konsolidasi KONSAOL.</div></div></div>
    <form className="card form">
      <label className="fieldLabel">Database / Company<select className="input" name="company" defaultValue={companyId}><option value="">Semua database</option>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="fieldLabel">Dari tanggal<input className="input" type="date" name="from" defaultValue={q.from}/></label>
      <label className="fieldLabel">Sampai tanggal<input className="input" type="date" name="to" defaultValue={q.to}/></label>
      <label className="fieldLabel">Cari nomor / deskripsi<input className="input" name="q" defaultValue={keyword} placeholder="JV-001 / adjustment..."/></label>
      <button className="btn" style={{alignSelf:'end'}}><Search size={14}/> Tampilkan</button>
    </form>
    <div className="grid grid4" style={{marginTop:16}}>
      <div className="card metricCard"><div className="metricLabel">Jurnal tampil</div><div className="metric">{journals.length.toLocaleString('id-ID')}</div></div>
      <div className="card metricCard"><div className="metricLabel">Baris debit/kredit</div><div className="metric">{totalLines.toLocaleString('id-ID')}</div></div>
      <div className="card metricCard"><div className="metricLabel">Database aktif</div><div className="metric">{companies.length.toLocaleString('id-ID')}</div></div>
      <div className="card metricCard"><div className="metricLabel">Batas tampilan</div><div className="metric">500</div></div>
    </div>
    <div className="card" style={{marginTop:16}}>
      <div className="sectionHeader"><div><h2><BookOpenText size={17} style={{verticalAlign:'-3px',marginRight:7}}/>Transaksi Journal Voucher</h2><div className="muted">Buka detail setiap jurnal untuk melihat akun, memo, debit dan kredit.</div></div></div>
      <div className="journalList">
        {journals.map(j=>{
          const debit=j.lines.reduce((n,l)=>n+Number(l.debit),0)
          const credit=j.lines.reduce((n,l)=>n+Number(l.credit),0)
          return <details className="journalCard" key={j.id}>
            <summary>
              <div><b>{j.number||`JV #${j.accurateId}`}</b><span>{j.company.name}</span></div>
              <div className="journalDesc">{j.description||'-'}</div>
              <div>{j.transDate.toLocaleDateString('id-ID')}<span>{j.lines.length} baris</span></div>
              <div className="journalAmount"><b>{money(debit)}</b><span>Debit</span></div>
              <div className="journalAmount"><b>{money(credit)}</b><span>Kredit</span></div>
            </summary>
            <div className="tableWrap"><table className="table"><thead><tr><th>Akun</th><th>Nama Akun</th><th>Memo</th><th>Debit</th><th>Kredit</th><th>Customer/Vendor</th></tr></thead><tbody>{j.lines.map(l=><tr key={l.id}><td><b>{l.accountNo}</b></td><td>{l.account?.name||'-'}</td><td>{l.memo||'-'}</td><td style={{textAlign:'right'}}>{money(l.debit)}</td><td style={{textAlign:'right'}}>{money(l.credit)}</td><td>{l.customerNo||l.vendorNo||'-'}</td></tr>)}</tbody></table></div>
          </details>
        })}
      </div>
      {!journals.length?<div className="empty">Belum ada Jurnal Umum. Buka menu Perusahaan lalu klik <b>Sync Semua JV</b> pada database yang dipilih.</div>:null}
    </div>
  </>
}
