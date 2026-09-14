import type { Metadata } from 'next'
import './globals.css'
import AppShell from '@/components/AppShell'
export const metadata:Metadata={title:{default:'KONSAOL',template:'%s | KONSAOL'},description:'KONSAOL — Konsolidasi Accurate Online untuk laporan keuangan multi-company.',icons:{icon:'/icon.png'}}
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="id"><body><AppShell>{children}</AppShell></body></html>}
