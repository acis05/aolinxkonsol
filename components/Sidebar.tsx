'use client'

import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { Building2, LayoutDashboard, Map, BarChart3, CircleHelp } from 'lucide-react'

const items = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/companies', label: 'Perusahaan', icon: Building2 },
  { href: '/mappings', label: 'Mapping Akun', icon: Map },
  { href: '/reports', label: 'Laporan Konsolidasi', icon: BarChart3 },
]

export default function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="side">
      <a href="/" className="brandLogo" aria-label="KONSAOL">
        <Image src="/konsaol-logo.png" alt="KONSAOL - Konsolidasi Accurate Online" width={360} height={120} priority />
      </a>
      <div className="sideDivider" />
      <nav className="nav" aria-label="Navigasi utama">
        {items.map(({ href, label, icon: Icon }) => {
          const active = href === '/' ? pathname === '/' : pathname.startsWith(href)
          return <a key={href} href={href} className={active ? 'active' : ''}><Icon size={18} strokeWidth={2}/><span>{label}</span></a>
        })}
      </nav>
      <div className="sideBottom">
        <div className="supportCard">
          <div className="supportIcon"><CircleHelp size={18}/></div>
          <div><b>KONSAOL</b><span>Financial Consolidation</span></div>
        </div>
        <div className="powered">Terintegrasi dengan Accurate Online</div>
      </div>
    </aside>
  )
}
