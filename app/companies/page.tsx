import { prisma } from '@/lib/db'
import { getOAuthStatus, listDatabases } from '@/lib/accurate/oauth'

export const dynamic = 'force-dynamic'

export default async function Companies(){
  const companies=await prisma.company.findMany({orderBy:{createdAt:'desc'}})
  const oauth=await getOAuthStatus()
  let databases: Awaited<ReturnType<typeof listDatabases>> = []
  let apiError=''
  if(oauth.connected){try{databases=await listDatabases()}catch(e:any){apiError=e.message}}
  const selected=new Set(companies.map(c=>c.accurateDbId).filter(Boolean))
  return <>
    <div className="top"><div><h1>Companies</h1><div className="muted">Hubungkan Accurate Online via OAuth lalu pilih database perusahaan yang masuk konsolidasi.</div></div></div>
    <div className="card oauthCard">
      <div><div className="sectionTitle">Accurate Online OAuth</div>{oauth.connected?<div className="muted">Connected{oauth.userName?` sebagai ${oauth.userName}`:''}{oauth.userEmail?` (${oauth.userEmail})`:''}. Token diperbarui otomatis.</div>:<div className="muted">Belum terhubung. Login Accurate dan berikan akses jurnal umum.</div>}</div>
      <div className="form">{oauth.connected?<><a className="btn secondary" href="/api/accurate/oauth/start">Reconnect</a><form action="/api/accurate/oauth/disconnect" method="post"><button className="btn danger">Disconnect</button></form></>:<a className="btn" href="/api/accurate/oauth/start">Connect Accurate</a>}</div>
    </div>
    {apiError?<div className="alert">{apiError}</div>:null}
    {oauth.connected?<div className="card" style={{marginTop:16}}><div className="sectionTitle">Tambah database Accurate</div><div className="muted" style={{marginBottom:12}}>Database diambil otomatis dari akun Accurate yang memberi akses OAuth.</div><div className="dbGrid">{databases.map(db=><form key={db.id} className="dbCard" action="/api/companies" method="post"><input type="hidden" name="accurateDbId" value={db.id}/><input type="hidden" name="name" value={db.alias}/><div><b>{db.alias}</b><div className="muted">DB ID {db.id}{db.expired?' • expired':''}</div></div><button disabled={selected.has(String(db.id))} className="btn secondary">{selected.has(String(db.id))?'Added':'Add'}</button></form>)}</div></div>:null}
    <div className="card" style={{marginTop:16}}><table className="table"><thead><tr><th>Company</th><th>Accurate DB</th><th>Status</th><th>Sync journal</th></tr></thead><tbody>{companies.map(c=><tr key={c.id}><td><b>{c.name}</b></td><td>{c.accurateDbId||'-'}</td><td><span className="pill">Active</span></td><td><form action={`/api/companies/${c.id}/sync`} method="post" className="form"><input className="input" name="from" placeholder="01/01/2026"/><input className="input" name="to" placeholder="31/12/2026"/><button className="btn secondary">Sync</button></form></td></tr>)}</tbody></table>{!companies.length?<div className="empty">Belum ada company. Connect Accurate lalu pilih database di atas.</div>:null}</div>
  </>
}
