'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Waypoints } from 'lucide-react'

type AccountOption={id:string;accountNo:string;name:string}
type CompanyOption={id:string;name:string;accounts:AccountOption[]}
type Preview={
  status:string;amount:number;sourceBalance:number;targetBalance:number;
  sourceDebit:number;sourceCredit:number;targetDebit:number;targetCredit:number;
  sourceLabel:string;targetLabel:string
}
const fmt=(n:number)=>new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(n||0)

export default function EliminationMappingForm({companies}:{companies:CompanyOption[]}){
  const first=companies[0]?.id||''
  const second=companies[1]?.id||first
  const [sourceCompanyId,setSourceCompanyId]=useState(first)
  const [targetCompanyId,setTargetCompanyId]=useState(second)
  const sourceAccounts=useMemo(()=>companies.find(c=>c.id===sourceCompanyId)?.accounts||[],[companies,sourceCompanyId])
  const targetAccounts=useMemo(()=>companies.find(c=>c.id===targetCompanyId)?.accounts||[],[companies,targetCompanyId])
  const [sourceAccountId,setSourceAccountId]=useState(sourceAccounts[0]?.id||'')
  const [targetAccountId,setTargetAccountId]=useState(targetAccounts[0]?.id||'')
  const [eliminationDate,setEliminationDate]=useState(()=>new Date().toISOString().slice(0,10))
  const [preview,setPreview]=useState<Preview|null>(null)
  const [previewLoading,setPreviewLoading]=useState(false)
  const [previewError,setPreviewError]=useState('')

  function changeSourceCompany(id:string){
    setSourceCompanyId(id)
    setSourceAccountId(companies.find(c=>c.id===id)?.accounts[0]?.id||'')
  }
  function changeTargetCompany(id:string){
    setTargetCompanyId(id)
    setTargetAccountId(companies.find(c=>c.id===id)?.accounts[0]?.id||'')
  }

  const invalidSameCompany=!!sourceCompanyId && sourceCompanyId===targetCompanyId
  const noAccounts=!sourceAccounts.length||!targetAccounts.length

  useEffect(()=>{
    let cancelled=false
    if(invalidSameCompany||!sourceAccountId||!targetAccountId||!eliminationDate){setPreview(null);return}
    const timer=setTimeout(async()=>{
      setPreviewLoading(true);setPreviewError('')
      try{
        const r=await fetch('/api/mappings/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sourceAccountId,targetAccountId,eliminationDate})})
        const body=await r.json()
        if(!r.ok)throw new Error(body?.error||'Preview gagal')
        if(!cancelled)setPreview(body)
      }catch(e:any){if(!cancelled){setPreview(null);setPreviewError(e?.message||'Preview gagal')}}
      finally{if(!cancelled)setPreviewLoading(false)}
    },300)
    return()=>{cancelled=true;clearTimeout(timer)}
  },[sourceAccountId,targetAccountId,eliminationDate,invalidSameCompany])

  return <form className="card eliminationForm" action="/api/mappings" method="post">
    <div className="mappingSide">
      <h3>Sisi A <span className="muted">(akun yang dikurangi)</span></h3>
      <label className="fieldLabel">Database
        <select className="input" name="sourceCompanyId" value={sourceCompanyId} onChange={e=>changeSourceCompany(e.target.value)} required>
          {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="fieldLabel">Akun
        <select className="input" name="sourceAccountId" value={sourceAccountId} onChange={e=>setSourceAccountId(e.target.value)} required>
          {sourceAccounts.map(a=><option key={a.id} value={a.id}>{a.accountNo} — {a.name}</option>)}
        </select>
      </label>
      {!sourceAccounts.length?<div className="formHint warn">COA database ini belum tersedia. Sync COA terlebih dahulu.</div>:null}
    </div>

    <div className="mapArrow"><Waypoints size={30}/><span>dipasangkan dengan</span></div>

    <div className="mappingSide">
      <h3>Sisi B <span className="muted">(akun lawan jurnal)</span></h3>
      <label className="fieldLabel">Database
        <select className="input" name="targetCompanyId" value={targetCompanyId} onChange={e=>changeTargetCompany(e.target.value)} required>
          {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="fieldLabel">Akun
        <select className="input" name="targetAccountId" value={targetAccountId} onChange={e=>setTargetAccountId(e.target.value)} required>
          {targetAccounts.map(a=><option key={a.id} value={a.id}>{a.accountNo} — {a.name}</option>)}</select>
      </label>
      {!targetAccounts.length?<div className="formHint warn">COA database ini belum tersedia. Sync COA terlebih dahulu.</div>:null}
    </div>

    {invalidSameCompany?<div className="formHint error mappingValidation">Sisi A dan Sisi B harus menggunakan database/perusahaan yang berbeda.</div>:null}
    <label className="fieldLabel mappingDate"><span><CalendarDays size={14}/> Tanggal jurnal eliminasi</span><input className="input" type="date" name="eliminationDate" value={eliminationDate} onChange={e=>setEliminationDate(e.target.value)} required/></label>
    <label className="fieldLabel mappingNote">Catatan<input className="input" name="note" placeholder="Contoh: Piutang PT B ↔ Hutang PT A"/></label>

    <div className="eliminationPreview">
      <div className="sectionHeader"><div><h3>Preview Jurnal Eliminasi</h3><div className="muted">Jurnal ini akan masuk ke laporan hanya jika tanggal jurnal berada di dalam periode laporan (Laba Rugi) atau ≤ tanggal Neraca.</div></div></div>
      {previewLoading?<div className="muted">Menghitung saldo dan jurnal…</div>:previewError?<div className="formHint error">{previewError}</div>:preview?<>
        <div className="previewBalances"><div><span>Saldo Sisi A s.d. tanggal</span><b>{fmt(preview.sourceBalance)}</b></div><div><span>Saldo Sisi B s.d. tanggal</span><b>{fmt(preview.targetBalance)}</b></div><div><span>Nilai eliminasi</span><b>{fmt(preview.amount)}</b></div></div>
        {preview.amount>0?<div className="journalPreviewTable"><div className="journalPreviewHead"><span>Akun</span><span>Debit</span><span>Kredit</span></div><div className="journalPreviewRow"><span>{preview.sourceLabel}</span><b>{preview.sourceDebit?fmt(preview.sourceDebit):'-'}</b><b>{preview.sourceCredit?fmt(preview.sourceCredit):'-'}</b></div><div className="journalPreviewRow"><span>{preview.targetLabel}</span><b>{preview.targetDebit?fmt(preview.targetDebit):'-'}</b><b>{preview.targetCredit?fmt(preview.targetCredit):'-'}</b></div><div className="journalPreviewTotal"><span>TOTAL</span><b>{fmt(preview.sourceDebit+preview.targetDebit)}</b><b>{fmt(preview.sourceCredit+preview.targetCredit)}</b></div></div>:<div className="formHint warn">Tidak ada saldo yang dapat dieliminasi pada tanggal ini.</div>}
      </>:<div className="muted">Pilih dua akun dan tanggal untuk melihat preview.</div>}
    </div>

    <button className="btn mappingSave" disabled={invalidSameCompany||noAccounts||!sourceAccountId||!targetAccountId||!eliminationDate||!preview||preview.amount<=0}><Waypoints size={15}/> Simpan Mapping & Jurnal Eliminasi</button>
  </form>
}
