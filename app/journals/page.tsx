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

  const page=Math.max(1,Number(q.page||1)||1)
  const pageSize=100
  const where:any={
      company:{userId:user.id},
      ...(companyId?{companyId}:{}),
      ...(from||to?{transDate:{...(from?{gte:from}:{}),...(to?{lte:to}:{})}}:{}),
      ...(keyword?{OR:[{number:{contains:keyword,mode:'insensitive'}},{description:{contains:keyword,mode:'insensitive'}}]}:{})
    }
  const [journalCount,lineCount,headerOnlyCount,journals]=await Promise.all([
    prisma.journal.count({where}),
    prisma.journalLine.count({where:{journal:{is:where}}}),
    prisma.journal.count({where:{...where,lines:{none:{}}}}),
    prisma.journal.findMany({
      where,
      include:{company:true,lines:{include:{account:true},orderBy:{id:'asc'}}},
      orderBy:[{transDate:'desc'},{number:'desc'}],
      skip:(page-1)*pageSize,
      take:pageSize
    })
  ])
  const pageCount=Math.max(1,Math.ceil(journalCount/pageSize))
  const pageHref=(nextPage:number)=>{
    const entries=Object.entries(q).filter(([,v])=>v!==undefined) as [string,string][]
    const sp=new URLSearchParams(entries)
    sp.set('page',String(nextPage))
    return `?${sp.toString()}`
  }
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
      <div className="card metricCard"><div className="metricLabel">Total jurnal</div><div className="metric">{journalCount.toLocaleString('id-ID')}</div></div>
      <div className="card metricCard"><div className="metricLabel">Baris debit/kredit</div><div className="metric">{lineCount.toLocaleString('id-ID')}</div></div>
      <div className="card metricCard"><div className="metricLabel">Database aktif</div><div className="metric">{companies.length.toLocaleString('id-ID')}</div></div>
      <div className="card metricCard"><div className="metricLabel">Header tanpa detail</div><div className="metric">{headerOnlyCount.toLocaleString('id-ID')}</div></div>
    </div>
    {headerOnlyCount>0?<div className="alert" style={{marginTop:16}}><b>{headerOnlyCount.toLocaleString('id-ID')} jurnal masih tanpa detail debit/kredit.</b> Ini biasanya data hasil sync versi lama. Jalankan <b>Sync Semua JV</b> kembali; versi baru akan mengisi detailnya.</div>:null}
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
      {pageCount>1?<div className="form" style={{justifyContent:'center',marginTop:18}}>{page>1?<a className="btn secondary" href={pageHref(page-1)}>← Sebelumnya</a>:null}<span className="muted">Halaman {page} / {pageCount}</span>{page<pageCount?<a className="btn secondary" href={pageHref(page+1)}>Berikutnya →</a>:null}</div>:null}
    </div>
  </>
}
