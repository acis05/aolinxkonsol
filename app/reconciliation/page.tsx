import { requireUser } from '@/lib/auth'
import { reconciliationReport } from '@/lib/consolidation/reconciliation'
import { ArrowRightLeft, CheckCircle2, CircleAlert, RefreshCcw, Scale, WandSparkles } from 'lucide-react'
export const dynamic='force-dynamic'

const iso=(d:Date)=>d.toISOString().slice(0,10)
const fmt=(n:number)=>Math.abs(n)<0.000001?'-':(n<0?`(${new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Math.abs(n))})`:new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(n))
const statusLabel:Record<string,string>={MATCHED:'Matched',DIFFERENCE:'Difference',UNMATCHED:'Unmatched',POSITION_CONFLICT:'Posisi tidak cocok',NO_BALANCE:'Tidak ada saldo'}
const statusClass:Record<string,string>={MATCHED:'reconMatched',DIFFERENCE:'reconDiff',UNMATCHED:'reconUnmatched',POSITION_CONFLICT:'reconConflict',NO_BALANCE:'reconEmpty'}

export default async function Reconciliation({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const user=await requireUser();const q=await searchParams
  const now=new Date();const to=q.to?new Date(`${q.to}T23:59:59.999Z`):now
  const tolerance=Math.max(0,Number(q.tolerance||1)||0)
  const r=await reconciliationReport(user.id,to,tolerance)
  return <>
    <div className="top"><div><div className="eyebrow">Intercompany Reconciliation</div><h1>Rekonsiliasi Intercompany</h1><div className="muted">KONSAOL membandingkan saldo pasangan akun intercompany secara otomatis sebelum jurnal eliminasi dibuat.</div></div></div>
    {q.generated?<div className="successAlert">Jurnal eliminasi berhasil dibuat dari hasil rekonsiliasi.</div>:null}
    {q.generatedAll?<div className="successAlert">{q.generatedAll} jurnal eliminasi matched berhasil dibuat.</div>:null}
    {q.error?<div className="alert">Jurnal tidak dibuat. Pastikan pasangan memiliki saldo berlawanan dan nilai yang dapat dieliminasi.</div>:null}

    <form className="card form reconToolbar">
      <label className="fieldLabel">Tanggal rekonsiliasi<input className="input" type="date" name="to" defaultValue={iso(to)}/></label>
      <label className="fieldLabel">Toleransi selisih (IDR)<input className="input" type="number" min="0" step="1" name="tolerance" defaultValue={tolerance}/></label>
      <button className="btn"><RefreshCcw size={15}/> Hitung Ulang</button>
    </form>

    <div className="reconMetrics">
      <div className="card reconMetric"><span>Total Pair</span><b>{r.summary.total}</b></div>
      <div className="card reconMetric good"><span>Matched</span><b>{r.summary.matched}</b><small>{fmt(r.summary.matchedAmount)}</small></div>
      <div className="card reconMetric warn"><span>Difference</span><b>{r.summary.difference}</b><small>{fmt(r.summary.differenceAmount)}</small></div>
      <div className="card reconMetric bad"><span>Unmatched / Konflik</span><b>{r.summary.unmatched+r.summary.conflict}</b></div>
    </div>

    {r.summary.matched>0?<form action="/api/reconciliation/generate" method="post" className="card reconGenerateAll">
      <input type="hidden" name="mode" value="all"/><input type="hidden" name="date" value={iso(to)}/><input type="hidden" name="tolerance" value={tolerance}/>
      <div><b>Siap membuat {r.summary.matched} jurnal eliminasi</b><div className="muted">Hanya pasangan berstatus Matched yang dibuat. Semua jurnal otomatis debit = kredit.</div></div>
      <button className="btn"><WandSparkles size={15}/> Generate Semua Matched</button>
    </form>:null}

    <div className="reconList">{r.rows.map(row=><div className="card reconCard" key={row.mappingId}>
      <div className="reconCardHead"><div><span className={`reconStatus ${statusClass[row.status]}`}>{statusLabel[row.status]}</span><h3>{row.sourceCompany} ↔ {row.targetCompany}</h3></div><div className="reconDiffValue"><span>Selisih</span><b>{fmt(row.difference)}</b></div></div>
      <div className="reconSides">
        <div className="reconSide"><span>Sisi A</span><b>{row.sourceAccountNo} — {row.sourceAccountName}</b><strong>{fmt(row.sourceBalance)}</strong></div>
        <div className="reconArrow"><ArrowRightLeft size={20}/></div>
        <div className="reconSide"><span>Sisi B</span><b>{row.targetAccountNo} — {row.targetAccountName}</b><strong>{fmt(row.targetBalance)}</strong></div>
      </div>
      {row.amount>0&&row.status!=='POSITION_CONFLICT'?<div className="reconJournalPreview"><div><Scale size={16}/><b>Jurnal eliminasi disarankan</b></div><div className="reconJournalGrid"><span>{row.sourceAccountNo}</span><span>Debit {fmt(row.sourceDebit)}</span><span>Kredit {fmt(row.sourceCredit)}</span><span>{row.targetAccountNo}</span><span>Debit {fmt(row.targetDebit)}</span><span>Kredit {fmt(row.targetCredit)}</span></div></div>:null}
      <div className="reconActions"><div className="muted">Jurnal tersimpan: {row.currentJournalAmount>0?`${row.currentJournalDate.toLocaleDateString('id-ID')} • ${fmt(row.currentJournalAmount)}`:'belum ada'}</div>
        {(row.status==='MATCHED'||row.status==='DIFFERENCE')&&row.amount>0?<form action="/api/reconciliation/generate" method="post"><input type="hidden" name="mappingId" value={row.mappingId}/><input type="hidden" name="date" value={iso(to)}/><input type="hidden" name="tolerance" value={tolerance}/><button className="btn secondary"><CheckCircle2 size={14}/> {row.status==='MATCHED'?'Buat Jurnal Eliminasi':'Eliminasi Nilai Match'}</button></form>:<span className="reconHint"><CircleAlert size={14}/> {row.status==='POSITION_CONFLICT'?'Kedua akun berada pada posisi saldo yang sama.':'Perlu transaksi lawan sebelum dieliminasi.'}</span>}
      </div>
    </div>)}</div>
    {!r.rows.length?<div className="card empty">Belum ada pasangan akun intercompany. Buat mapping eliminasi terlebih dahulu.</div>:null}
  </>
}
