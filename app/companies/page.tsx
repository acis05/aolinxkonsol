import { prisma } from '@/lib/db'
import { getOAuthStatus, listDatabases } from '@/lib/accurate/oauth'
import { Link2, Database, RefreshCcw } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function Companies(){
  const companies=await prisma.company.findMany({orderBy:{createdAt:'desc'}})
  const oauth=await getOAuthStatus()
  let databases: Awaited<ReturnType<typeof listDatabases>> = []
  let apiError=''
  if(oauth.connected){try{databases=await listDatabases()}catch(e:any){apiError=e.message}}
  const selected=new Set(companies.map(c=>c.accurateDbId).filter(Boolean))
  return <>
    <div className="top"><div><div className="eyebrow">Master Data</div><h1>Perusahaan</h1><div className="muted">Hubungkan akun Accurate Online lalu pilih database yang akan masuk ke grup konsolidasi.</div></div></div>
    <div className="card oauthCard"><div><div className="sectionTitle"><Link2 size={16} style={{verticalAlign:'-3px',marginRight:7}}/>Koneksi Accurate Online</div>{oauth.connected?<div className="muted">Terhubung{oauth.userName?` sebagai ${oauth.userName}`:''}{oauth.userEmail?` (${oauth.userEmail})`:''}. Token OAuth diperbarui otomatis.</div>:<div className="muted">Belum terhubung. Login ke Accurate Online dan berikan akses jurnal umum.</div>}</div><div className="form">{oauth.connected?<><a className="btn secondary" href="/api/accurate/oauth/start"><RefreshCcw size={15}/> Hubungkan Ulang</a><form action="/api/accurate/oauth/disconnect" method="post"><button className="btn danger">Putuskan</button></form></>:<a className="btn" href="/api/accurate/oauth/start">Hubungkan Accurate</a>}</div></div>
    {apiError?<div className="alert">{apiError}</div>:null}
    {oauth.connected?<div className="card" style={{marginTop:16}}><div className="sectionHeader"><div><h2>Database Accurate</h2><div className="muted">Pilih database perusahaan yang ingin dikelola di KONSAOL.</div></div><Database size={20} color="#ef315d"/></div><div className="dbGrid">{databases.map(db=><form key={db.id} className="dbCard" action="/api/companies" method="post"><input type="hidden" name="accurateDbId" value={db.id}/><input type="hidden" name="name" value={db.alias}/><div><b>{db.alias}</b><div className="muted">DB ID {db.id}{db.expired?' • expired':''}</div></div><button disabled={selected.has(String(db.id))} className="btn secondary">{selected.has(String(db.id))?'Ditambahkan':'Tambah'}</button></form>)}</div></div>:null}
    <div className="card" style={{marginTop:16}}><div className="sectionHeader"><div><h2>Perusahaan Aktif</h2><div className="muted">Sinkronkan jurnal berdasarkan rentang tanggal yang dibutuhkan.</div></div></div><div className="tableWrap"><table className="table"><thead><tr><th>Perusahaan</th><th>Accurate DB</th><th>Status</th><th>Sinkronisasi Jurnal</th></tr></thead><tbody>{companies.map(c=><tr key={c.id}><td><b>{c.name}</b></td><td>{c.accurateDbId||'-'}</td><td><span className="pill">Aktif</span></td><td><form action={`/api/companies/${c.id}/sync`} method="post" className="form"><input className="input" name="from" placeholder="01/01/2026"/><input className="input" name="to" placeholder="31/12/2026"/><button className="btn secondary"><RefreshCcw size={14}/> Sync</button></form></td></tr>)}</tbody></table></div>{!companies.length?<div className="empty">Belum ada perusahaan. Hubungkan Accurate lalu tambahkan database di atas.</div>:null}</div>
  </>
}
