import { prisma } from '@/lib/db'
import { requireUser } from '@/lib/auth'
import { Trash2 } from 'lucide-react'
import EliminationMappingForm from '@/components/EliminationMappingForm'
export const dynamic='force-dynamic'
export default async function Mappings({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const user=await requireUser();const q=await searchParams
  const [companies,mappings]=await Promise.all([
    prisma.company.findMany({where:{userId:user.id,active:true},include:{accounts:{where:{active:true},orderBy:{accountNo:'asc'}}},orderBy:{name:'asc'}}),
    prisma.eliminationMapping.findMany({where:{userId:user.id},include:{sourceCompany:true,targetCompany:true,sourceAccount:true,targetAccount:true},orderBy:{updatedAt:'desc'}})
  ])
  const companyOptions=companies.map(c=>({id:c.id,name:c.name,accounts:c.accounts.map(a=>({id:a.id,accountNo:a.accountNo,name:a.name}))}))
  const errorMsg=q.error==='same-company'?'Sisi A dan Sisi B harus berasal dari perusahaan/database yang berbeda.':q.error==='account'?'Akun tidak sesuai dengan database atau sudah tidak tersedia. Silakan pilih ulang akun.':q.error?'Mapping tidak valid. Pastikan database dan akun sudah benar.':''
  return <>
    <div className="top"><div><div className="eyebrow">Intercompany Elimination</div><h1>Mapping Eliminasi Akun</h1><div className="muted">Mapping hanya digunakan untuk eliminasi. Pilih database dan akun di Sisi A, lalu pasangkan dengan akun lawannya di database berbeda pada Sisi B.</div></div></div>
    {errorMsg?<div className="alert">{errorMsg}</div>:null}
    {q.saved?<div className="successAlert">Mapping eliminasi disimpan.</div>:null}
    {companies.length<2?<div className="alert">Minimal 2 database aktif diperlukan untuk membuat mapping eliminasi.</div>:null}
    <EliminationMappingForm companies={companyOptions}/>
    <div className="card" style={{marginTop:16}}><div className="sectionHeader"><div><h2>Daftar Pasangan Eliminasi</h2><div className="muted">Semua mapping di bawah khusus eliminasi intercompany.</div></div></div><div className="tableWrap"><table className="table"><thead><tr><th>Database / Akun A</th><th>Database / Akun B</th><th>Catatan</th><th>Aksi</th></tr></thead><tbody>{mappings.map(m=><tr key={m.id}><td><b>{m.sourceCompany.name}</b><br/>{m.sourceAccount.accountNo} — {m.sourceAccount.name}</td><td><b>{m.targetCompany.name}</b><br/>{m.targetAccount.accountNo} — {m.targetAccount.name}</td><td>{m.note||'-'}</td><td><form action={`/api/mappings/${m.id}`} method="post"><button className="btn danger"><Trash2 size={14}/> Hapus</button></form></td></tr>)}</tbody></table></div>{!mappings.length?<div className="empty">Belum ada pasangan akun eliminasi.</div>:null}</div>
  </>
}
