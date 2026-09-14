import { consolidatedReport, type ReportRow } from '@/lib/consolidation/report'
import { BarChart3, Download, FileSpreadsheet, FileText, RefreshCcw, Scale } from 'lucide-react'
import { requireUser } from '@/lib/auth'
export const dynamic='force-dynamic'

const fmt=(n:number)=>{
  if(Math.abs(n)<0.000001)return '-'
  const s=new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Math.abs(n))
  return n<0?`(${s})`:s
}
const iso=(d:Date)=>d.toISOString().slice(0,10)

function ReportTable({title,subtitle,rows,companies}:{title:string;subtitle:string;rows:ReportRow[];companies:any[]}){
  return <div className="card reportCard" style={{marginTop:18}}>
    <div className="sectionHeader"><div><h2>{title}</h2><div className="muted">{subtitle}</div></div></div>
    <div className="tableWrap reportTableWrap"><table className="table reportTable">
      <thead><tr><th className="reportAccountCol">Keterangan</th>{companies.map(c=><th key={c.id} className="numHead">{c.name}</th>)}<th className="numHead">Eliminasi</th><th className="numHead consolidatedHead">Konsolidasi</th></tr></thead>
      <tbody>{rows.map(r=>{
        if(r.kind==='section')return <tr key={r.id} className="reportSection"><td colSpan={companies.length+3}>{r.label}</td></tr>
        const cls=`reportRow report-${r.kind}`
        return <tr key={r.id} className={cls}>
          <td className="reportLabel">{r.accountNo?<><span className="accountNo">{r.accountNo}</span><span>{r.label}</span></>:<b>{r.label}</b>}</td>
          {companies.map(c=><td key={c.id} className="numCell">{fmt(r.values[c.id]||0)}</td>)}
          <td className="numCell eliminationCell">{fmt(r.elimination)}</td>
          <td className="numCell consolidatedCell">{fmt(r.consolidated)}</td>
        </tr>
      })}</tbody>
    </table></div>
  </div>
}

export default async function Reports({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const user=await requireUser();const q=await searchParams
  const now=new Date();const from=q.from?new Date(q.from):new Date(now.getFullYear(),0,1);const to=q.to?new Date(q.to):now
  const r=await consolidatedReport(user.id,from,to)
  const query=`from=${encodeURIComponent(iso(from))}&to=${encodeURIComponent(iso(to))}`
  const balanced=Math.abs(r.balanceSummary.difference)<1
  return <>
    <div className="top"><div><div className="eyebrow">Financial Reporting</div><h1>Laporan Keuangan Konsolidasi</h1><div className="muted">Format penyajian akuntansi umum: Laba Rugi berjenjang dan Neraca terklasifikasi, lengkap dengan eliminasi antar entitas.</div></div></div>
    <form className="card form reportToolbar">
      <label className="fieldLabel">Dari tanggal<input className="input" type="date" name="from" defaultValue={iso(from)}/></label>
      <label className="fieldLabel">Sampai tanggal<input className="input" type="date" name="to" defaultValue={iso(to)}/></label>
      <button className="btn" style={{alignSelf:'end'}}><RefreshCcw size={15}/> Tampilkan</button>
      <a className="btn secondary" style={{alignSelf:'end'}} href={`/api/reports/export/excel?${query}`}><FileSpreadsheet size={15}/> Excel</a>
      <a className="btn secondary" style={{alignSelf:'end'}} href={`/api/reports/export/pdf?${query}`}><FileText size={15}/> PDF</a>
    </form>

    <div className="reportMetrics">
      <div className="metric card"><div className="muted">Pendapatan Konsolidasi</div><div className="metricValue">{fmt(r.pnlSummary.revenue)}</div></div>
      <div className="metric card"><div className="muted">Laba Kotor</div><div className="metricValue">{fmt(r.pnlSummary.grossProfit)}</div></div>
      <div className="metric card"><div className="muted">Laba Bersih</div><div className="metricValue">{fmt(r.pnlSummary.netProfit)}</div></div>
      <div className="metric card"><div className="muted">Total Aset</div><div className="metricValue">{fmt(r.balanceSummary.assets)}</div></div>
    </div>

    <div className={`card balanceStatus ${balanced?'ok':'warn'}`} style={{marginTop:16}}>
      <Scale size={20}/><div><b>{balanced?'Neraca balance':'Neraca belum balance'}</b><div className="muted">Selisih Aset terhadap Liabilitas + Ekuitas: {fmt(r.balanceSummary.difference)}. Neraca dihitung kumulatif sampai {to.toLocaleDateString('id-ID')}.</div></div>
    </div>

    <ReportTable title="Laporan Laba Rugi Konsolidasi" subtitle={`Periode ${from.toLocaleDateString('id-ID')} s.d. ${to.toLocaleDateString('id-ID')}. Beban ditampilkan positif dan dikurangkan pada subtotal.`} rows={r.pnl} companies={r.companies}/>
    <ReportTable title="Laporan Posisi Keuangan (Neraca) Konsolidasi" subtitle={`Saldo kumulatif sampai ${to.toLocaleDateString('id-ID')}. Laba/rugi tahun berjalan disajikan sebagai bagian ekuitas sebelum jurnal penutupan.`} rows={r.balanceSheet} companies={r.companies}/>

    <div className="card" style={{marginTop:18}}><div className="sectionHeader"><div><h2><BarChart3 size={17} style={{verticalAlign:'-3px',marginRight:7}}/>Jurnal Eliminasi</h2><div className="muted">Setiap eliminasi otomatis dibentuk sebagai jurnal dua sisi dengan total debit = kredit. Pair dengan posisi saldo yang sama tidak dipaksakan.</div></div></div><div className="tableWrap"><table className="table"><thead><tr><th>Pasangan Akun</th><th>Status</th><th className="numHead">Debit A</th><th className="numHead">Kredit A</th><th className="numHead">Debit B</th><th className="numHead">Kredit B</th><th className="numHead">Nilai Eliminasi</th></tr></thead><tbody>{r.eliminationRows.map(e=><tr key={e.id}><td>{e.label}</td><td>{e.status==='BALANCED'?'Balance':e.status==='UNBALANCED_PAIR'?'Pair tidak balance':'Tidak ada saldo'}</td><td className="numCell">{fmt(e.sourceDebit)}</td><td className="numCell">{fmt(e.sourceCredit)}</td><td className="numCell">{fmt(e.targetDebit)}</td><td className="numCell">{fmt(e.targetCredit)}</td><td className="numCell reportTotal">{fmt(e.amount)}</td></tr>)}</tbody></table></div>{!r.eliminationRows.length?<div className="empty">Belum ada mapping eliminasi.</div>:null}</div>
  </>
}
