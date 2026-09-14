import './globals.css'
export const metadata = { title: 'Accurate Consolidation', description: 'Multi-company consolidation for Accurate Online' }
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="id"><body><div className="shell"><aside className="side"><div className="brand">A•Consolidate</div><nav className="nav"><a href="/">Dashboard</a><a href="/companies">Companies</a><a href="/mappings">Account Mapping</a><a href="/reports">Consolidated Reports</a></nav></aside><main className="main">{children}</main></div></body></html>
}
