'use client'
import { useEffect,useState } from 'react'
import { RefreshCcw, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

type Job={id:string;companyName:string;mode:string;status:string;currentPage:number;pageCount:number;rowCount:number;processedJournals:number;processedLines:number;skippedUnchanged:number;detailCalls:number;failedCount:number;errorMessage?:string|null;percent:number;done:boolean}
export default function SyncJobProgress({jobId,initial}:{jobId:string;initial?:Partial<Job>}){
  const[job,setJob]=useState<Job|Partial<Job>>({id:jobId,status:'QUEUED',percent:0,...initial})
  const[busy,setBusy]=useState(false)
  useEffect(()=>{let alive=true,t:any;const poll=async()=>{try{const r=await fetch(`/api/sync-jobs/${jobId}`,{cache:'no-store'});if(r.ok){const j=await r.json();if(alive)setJob(j);if(alive&&!j.done)t=setTimeout(poll,1800)}}catch{if(alive)t=setTimeout(poll,3000)}};poll();return()=>{alive=false;clearTimeout(t)}},[jobId])
  const action=async(a:'resume'|'cancel')=>{setBusy(true);await fetch(`/api/sync-jobs/${jobId}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:a})});setBusy(false);location.reload()}
  const status=String(job.status||'QUEUED'),percent=Number(job.percent||0)
  return <div className={`syncJobCard ${status.toLowerCase()}`}>
    <div className="syncJobHead"><div><b>{job.companyName||'Sinkronisasi Journal Voucher'}</b><span>{job.mode==='QUICK'?'Quick Sync / incremental':job.mode==='PERIOD'?'Sync periode':'Full Resync'}</span></div><div className="syncJobStatus">{status==='COMPLETED'?<CheckCircle2 size={16}/>:status==='FAILED'?<AlertTriangle size={16}/>:status==='CANCELLED'?<XCircle size={16}/>:<RefreshCcw size={16} className="spin"/>}{status}</div></div>
    <div className="syncProgress"><i style={{width:`${percent}%`}}/></div>
    <div className="syncJobMeta"><span>{percent}%</span><span>Halaman {Math.min(Number(job.currentPage||1),Number(job.pageCount||1))}/{job.pageCount||1}</span><span>{Number(job.processedJournals||0).toLocaleString('id-ID')} diproses</span><span>{Number(job.skippedUnchanged||0).toLocaleString('id-ID')} dilewati</span><span>{Number(job.processedLines||0).toLocaleString('id-ID')} baris</span>{Number(job.failedCount||0)>0?<span className="syncFail">{job.failedCount} gagal</span>:null}</div>
    {job.errorMessage?<div className="syncJobError">{job.errorMessage}</div>:null}
    {status==='FAILED'?<button disabled={busy} className="btn secondary" onClick={()=>action('resume')}>Lanjutkan / Retry</button>:null}
    {status==='RUNNING'||status==='QUEUED'?<button disabled={busy} className="btn secondary" onClick={()=>action('cancel')}>Batalkan</button>:null}
  </div>
}
