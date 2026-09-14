import { consolidatedReport } from '@/lib/consolidation/report'
import { BarChart3, RefreshCcw } from 'lucide-react'
export const dynamic = 'force-dynamic'

const fmt=(n:number)=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(n)
export default async function Reports({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const q=await searchParams
  const from=q.from?new Date(q.from):new Date(new Date().getFullYear(),0,1)
  const to=q.to?new Date(q.to):new Date()
  const r=await consolidatedReport(from,to)
  return <>
    <div className="top"><div><div className="eyebrow">Financial Reporting</div><h1>Laporan Konsolidasi</h1><div className="muted">Lihat nilai per perusahaan secara berdampingan dan total konsolidasi berdasarkan mapping akun.</div></div></div>
    <form className="card form"><label className="fieldLabel">Dari tanggal<input className="input" type="date" name="from" defaultValue={q.from}/></label><label className="fieldLabel">Sampai tanggal<input className="input" type="date" name="to" defaultValue={q.to}/></label><button className="btn" style={{alignSelf:'end'}}><RefreshCcw size={15}/> Tampilkan</button></form>
    <div className="card" style={{marginTop:16}}><div className="sectionHeader"><div><h2><BarChart3 size={17} style={{verticalAlign:'-3px',marginRight:7}}/>Laporan Multi-Company</h2><div className="muted">Periode {from.toLocaleDateString('id-ID')} — {to.toLocaleDateString('id-ID')}</div></div></div><div className="tableWrap"><table className="table"><thead><tr><th>Kelompok Akun</th>{r.companies.map(c=><th key={c.id}>{c.name}</th>)}<th>Total Konsolidasi</th></tr></thead><tbody>{r.rows.map(row=><tr key={row.key}><td><b>{row.key}</b></td>{r.companies.map(c=><td key={c.id} style={{textAlign:'right'}}>{fmt(row.values[c.id]||0)}</td>)}<td className="reportTotal" style={{textAlign:'right'}}>{fmt(row.total)}</td></tr>)}</tbody></table></div>{!r.rows.length?<div className="empty">Belum ada data laporan. Sync jurnal dan lengkapi mapping akun terlebih dahulu.</div>:null}</div>
  </>
}
