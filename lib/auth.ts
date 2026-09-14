import crypto from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/lib/db'

export const SESSION_COOKIE = 'konsaol_session'
const DAY = 86400

function secret(){
  const raw = process.env.AUTH_SECRET || process.env.APP_ENCRYPTION_KEY
  if(!raw) throw new Error('AUTH_SECRET atau APP_ENCRYPTION_KEY wajib diisi')
  return raw
}

export function hashPassword(password:string){
  const salt=crypto.randomBytes(16).toString('hex')
  const key=crypto.scryptSync(password,salt,64).toString('hex')
  return `${salt}:${key}`
}
export function verifyPassword(password:string,stored:string){
  const [salt,key]=stored.split(':'); if(!salt||!key) return false
  const actual=crypto.scryptSync(password,salt,64)
  const expected=Buffer.from(key,'hex')
  return actual.length===expected.length && crypto.timingSafeEqual(actual,expected)
}
function sign(payload:string){return crypto.createHmac('sha256',secret()).update(payload).digest('base64url')}
export function createSessionToken(user:{id:string;role:string}){
  const payload=Buffer.from(JSON.stringify({uid:user.id,role:user.role,exp:Math.floor(Date.now()/1000)+7*DAY})).toString('base64url')
  return `${payload}.${sign(payload)}`
}
export function parseSessionToken(token?:string|null){
  if(!token) return null
  const [payload,sig]=token.split('.'); if(!payload||!sig||sign(payload)!==sig) return null
  try{const v=JSON.parse(Buffer.from(payload,'base64url').toString()); if(v.exp<Math.floor(Date.now()/1000)) return null; return v as {uid:string;role:string;exp:number}}catch{return null}
}
export async function setSession(user:{id:string;role:string}){
  const jar=await cookies(); jar.set(SESSION_COOKIE,createSessionToken(user),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:7*DAY})
}
export async function clearSession(){const jar=await cookies();jar.delete(SESSION_COOKIE)}
export async function getCurrentUser(){
  const jar=await cookies(); const s=parseSessionToken(jar.get(SESSION_COOKIE)?.value); if(!s) return null
  return prisma.user.findUnique({where:{id:s.uid}})
}
export async function requireUser(){const u=await getCurrentUser();if(!u||!u.active) redirect('/login');return u}
export async function requireAdmin(){const u=await requireUser();if(u.role!=='ADMIN') redirect('/');return u}
export function subscriptionInfo(user:{subscriptionStatus:string;trialEndsAt:Date|null;subscriptionEndsAt:Date|null;addonSlots:number}){
  const now=Date.now(); const trialValid=user.subscriptionStatus==='TRIAL' && !!user.trialEndsAt && user.trialEndsAt.getTime()>now
  const paidValid=user.subscriptionStatus==='ACTIVE' && !!user.subscriptionEndsAt && user.subscriptionEndsAt.getTime()>now
  const maxCompanies=trialValid?3:paidValid?5+Math.min(Math.max(user.addonSlots,0),5):0
  return {trialValid,paidValid,maxCompanies,expired:!trialValid&&!paidValid}
}
export async function ensureAdmin(){
  const email=process.env.ADMIN_EMAIL?.trim().toLowerCase(); const password=process.env.ADMIN_PASSWORD
  if(!email||!password) return
  const exists=await prisma.user.findUnique({where:{email}})
  if(!exists) await prisma.user.create({data:{name:'KONSAOL Admin',email,passwordHash:hashPassword(password),role:'ADMIN',subscriptionStatus:'ACTIVE',subscriptionEndsAt:new Date('2099-12-31'),addonSlots:5}})
}
