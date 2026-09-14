import { NextResponse } from 'next/server'
import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib'
import fs from 'node:fs/promises'
import path from 'node:path'
import { getCurrentUser } from '@/lib/auth'
import { consolidatedReport, type ReportRow } from '@/lib/consolidation/report'

export const runtime='nodejs'
function parseDate(v:string|null,fallback:Date){const d=v?new Date(v):fallback;return Number.isNaN(d.getTime())?fallback:d}
const dateFmt=(d:Date)=>new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'long',year:'numeric'}).format(d)
const fmt=(n:number)=>{if(Math.abs(n)<0.000001)return '-';const s=new Intl.NumberFormat('id-ID',{maximumFractionDigits:0}).format(Math.abs(n));return n<0?`(${s})`:s}
const C={charcoal:rgb(.145,.165,.192),pink:rgb(.937,.278,.435),pinkLight:rgb(1,.945,.957),gray:rgb(.39,.45,.53),light:rgb(.972,.98,.988),white:rgb(1,1,1),green:rgb(.12,.55,.32)}
function fitText(text:string,max:number,font:any,size:number){if(font.widthOfTextAtSize(text,size)<=max)return text;let s=text;while(s.length>3&&font.widthOfTextAtSize(s+'...',size)>max)s=s.slice(0,-1);return s+'...'}

export async function GET(req:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const url=new URL(req.url),now=new Date(),from=parseDate(url.searchParams.get('from'),new Date(now.getFullYear(),0,1)),to=parseDate(url.searchParams.get('to'),now)
  const report=await consolidatedReport(user.id,from,to)
  const pdf=await PDFDocument.create();const regular=await pdf.embedFont(StandardFonts.Helvetica);const bold=await pdf.embedFont(StandardFonts.HelveticaBold)
  let logo:any=null;try{logo=await pdf.embedPng(await fs.readFile(path.join(process.cwd(),'public','konsaol-logo.png')))}catch{}
  const [a4w,a4h]=PageSizes.A4;const size:[number,number]=[a4h,a4w],margin=28
  const colCount=report.companies.length+2;const accountW=Math.max(155,220-Math.max(0,colCount-6)*8);const numW=(size[0]-margin*2-accountW)/colCount;const fontSize=colCount>8?5.2:colCount>6?5.8:6.5
  let page:any,y=0,pageNo=0
  const newPage=(title:string,subtitle:string)=>{
    page=pdf.addPage(size);pageNo++;const {width,height}=page.getSize();y=height-margin
    let titleX=margin;if(logo){const raw=logo.scale(1);const scale=Math.min(140/raw.width,38/raw.height);const dims=logo.scale(scale);page.drawImage(logo,{x:margin,y:y-dims.height+3,width:dims.width,height:dims.height});titleX=margin+dims.width+14}
    page.drawText(title,{x:titleX,y:y-8,size:15,font:bold,color:C.charcoal});page.drawText(subtitle,{x:titleX,y:y-23,size:7.5,font:regular,color:C.gray});
    page.drawText(`Halaman ${pageNo}`,{x:width-margin-48,y:y-12,size:6.5,font:regular,color:C.gray});y-=50
  }
  const header=()=>{let x=margin;page.drawRectangle({x,y:y-18,width:size[0]-margin*2,height:18,color:C.charcoal});page.drawText('Keterangan',{x:x+4,y:y-12,size:fontSize,font:bold,color:C.white});x+=accountW;for(const c of report.companies){const t=fitText(c.name,numW-5,bold,fontSize);page.drawText(t,{x:x+numW-4-bold.widthOfTextAtSize(t,fontSize),y:y-12,size:fontSize,font:bold,color:C.white});x+=numW}for(const t0 of ['Eliminasi','Konsolidasi']){const t=fitText(t0,numW-4,bold,fontSize);page.drawText(t,{x:x+numW-4-bold.widthOfTextAtSize(t,fontSize),y:y-12,size:fontSize,font:bold,color:C.white});x+=numW}y-=18}
  const drawRows=(title:string,subtitle:string,rows:ReportRow[])=>{
    newPage(title,subtitle);header()
    for(const r of rows){const h=r.kind==='section'?16:14;if(y-h<margin+18){newPage(title+' (lanjutan)',subtitle);header()}
      if(r.kind==='section'){page.drawRectangle({x:margin,y:y-h,width:size[0]-margin*2,height:h,color:C.charcoal});page.drawText(r.label,{x:margin+4,y:y-11,size:7,font:bold,color:C.white});y-=h;continue}
      const fill=r.kind==='total'?C.pinkLight:r.kind==='subtotal'||r.kind==='check'?C.light:C.white;page.drawRectangle({x:margin,y:y-h,width:size[0]-margin*2,height:h,color:fill});
      let x=margin;const label=r.accountNo?`${r.accountNo}  ${r.label}`:r.label;page.drawText(fitText(label,accountW-7,r.kind==='account'?regular:bold,fontSize),{x:x+4,y:y-10,size:fontSize,font:r.kind==='account'?regular:bold,color:C.charcoal});x+=accountW
      for(const c of report.companies){const t=fmt(r.values[c.id]||0);page.drawText(t,{x:x+numW-4-(r.kind==='account'?regular:bold).widthOfTextAtSize(t,fontSize),y:y-10,size:fontSize,font:r.kind==='account'?regular:bold,color:C.charcoal});x+=numW}
      for(const n of [r.elimination,r.consolidated]){const t=fmt(n),f=r.kind==='account'?regular:bold;page.drawText(t,{x:x+numW-4-f.widthOfTextAtSize(t,fontSize),y:y-10,size:fontSize,font:f,color:n<0?C.pink:C.charcoal});x+=numW}
      page.drawLine({start:{x:margin,y:y-h},end:{x:size[0]-margin,y:y-h},thickness:.25,color:rgb(.88,.9,.92)});y-=h
    }
  }
  drawRows('Laporan Laba Rugi Konsolidasi',`Periode ${dateFmt(from)} s.d. ${dateFmt(to)}`,report.pnl)
  drawRows('Laporan Posisi Keuangan (Neraca) Konsolidasi',`Saldo kumulatif sampai ${dateFmt(to)}`,report.balanceSheet)
  const bytes=await pdf.save()
  return new Response(bytes,{headers:{'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="KONSAOL_Laporan_${from.toISOString().slice(0,10)}_${to.toISOString().slice(0,10)}.pdf"`,'Cache-Control':'no-store'}})
}
