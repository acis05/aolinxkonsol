import { prisma } from '@/lib/db'
import { MappingType } from '@prisma/client'
import { NextResponse } from 'next/server'
import { appUrl } from '@/lib/app-url'
export async function POST(req:Request){const f=await req.formData();const companyId=String(f.get('companyId'));const accountNo=String(f.get('accountNo'));const type=String(f.get('type')) as MappingType;await prisma.accountMapping.upsert({where:{companyId_accountNo_type:{companyId,accountNo,type}},update:{consolidatedKey:String(f.get('consolidatedKey')),counterpartyId:String(f.get('counterpartyId')||'')||null},create:{companyId,accountNo,type,consolidatedKey:String(f.get('consolidatedKey')),counterpartyId:String(f.get('counterpartyId')||'')||null}});return NextResponse.redirect(appUrl('/mappings', req),303)}
