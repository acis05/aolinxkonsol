import { prisma } from '@/lib/db'
import { Waypoints } from 'lucide-react'
export const dynamic = 'force-dynamic'

export default async function Mappings(){
  const [companies,mappings]=await Promise.all([prisma.company.findMany(),prisma.accountMapping.findMany({include:{company:true},orderBy:{updatedAt:'desc'}})])
  return <>
    <div className="top"><div><div className="eyebrow">Configuration</div><h1>Mapping Akun</h1><div className="muted">Petakan akun Accurate ke kelompok laporan konsolidasi dan tandai akun intercompany.</div></div></div>
    <div className="infoStrip"><span className="infoDot"/><div className="muted">Gunakan tipe <b>REPORTING</b> untuk klasifikasi laporan dan <b>INTERCOMPANY</b> untuk akun piutang/hutang antar perusahaan yang perlu direkonsiliasi.</div></div>
    <form className="card mappingForm" action="/api/mappings" method="post">
      <label className="fieldLabel">Perusahaan<select className="input" name="companyId" required>{companies.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <label className="fieldLabel">No. Akun<input className="input" name="accountNo" placeholder="1101" required/></label>
      <label className="fieldLabel">Kelompok Konsolidasi<input className="input" name="consolidatedKey" placeholder="Accounts Receivable" required/></label>
      <label className="fieldLabel">Tipe<select className="input" name="type"><option>REPORTING</option><option>INTERCOMPANY</option></select></label>
      <label className="fieldLabel">Counterparty<input className="input" name="counterpartyId" placeholder="Company ID (opsional)"/></label>
      <button className="btn"><Waypoints size={15}/> Simpan</button>
    </form>
    <div className="card" style={{marginTop:16}}><div className="sectionHeader"><div><h2>Daftar Mapping</h2><div className="muted">Mapping yang digunakan oleh mesin laporan konsolidasi.</div></div></div><div className="tableWrap"><table className="table"><thead><tr><th>Perusahaan</th><th>Akun</th><th>Tipe</th><th>Kelompok Konsolidasi</th></tr></thead><tbody>{mappings.map(m=><tr key={m.id}><td><b>{m.company.name}</b></td><td>{m.accountNo}</td><td><span className={m.type==='INTERCOMPANY'?'eyebrow':'pill'} style={{marginBottom:0}}>{m.type}</span></td><td>{m.consolidatedKey}</td></tr>)}</tbody></table></div>{!mappings.length?<div className="empty">Belum ada mapping akun.</div>:null}</div>
  </>
}
