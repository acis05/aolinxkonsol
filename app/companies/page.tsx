import { prisma } from '@/lib/db'
import { getOAuthStatus, listDatabases } from '@/lib/accurate/oauth'
import { Link2, Database, RefreshCcw, Zap, CalendarRange, History } from 'lucide-react'
import { requireUser, subscriptionInfo } from '@/lib/auth'
import SyncJobProgress from '@/components/SyncJobProgress'

export const dynamic='force-dynamic'

function fmtDate(v:Date|null){return v?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short'}).format(v):'-'}

export default async function Companies({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const user=await requireUser();const q=await searchParams;const sub=subscriptionInfo(user)
  const [companies,oauth,activeJobs]=await Promise.all([
    prisma.company.findMany({where:{userId:user.id},include:{_count:{select:{accounts:true,journals:true}}},orderBy:{createdAt:'desc'}}),
    getOAuthStatus(user.id),
    prisma.syncJob.findMany({where:{userId:user.id,status:{in:['QUEUED','RUNNING','FAILED']}},include:{company:{select:{name:true}}},orderBy:{createdAt:'desc'},take:6})
  ])
  let databases:Awaited<ReturnType<typeof listDatabases>>=[];let apiError=''
  if(oauth.connected){try{databases=await listDatabases(user.id)}catch(e:any){apiError=e.message}}
  const selected=new Set(companies.map(c=>c.accurateDbId))
  const activeIds=new Set(activeJobs.map(j=>j.id))
  let directJob:any=null
  if(q.syncJob&&!activeIds.has(q.syncJob))directJob=await prisma.syncJob.findFirst({where:{id:q.syncJob,userId:user.id},include:{company:{select:{name:true}}}})
  const jobs=directJob?[directJob,...activeJobs]:activeJobs
  return <>
    <div className="top"><div><div className="eyebrow">Master Data</div><h1>Perusahaan & Database</h1><div className="muted">Pilih database Accurate Online. KONSAOL akan menarik Chart of Accounts setiap database saat ditambahkan.</div></div><div className="slotBadge"><b>{companies.filter(c=>c.active).length}/{sub.maxCompanies}</b><span>slot database</span></div></div>
    {q.oauth==='connected'?<div className="successAlert">Accurate Online berhasil terhubung. {q.dbCount?`${q.dbCount} database tersedia.`:'Daftar database siap dimuat.'}</div>:null}
    {q.oauthError?<div className="alert"><b>Koneksi Accurate gagal:</b> {decodeURIComponent(q.oauthError)}<br/><span className="muted">Periksa ACCURATE_REDIRECT_URI, scope OAuth, Client ID/Secret, lalu klik Hubungkan Ulang.</span></div>:null}
    {q.companyError?<div className="alert">{q.companyError.startsWith('limit_')?`Batas paket tercapai. Paket Anda maksimal ${sub.maxCompanies} database.`:q.companyError==='subscription_expired'?'Trial/langganan sudah berakhir. Hubungi admin untuk aktivasi.':'Gagal menambahkan database.'}</div>:null}
    {q.coa?<div className="successAlert">Database ditambahkan dan {q.coa} akun COA berhasil disinkronkan.</div>:null}
    {q.syncError?<div className="alert"><b>Sync Jurnal bermasalah:</b> {q.syncError}</div>:null}
    {q.coaError?<div className="alert">Database ditambahkan, tetapi sinkronisasi COA gagal: {q.coaError}. Pastikan scope OAuth memiliki <b>glaccount_view</b>, lalu Hubungkan Ulang Accurate.</div>:null}

    {jobs.length?<div className="syncJobsStack">{jobs.map((j:any)=><SyncJobProgress key={j.id} jobId={j.id} initial={{companyName:j.company?.name,mode:j.mode,status:j.status,currentPage:j.currentPage,pageCount:j.pageCount,rowCount:j.rowCount,processedJournals:j.processedJournals,processedLines:j.processedLines,skippedUnchanged:j.skippedUnchanged,detailCalls:j.detailCalls,failedCount:j.failedCount,errorMessage:j.errorMessage}}/>)}</div>:null}

    <div className="card oauthCard"><div><div className="sectionTitle"><Link2 size={16} style={{verticalAlign:'-3px',marginRight:7}}/>Koneksi Accurate Online</div>{oauth.connected?<div className="muted">Terhubung{oauth.userName?` sebagai ${oauth.userName}`:''}. Scope: {oauth.scope||'-'}</div>:<div className="muted">Belum terhubung. OAuth membutuhkan scope jurnal dan Chart of Accounts.</div>}</div><div className="form">{oauth.connected?<><a className="btn secondary" href="/api/accurate/oauth/start"><RefreshCcw size={15}/> Hubungkan Ulang</a><form action="/api/accurate/oauth/disconnect" method="post"><button className="btn danger">Putuskan</button></form></>:<a className="btn" href="/api/accurate/oauth/start">Hubungkan Accurate</a>}</div></div>
    {apiError?<div className="alert">{apiError}</div>:null}

    {oauth.connected?<div className="card" style={{marginTop:16}}><div className="sectionHeader"><div><h2>Database Accurate</h2><div className="muted">Trial: maks. 3 database. Paket tahunan: 5 database + add-on sampai 5 slot tambahan.</div></div><Database size={20} color="#ef315d"/></div><div className="dbGrid">{databases.map(db=><form key={db.id} className="dbCard" action="/api/companies" method="post"><input type="hidden" name="accurateDbId" value={db.id}/><input type="hidden" name="name" value={db.alias}/><div><b>{db.alias}</b><div className="muted">DB ID {db.id}{db.expired?' • expired':''}</div></div><button disabled={selected.has(String(db.id))||companies.filter(c=>c.active).length>=sub.maxCompanies} className="btn secondary">{selected.has(String(db.id))?'Ditambahkan':'Tambah + Sync COA'}</button></form>)}</div></div>:null}

    <div className="card" style={{marginTop:16}}><div className="sectionHeader"><div><h2>Perusahaan Aktif</h2><div className="muted">Quick Sync hanya menarik jurnal baru/berubah sejak sync terakhir. Full Resync hanya diperlukan untuk initial history atau perbaikan data.</div></div><a href="/accounts" className="btn secondary">Lihat Semua COA</a></div>
      <div className="tableWrap"><table className="table"><thead><tr><th>Perusahaan</th><th>COA / Jurnal</th><th>Quick Sync terakhir</th><th>Sinkronisasi Journal Voucher</th></tr></thead><tbody>{companies.map(c=><tr key={c.id}><td><b>{c.name}</b><div className="muted">DB {c.accurateDbId}</div></td><td>{c._count.accounts.toLocaleString('id-ID')} akun<br/><b>{c._count.journals.toLocaleString('id-ID')} jurnal</b><div style={{marginTop:7}}><form action={`/api/companies/${c.id}/sync-coa`} method="post"><button className="btn secondary" type="submit"><RefreshCcw size={13}/> Sync COA</button></form></div></td><td><b>{fmtDate(c.journalSyncWatermark)}</b><div className="muted">Full sync: {fmtDate(c.journalFullSyncedAt)}</div></td><td><div className="syncModes">
        <form action={`/api/companies/${c.id}/sync`} method="post" className="syncQuickRow"><input type="hidden" name="mode" value="QUICK"/><button className="btn" type="submit"><Zap size={14}/> Quick Sync</button><span className="syncHint">Incremental via lastUpdate. Pertama kali akan menarik seluruh histori.</span></form>
        <form action={`/api/companies/${c.id}/sync`} method="post" className="syncPeriodRow"><input type="hidden" name="mode" value="PERIOD"/><input className="input" type="date" name="from" required/><input className="input" type="date" name="to" required/><button className="btn secondary"><CalendarRange size={14}/> Sync Periode</button></form>
        <form action={`/api/companies/${c.id}/sync`} method="post" className="syncFullRow"><input type="hidden" name="mode" value="FULL"/><button className="btn secondary" type="submit"><History size={14}/> Full Resync</button></form>
      </div></td></tr>)}</tbody></table></div>
    </div>
  </>
}
