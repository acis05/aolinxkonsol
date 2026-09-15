import { NextResponse } from 'next/server'
import { appUrl } from '@/lib/app-url'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { createJournalSyncJob, launchJournalSyncJob } from '@/lib/sync/journal-sync-job'
import type { SyncJobMode } from '@prisma/client'

function parseDate(v:FormDataEntryValue|null){if(!v)return null;const d=new Date(String(v)+'T00:00:00');return Number.isNaN(d.getTime())?null:d}

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();if(!user)return NextResponse.redirect(appUrl('/login',req),303)
  const{id}=await params
  const company=await prisma.company.findFirst({where:{id,userId:user.id}})
  if(!company)return NextResponse.redirect(appUrl('/companies?syncError=Perusahaan%20tidak%20ditemukan',req),303)
  const f=await req.formData()
  let mode=String(f.get('mode')||'QUICK').toUpperCase() as SyncJobMode
  // Kompatibilitas tombol lama.
  if(String(f.get('all')||'')==='1')mode='FULL'
  if(!['QUICK','PERIOD','FULL'].includes(mode))mode='QUICK'
  const fromDate=mode==='PERIOD'?parseDate(f.get('from')):null
  const toDate=mode==='PERIOD'?parseDate(f.get('to')):null
  if(mode==='PERIOD'&&(!fromDate||!toDate||fromDate>toDate))return NextResponse.redirect(appUrl('/companies?syncError=Periode%20sync%20tidak%20valid',req),303)
  const job=await createJournalSyncJob({userId:user.id,companyId:id,mode,fromDate,toDate})
  launchJournalSyncJob(job.id)
  return NextResponse.redirect(appUrl(`/companies?syncJob=${job.id}`,req),303)
}
