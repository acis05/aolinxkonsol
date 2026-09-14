import Image from 'next/image'
import { prisma } from '@/lib/db'
import { Building2, BookOpenText, Rows3, Waypoints, ArrowRight } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function Home(){
  const [companies,journals,lines,mappings]=await Promise.all([
    prisma.company.count(),prisma.journal.count(),prisma.journalLine.count(),prisma.accountMapping.count()
  ])
  const metrics=[
    {label:'Perusahaan',value:companies,icon:Building2},
    {label:'Jurnal Umum',value:journals,icon:BookOpenText},
    {label:'Baris Jurnal',value:lines,icon:Rows3},
    {label:'Mapping Akun',value:mappings,icon:Waypoints},
  ]
  return <>
    <div className="top"><div><div className="eyebrow">KONSAOL Dashboard</div><h1>Konsolidasi keuangan, lebih sederhana.</h1><div className="muted">Kelola beberapa database Accurate Online dan susun laporan konsolidasi dalam satu tempat.</div></div><a className="btn" href="/companies">Kelola Perusahaan <ArrowRight size={16}/></a></div>
    <div className="hero">
      <div className="heroPanel"><h2>Financial Consolidation Workspace</h2><p>Tarik jurnal melalui OAuth Accurate Online, petakan akun antar perusahaan, lalu tampilkan laporan konsolidasi dengan struktur yang konsisten dan mudah ditelusuri.</p><div className="heroSteps"><span className="heroStep">1. Connect OAuth</span><span className="heroStep">2. Pilih Database</span><span className="heroStep">3. Sync Jurnal</span><span className="heroStep">4. Mapping</span><span className="heroStep">5. Konsolidasi</span></div></div>
      <div className="card accentCard"><Image className="accentLogo" src="/konsaol-icon.png" alt="KONSAOL" width={160} height={160}/><b>KONSAOL</b><span>Konsolidasi Accurate Online</span></div>
    </div>
    <div className="grid grid4">{metrics.map(({label,value,icon:Icon})=><div className="card metricCard" key={label}><div className="metricLabel"><span className="metricIcon"><Icon size={16}/></span>{label}</div><div className="metric">{value.toLocaleString('id-ID')}</div></div>)}</div>
  </>
}
