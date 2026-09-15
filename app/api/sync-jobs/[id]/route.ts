import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { prisma } from '@/lib/db'
import { ensureJournalSyncJob, launchJournalSyncJob } from '@/lib/sync/journal-sync-job'

export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
  const{id}=await params
  await ensureJournalSyncJob(id)
  const job=await prisma.syncJob.findFirst({where:{id,userId:user.id},include:{company:{select:{name:true}}}})
  if(!job)return NextResponse.json({error:'not_found'},{status:404})
  const done=job.status==='COMPLETED'||job.status==='CANCELLED'
  const percent=job.rowCount>0?Math.min(100,Math.round(job.processedJournals/job.rowCount*100)):job.pageCount>0?Math.min(100,Math.round((Math.max(1,job.currentPage)-1)/job.pageCount*100)):0
  return NextResponse.json({id:job.id,companyName:job.company.name,mode:job.mode,status:job.status,currentPage:job.currentPage,pageCount:job.pageCount,rowCount:job.rowCount,processedJournals:job.processedJournals,processedLines:job.processedLines,skippedUnchanged:job.skippedUnchanged,detailCalls:job.detailCalls,failedCount:job.failedCount,errorMessage:job.errorMessage,percent,done,createdAt:job.createdAt,startedAt:job.startedAt,finishedAt:job.finishedAt})
}

export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'unauthorized'},{status:401})
  const{id}=await params,body=await req.json().catch(()=>({}))
  const job=await prisma.syncJob.findFirst({where:{id,userId:user.id}});if(!job)return NextResponse.json({error:'not_found'},{status:404})
  if(body?.action==='cancel'){await prisma.syncJob.update({where:{id},data:{status:'CANCELLED',finishedAt:new Date()}});return NextResponse.json({ok:true})}
  if(body?.action==='resume'){await prisma.syncJob.update({where:{id},data:{status:'QUEUED',errorMessage:null}});launchJournalSyncJob(id);return NextResponse.json({ok:true})}
  return NextResponse.json({error:'unknown_action'},{status:400})
}
