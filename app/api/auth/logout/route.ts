import { NextResponse } from 'next/server'
import { appUrl } from '@/lib/app-url'
export async function POST(req:Request){const res=NextResponse.redirect(appUrl('/login',req),303);res.cookies.delete('konsaol_session');return res}
