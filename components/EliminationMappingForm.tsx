'use client'

import { useMemo, useState } from 'react'
import { Waypoints } from 'lucide-react'

type AccountOption={id:string;accountNo:string;name:string}
type CompanyOption={id:string;name:string;accounts:AccountOption[]}

export default function EliminationMappingForm({companies}:{companies:CompanyOption[]}){
  const first=companies[0]?.id||''
  const second=companies[1]?.id||first
  const [sourceCompanyId,setSourceCompanyId]=useState(first)
  const [targetCompanyId,setTargetCompanyId]=useState(second)
  const sourceAccounts=useMemo(()=>companies.find(c=>c.id===sourceCompanyId)?.accounts||[],[companies,sourceCompanyId])
  const targetAccounts=useMemo(()=>companies.find(c=>c.id===targetCompanyId)?.accounts||[],[companies,targetCompanyId])
  const [sourceAccountId,setSourceAccountId]=useState(sourceAccounts[0]?.id||'')
  const [targetAccountId,setTargetAccountId]=useState(targetAccounts[0]?.id||'')

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

  return <form className="card eliminationForm" action="/api/mappings" method="post">
    <div className="mappingSide">
      <h3>Sisi A</h3>
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
      <h3>Sisi B</h3>
      <label className="fieldLabel">Database
        <select className="input" name="targetCompanyId" value={targetCompanyId} onChange={e=>changeTargetCompany(e.target.value)} required>
          {companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="fieldLabel">Akun
        <select className="input" name="targetAccountId" value={targetAccountId} onChange={e=>setTargetAccountId(e.target.value)} required>
          {targetAccounts.map(a=><option key={a.id} value={a.id}>{a.accountNo} — {a.name}</option>)}
        </select>
      </label>
      {!targetAccounts.length?<div className="formHint warn">COA database ini belum tersedia. Sync COA terlebih dahulu.</div>:null}
    </div>

    {invalidSameCompany?<div className="formHint error mappingValidation">Sisi A dan Sisi B harus menggunakan database/perusahaan yang berbeda.</div>:null}
    <label className="fieldLabel mappingNote">Catatan<input className="input" name="note" placeholder="Contoh: Piutang PT B ↔ Hutang PT A"/></label>
    <button className="btn mappingSave" disabled={invalidSameCompany||noAccounts||!sourceAccountId||!targetAccountId}><Waypoints size={15}/> Simpan Mapping</button>
  </form>
}
