'use client'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'
export default function AppShell({children}:{children:React.ReactNode}){const p=usePathname();const auth=p==='/login'||p==='/register';if(auth)return <main className="authPage">{children}</main>;return <div className="shell"><Sidebar/><main className="main"><div className="mainInner">{children}</div></main></div>}
