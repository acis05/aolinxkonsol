import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { getCurrentUser } from '@/lib/auth'
import { consolidatedReport, type ReportRow } from '@/lib/consolidation/report'

export const runtime='nodejs'

function parseDate(v:string|null,fallback:Date){const d=v?new Date(v):fallback;return Number.isNaN(d.getTime())?fallback:d}
const dateFmt=(d:Date)=>new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'long',year:'numeric'}).format(d)
const moneyFmt='#,##0;[Red](#,##0);-'

function addReportSheet(wb:ExcelJS.Workbook,name:string,title:string,subtitle:string,rows:ReportRow[],companies:Array<{id:string;name:string}>){
  const ws=wb.addWorksheet(name,{views:[{state:'frozen',ySplit:5,xSplit:1}]})
  const totalCols=companies.length+3
  ws.mergeCells(1,1,1,totalCols);const t=ws.getCell(1,1);t.value='KONSAOL - '+title;t.font={bold:true,size:18,color:{argb:'FF252A31'}}
  ws.mergeCells(2,1,2,totalCols);const s=ws.getCell(2,1);s.value=subtitle;s.font={size:10,color:{argb:'FF64748B'}}
  ws.addRow([])
  const headers=['Keterangan',...companies.map(c=>c.name),'Eliminasi','Konsolidasi']
  const hr=ws.addRow(headers);hr.height=30
  hr.eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF252A31'}};c.alignment={vertical:'middle',horizontal:Number(c.col)===1?'left':'right',wrapText:true}})
  for(const r of rows){
    if(r.kind==='section'){
      const row=ws.addRow([r.label]);ws.mergeCells(row.number,1,row.number,totalCols)
      row.height=23;row.getCell(1).font={bold:true,color:{argb:'FFFFFFFF'},size:10};row.getCell(1).fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF3B4047'}}
      continue
    }
    const vals=[r.accountNo?`${r.accountNo}  ${r.label}`:r.label,...companies.map(c=>r.values[c.id]||0),r.elimination,r.consolidated]
    const row=ws.addRow(vals)
    row.getCell(1).alignment={vertical:'middle',horizontal:'left',wrapText:true}
    for(let i=2;i<=totalCols;i++){row.getCell(i).numFmt=moneyFmt;row.getCell(i).alignment={horizontal:'right'}}
    if(r.kind==='subtotal')row.eachCell(c=>{c.font={bold:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF8FAFC'}}})
    if(r.kind==='total')row.eachCell(c=>{c.font={bold:true,color:{argb:'FF252A31'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFFFF1F4'}};c.border={top:{style:'medium',color:{argb:'FFEF476F'}}}})
    if(r.kind==='check')row.eachCell(c=>{c.font={bold:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF1F5F9'}};c.border={top:{style:'double',color:{argb:'FF64748B'}}}})
    row.getCell(totalCols).font={...(row.getCell(totalCols).font||{}),bold:true}
  }
  ws.getColumn(1).width=38
  for(let i=2;i<=totalCols;i++)ws.getColumn(i).width=Math.max(16,Math.min(22,(headers[i-1]?.length||12)+3))
  ws.autoFilter={from:{row:4,column:1},to:{row:4,column:totalCols}}
  ws.eachRow((row,rowNo)=>{if(rowNo>4)row.eachCell(cell=>{cell.border={...(cell.border||{}),bottom:{style:'hair',color:{argb:'FFE2E8F0'}}}})})
  return ws
}

export async function GET(req:Request){
  const user=await getCurrentUser();if(!user)return NextResponse.json({error:'Unauthorized'},{status:401})
  const url=new URL(req.url),now=new Date(),from=parseDate(url.searchParams.get('from'),new Date(now.getFullYear(),0,1)),to=parseDate(url.searchParams.get('to'),now)
  const r=await consolidatedReport(user.id,from,to)
  const wb=new ExcelJS.Workbook();wb.creator='KONSAOL';wb.created=new Date();wb.modified=new Date()
  addReportSheet(wb,'Laba Rugi','Laporan Laba Rugi Konsolidasi',`Periode ${dateFmt(from)} s.d. ${dateFmt(to)}`,r.pnl,r.companies)
  addReportSheet(wb,'Neraca','Laporan Posisi Keuangan (Neraca) Konsolidasi',`Saldo kumulatif sampai ${dateFmt(to)}`,r.balanceSheet,r.companies)
  const ws=wb.addWorksheet('Eliminasi')
  ws.addRow(['KONSAOL - Jurnal Eliminasi']);ws.mergeCells(1,1,1,9);ws.getCell('A1').font={bold:true,size:18}
  ws.addRow(['Pasangan Akun','Status','Saldo A','Saldo B','Debit A','Kredit A','Debit B','Kredit B','Nilai Eliminasi']);ws.getRow(2).eachCell(c=>{c.font={bold:true,color:{argb:'FFFFFFFF'}};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FF252A31'}}})
  for(const e of r.eliminationRows){const row=ws.addRow([e.label,e.status,e.source,e.target,e.sourceDebit,e.sourceCredit,e.targetDebit,e.targetCredit,e.amount]);for(let i=3;i<=9;i++)row.getCell(i).numFmt=moneyFmt}
  ws.getColumn(1).width=70;for(let i=2;i<=9;i++)ws.getColumn(i).width=20
  const buffer=await wb.xlsx.writeBuffer()
  return new Response(buffer as ArrayBuffer,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="KONSAOL_Laporan_${from.toISOString().slice(0,10)}_${to.toISOString().slice(0,10)}.xlsx"`,'Cache-Control':'no-store'}})
}
