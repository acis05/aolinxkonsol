import { requireUser } from '@/lib/auth'
import { reconciliationReport } from '@/lib/consolidation/reconciliation'
import { transactionReconciliationReport } from '@/lib/consolidation/transaction-reconciliation'
import { ArrowRightLeft, CheckCircle2, CircleAlert, RefreshCcw, Scale, WandSparkles, Rows3, Landmark } from 'lucide-react'
export const dynamic='force-dynamic'

const iso=(d:Date)=>d.toISOString().slice(0,10)
const fmt=(n:number)=>Math.abs(n)<0.000001?'-':(n<0?`(${new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Math.abs(n))})`:new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(n))
const statusLabel:Record<string,string>={MATCHED:'Matched',DIFFERENCE:'Difference',UNMATCHED:'Unmatched',POSITION_CONFLICT:'Posisi tidak cocok',NO_BALANCE:'Tidak ada saldo',PARTIAL:'Partial Match'}
const statusClass:Record<string,string>={MATCHED:'reconMatched',DIFFERENCE:'reconDiff',UNMATCHED:'reconUnmatched',POSITION_CONFLICT:'reconConflict',NO_BALANCE:'reconEmpty',PARTIAL:'reconDiff'}
const dmy=(d:Date)=>d.toLocaleDateString('id-ID')

export default async function Reconciliation({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const user=await requireUser();const q=await searchParams
  const mode=q.mode==='transactions'?'transactions':'balance'
  const now=new Date();const defaultFrom=new Date(Date.UTC(now.getUTCFullYear(),0,1))
  const to=q.to?new Date(`${q.to}T23:59:59.999Z`):now
  const from=q.from?new Date(`${q.from}T00:00:00.000Z`):defaultFrom
  const tolerance=Math.max(0,Number(q.tolerance||1)||0)
  const amountTolerance=Math.max(0,Number(q.amountTolerance||1)||0)
  const dateTolerance=Math.max(0,Number(q.dateTolerance||7)||0)
  const r=mode==='balance'?await reconciliationReport(user.id,to,tolerance):null
  const tx=mode==='transactions'?await transactionReconciliationReport(user.id,from,to,amountTolerance,dateTolerance):null
  return <>
    <div className="top"><div><div className="eyebrow">Intercompany Reconciliation</div><h1>Rekonsiliasi Intercompany</h1><div className="muted">Bandingkan saldo akun atau cocokkan transaksi satu per satu sebelum jurnal eliminasi dibuat.</div></div></div>
    {q.generated||q.generatedTx?<div className="successAlert">Jurnal eliminasi berhasil dibuat dari hasil rekonsiliasi.</div>:null}
    {q.generatedAll?<div className="successAlert">{q.generatedAll} jurnal eliminasi matched berhasil dibuat.</div>:null}
    {q.generatedTxAll?<div className="successAlert">{q.generatedTxAll} jurnal eliminasi berbasis transaksi berhasil dibuat.</div>:null}
    {q.error?<div className="alert">Jurnal tidak dibuat. Pastikan pasangan memiliki posisi saldo berlawanan dan ada nilai yang dapat dieliminasi.</div>:null}

    <div className="reconTabs">
      <a href={`/reconciliation?mode=balance&to=${iso(to)}&tolerance=${tolerance}`} className={mode==='balance'?'active':''}><Landmark size={16}/> Rekonsiliasi Saldo</a>
      <a href={`/reconciliation?mode=transactions&from=${iso(from)}&to=${iso(to)}&amountTolerance=${amountTolerance}&dateTolerance=${dateTolerance}`} className={mode==='transactions'?'active':''}><Rows3 size={16}/> Matching Transaksi</a>
    </div>

    {mode==='balance'&&r?<>
      <form className="card form reconToolbar"><input type="hidden" name="mode" value="balance"/>
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
        <div className="reconSides"><div className="reconSide"><span>Sisi A</span><b>{row.sourceAccountNo} — {row.sourceAccountName}</b><strong>{fmt(row.sourceBalance)}</strong></div><div className="reconArrow"><ArrowRightLeft size={20}/></div><div className="reconSide"><span>Sisi B</span><b>{row.targetAccountNo} — {row.targetAccountName}</b><strong>{fmt(row.targetBalance)}</strong></div></div>
        {row.amount>0&&row.status!=='POSITION_CONFLICT'?<div className="reconJournalPreview"><div><Scale size={16}/><b>Jurnal eliminasi disarankan</b></div><div className="reconJournalGrid"><span>{row.sourceAccountNo}</span><span>Debit {fmt(row.sourceDebit)}</span><span>Kredit {fmt(row.sourceCredit)}</span><span>{row.targetAccountNo}</span><span>Debit {fmt(row.targetDebit)}</span><span>Kredit {fmt(row.targetCredit)}</span></div></div>:null}
        <div className="reconActions"><div className="muted">Jurnal tersimpan: {row.currentJournalAmount>0?`${row.currentJournalDate.toLocaleDateString('id-ID')} • ${fmt(row.currentJournalAmount)}`:'belum ada'}</div>{(row.status==='MATCHED'||row.status==='DIFFERENCE')&&row.amount>0?<form action="/api/reconciliation/generate" method="post"><input type="hidden" name="mappingId" value={row.mappingId}/><input type="hidden" name="date" value={iso(to)}/><input type="hidden" name="tolerance" value={tolerance}/><button className="btn secondary"><CheckCircle2 size={14}/> {row.status==='MATCHED'?'Buat Jurnal Eliminasi':'Eliminasi Nilai Match'}</button></form>:<span className="reconHint"><CircleAlert size={14}/> {row.status==='POSITION_CONFLICT'?'Kedua akun berada pada posisi saldo yang sama.':'Perlu transaksi lawan sebelum dieliminasi.'}</span>}</div>
      </div>)}</div>
      {!r.rows.length?<div className="card empty">Belum ada pasangan akun intercompany. Buat mapping eliminasi terlebih dahulu.</div>:null}
    </>:null}

    {mode==='transactions'&&tx?<>
      <form className="card form reconToolbar txToolbar"><input type="hidden" name="mode" value="transactions"/>
        <label className="fieldLabel">Dari tanggal<input className="input" type="date" name="from" defaultValue={iso(from)}/></label>
        <label className="fieldLabel">Sampai tanggal<input className="input" type="date" name="to" defaultValue={iso(to)}/></label>
        <label className="fieldLabel">Toleransi nominal (IDR)<input className="input" type="number" min="0" step="1" name="amountTolerance" defaultValue={amountTolerance}/></label>
        <label className="fieldLabel">Toleransi tanggal (hari)<input className="input" type="number" min="0" max="90" step="1" name="dateTolerance" defaultValue={dateTolerance}/></label>
        <button className="btn"><RefreshCcw size={15}/> Match Ulang</button>
      </form>
      <div className="reconMetrics txMetrics">
        <div className="card reconMetric"><span>Pasangan Akun</span><b>{tx.summary.pairs}</b></div>
        <div className="card reconMetric good"><span>Transaksi Matched</span><b>{tx.summary.matched}</b><small>{fmt(tx.summary.matchedAmount)}</small></div>
        <div className="card reconMetric warn"><span>Partial Match</span><b>{tx.summary.partial}</b></div>
        <div className="card reconMetric bad"><span>Unmatched</span><b>{tx.summary.unmatched}</b></div>
      </div>
      {tx.summary.matchedAmount>0?<form action="/api/reconciliation/generate-transactions" method="post" className="card reconGenerateAll">
        <input type="hidden" name="mode" value="all"/><input type="hidden" name="from" value={iso(from)}/><input type="hidden" name="to" value={iso(to)}/><input type="hidden" name="amountTolerance" value={amountTolerance}/><input type="hidden" name="dateTolerance" value={dateTolerance}/>
        <div><b>Generate jurnal dari total transaksi yang sudah match</b><div className="muted">Tanggal jurnal eliminasi menggunakan tanggal akhir periode. Partial match hanya mengambil nilai yang mempunyai pasangan.</div></div><button className="btn"><WandSparkles size={15}/> Generate Semua Nilai Match</button>
      </form>:null}

      <div className="txPairList">{tx.rows.map((pair:any)=><div className="card txPairCard" key={pair.mappingId}>
        <div className="txPairHead"><div><div className="eyebrow">Transaction Matching</div><h3>{pair.sourceCompany} ↔ {pair.targetCompany}</h3><div className="muted">{pair.sourceAccountNo} {pair.sourceAccountName} ↔ {pair.targetAccountNo} {pair.targetAccountName}</div></div><div className="txPairStats"><span><b>{pair.summary.matched}</b> matched</span><span><b>{pair.summary.partial}</b> partial</span><span><b>{pair.summary.unmatched}</b> unmatched</span><strong>{fmt(pair.summary.matchedAmount)}</strong></div></div>
        <div className="txTableWrap"><table className="table txTable"><thead><tr><th>Status</th><th>Sisi A</th><th>Tanggal A</th><th className="numCell">Nilai A</th><th>Sisi B</th><th>Tanggal B</th><th className="numCell">Nilai B</th><th className="numCell">Match</th><th>Confidence</th></tr></thead><tbody>{pair.matches.map((m:any,i:number)=>{
          const targetOnly=m.reason.startsWith('TARGET_ONLY:')
          const a=targetOnly?null:m.source,b=targetOnly?m.source:m.target
          return <tr key={`${pair.mappingId}-${i}`}><td><span className={`reconStatus ${statusClass[m.status]}`}>{statusLabel[m.status]}</span></td><td>{a?<><b>{a.journalNumber||'-'}</b><small>{a.memo||a.description||'-'}</small></>:'-'}</td><td>{a?dmy(a.journalDate):'-'}</td><td className="numCell">{a?fmt(a.amount):'-'}</td><td>{b?<><b>{b.journalNumber||'-'}</b><small>{b.memo||b.description||'-'}</small></>:'-'}</td><td>{b?dmy(b.journalDate):'-'}</td><td className="numCell">{b?fmt(b.amount):'-'}</td><td className="numCell"><b>{fmt(m.matchedAmount)}</b>{m.difference>0?<small>selisih {fmt(m.difference)}</small>:null}</td><td><span className={`confidence conf${m.confidence||'NONE'}`}>{m.confidence||'-'}</span><small>{m.reason.replace('TARGET_ONLY: ','')}</small></td></tr>})}</tbody></table></div>
        <div className="reconActions"><div className="muted">Jurnal tersimpan: {pair.currentJournalAmount>0?`${dmy(pair.currentJournalDate)} • ${fmt(pair.currentJournalAmount)}`:'belum ada'}</div>{pair.summary.matchedAmount>0?<form action="/api/reconciliation/generate-transactions" method="post"><input type="hidden" name="mappingId" value={pair.mappingId}/><input type="hidden" name="from" value={iso(from)}/><input type="hidden" name="to" value={iso(to)}/><input type="hidden" name="amountTolerance" value={amountTolerance}/><input type="hidden" name="dateTolerance" value={dateTolerance}/><button className="btn secondary"><WandSparkles size={14}/> Buat Jurnal Nilai Match {fmt(pair.summary.matchedAmount)}</button></form>:<span className="reconHint"><CircleAlert size={14}/> Belum ada transaksi yang aman untuk dieliminasi.</span>}</div>
      </div>)}</div>
      {!tx.rows.length?<div className="card empty">Belum ada mapping akun. Buat mapping eliminasi terlebih dahulu.</div>:null}
    </>:null}
  </>
}
