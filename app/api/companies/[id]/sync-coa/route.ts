import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { appUrl } from '@/lib/app-url'
import { openDatabase } from '@/lib/accurate/oauth'
import { listAllGlAccounts, mapAccountType } from '@/lib/accurate/accounts'

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser()
  if(!user)return NextResponse.redirect(appUrl('/login',req),303)
  const{id}=await params
  const c=await prisma.company.findFirst({where:{id,userId:user.id}})
  if(!c?.accurateDbId)return NextResponse.redirect(appUrl('/companies?coaError=database_not_found',req),303)
  try{
    const opened=await openDatabase(user.id,c.accurateDbId)
    await prisma.company.update({where:{id},data:{accurateHost:opened.host,sessionId:opened.sessionId}})
    const rows=await listAllGlAccounts({userId:user.id,host:opened.host,sessionId:opened.sessionId,pageSize:100})
    for(const a of rows){
      const no=String(a.no||a.accountNo||a.id)
      await prisma.account.upsert({
        where:{companyId_accountNo:{companyId:id,accountNo:no}},
        update:{accurateId:a.id!=null?String(a.id):null,name:String(a.name||no),type:mapAccountType(a.accountType||a.type),parentNo:a.parentNo?String(a.parentNo):null,active:true},
        create:{companyId:id,accurateId:a.id!=null?String(a.id):null,accountNo:no,name:String(a.name||no),type:mapAccountType(a.accountType||a.type),parentNo:a.parentNo?String(a.parentNo):null,active:true}
      })
    }
    return NextResponse.redirect(appUrl(`/companies?coa=${rows.length}`,req),303)
  }catch(e:any){
    return NextResponse.redirect(appUrl(`/companies?coaError=${encodeURIComponent(e?.message||'COA sync failed')}`,req),303)
  }
}
