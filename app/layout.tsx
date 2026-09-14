import type { Metadata } from 'next'
import './globals.css'
import Sidebar from '@/components/Sidebar'

export const metadata: Metadata = {
  title: { default: 'KONSAOL', template: '%s | KONSAOL' },
  description: 'KONSAOL — Konsolidasi Accurate Online untuk laporan keuangan multi-company.',
  icons: { icon: '/icon.png' },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="id"><body><div className="shell"><Sidebar/><main className="main"><div className="mainInner">{children}</div></main></div></body></html>
}
