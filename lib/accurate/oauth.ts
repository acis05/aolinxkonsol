import { prisma } from '@/lib/db'
import { decryptSecret, encryptSecret } from '@/lib/crypto'

const AUTHORIZE_URL = 'https://account.accurate.id/oauth/authorize'
const TOKEN_URL = 'https://account.accurate.id/oauth/token'
const ACCOUNT_API = 'https://account.accurate.id'

type TokenResponse = {
  access_token:string
  refresh_token?:string
  token_type?:string
  expires_in:number
  scope?:string
  user?:{id?:string|number;name?:string;email?:string}
}

function credentials(){
  const clientId=process.env.ACCURATE_CLIENT_ID
  const clientSecret=process.env.ACCURATE_CLIENT_SECRET
  const redirectUri=process.env.ACCURATE_REDIRECT_URI
  if(!clientId||!clientSecret||!redirectUri) throw new Error('ACCURATE_CLIENT_ID, ACCURATE_CLIENT_SECRET, dan ACCURATE_REDIRECT_URI wajib diisi')
  return{clientId,clientSecret,redirectUri}
}

function oauthScopes(){
  return (process.env.ACCURATE_OAUTH_SCOPES||'journal_voucher_view glaccount_view')
    .replace(/[,;]+/g,' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((v,i,a)=>a.indexOf(v)===i)
    .join(' ')
}

export function buildAuthorizeUrl(state:string){
  const{clientId,redirectUri}=credentials()
  const url=new URL(AUTHORIZE_URL)
  url.searchParams.set('client_id',clientId)
  url.searchParams.set('response_type','code')
  url.searchParams.set('redirect_uri',redirectUri)
  url.searchParams.set('scope',oauthScopes())
  url.searchParams.set('state',state)
  return url.toString()
}

async function tokenRequest(body:URLSearchParams){
  const{clientId,clientSecret}=credentials()
  const basic=Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res=await fetch(TOKEN_URL,{method:'POST',headers:{Authorization:`Basic ${basic}`,'Content-Type':'application/x-www-form-urlencoded',Accept:'application/json'},body,cache:'no-store'})
  const text=await res.text()
  let json:any
  try{json=JSON.parse(text)}catch{json={raw:text}}
  if(!res.ok||!json.access_token) throw new Error(`OAuth Accurate gagal (${res.status}): ${json.error_description||json.error||text.slice(0,300)}`)
  return json as TokenResponse
}

export async function exchangeAuthorizationCode(code:string,userId:string){
  const{redirectUri}=credentials()
  const token=await tokenRequest(new URLSearchParams({code,grant_type:'authorization_code',redirect_uri:redirectUri}))
  await saveToken(token,userId)
  return token
}

async function saveToken(token:TokenResponse,userId:string){
  const existing=await prisma.accurateOAuthCredential.findUnique({where:{userId}})
  const refreshToken=token.refresh_token || (existing?decryptSecret(existing.refreshTokenEncrypted):null)
  if(!refreshToken) throw new Error('OAuth Accurate tidak mengembalikan refresh_token')
  const expiresAt=new Date(Date.now()+Number(token.expires_in||1295999)*1000)
  const data={
    accessTokenEncrypted:encryptSecret(token.access_token),
    refreshTokenEncrypted:encryptSecret(refreshToken),
    tokenType:token.token_type||'bearer',
    scope:token.scope||existing?.scope||null,
    expiresAt,
    accurateUserId:token.user?.id!=null?String(token.user.id):(existing?.accurateUserId||null),
    accurateUserName:token.user?.name||existing?.accurateUserName||null,
    accurateUserEmail:token.user?.email||existing?.accurateUserEmail||null,
  }
  await prisma.accurateOAuthCredential.upsert({where:{userId},update:data,create:{userId,...data}})
}

export async function getOAuthStatus(userId:string){
  const row=await prisma.accurateOAuthCredential.findUnique({where:{userId}})
  if(!row)return{connected:false as const}
  return{connected:true as const,expiresAt:row.expiresAt,scope:row.scope,userName:row.accurateUserName,userEmail:row.accurateUserEmail}
}

export async function getValidAccessToken(userId:string){
  const row=await prisma.accurateOAuthCredential.findUnique({where:{userId}})
  if(!row)throw new Error('Accurate belum terhubung via OAuth')
  if(row.expiresAt.getTime()-Date.now()>86400000)return decryptSecret(row.accessTokenEncrypted)
  const refresh=decryptSecret(row.refreshTokenEncrypted)
  const token=await tokenRequest(new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh}))
  if(!token.refresh_token)token.refresh_token=refresh
  await saveToken(token,userId)
  return token.access_token
}

async function parseResponse(res:Response){
  const text=await res.text()
  let body:any
  try{body=JSON.parse(text)}catch{body={raw:text}}
  return {text,body}
}

async function accountGet(userId:string,path:string,params:Record<string,string>={}){
  const token=await getValidAccessToken(userId)
  const url=new URL(path,ACCOUNT_API)
  Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,v))
  const res=await fetch(url,{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},redirect:'follow',cache:'no-store'})
  const {text,body}=await parseResponse(res)
  if(!res.ok||body?.s===false){
    const detail=Array.isArray(body?.d)?body.d.join(', '):body?.message||body?.error||text.slice(0,300)
    throw new Error(`Accurate API ${path} gagal (${res.status}): ${detail}`)
  }
  return body
}

export type AccurateDatabase={id:number;alias:string;expired?:boolean;demo?:boolean;sample?:boolean;trial?:boolean}

export async function listDatabases(userId:string):Promise<AccurateDatabase[]>{
  const body=await accountGet(userId,'/api/db-list.do')
  if(!Array.isArray(body?.d)) throw new Error('Response db-list.do tidak berisi daftar database')
  return body.d
    .filter((db:any)=>db&&db.id!=null)
    .map((db:any)=>({id:Number(db.id),alias:String(db.alias||`Database ${db.id}`),expired:Boolean(db.expired),demo:Boolean(db.demo),sample:Boolean(db.sample),trial:Boolean(db.trial)}))
}

export async function openDatabase(userId:string,dbId:string|number){
  const body=await accountGet(userId,'/api/open-db.do',{id:String(dbId)})
  if(!body?.host||!body?.session)throw new Error('Response open-db.do tidak mengandung host/session')
  return{host:String(body.host),sessionId:String(body.session)}
}
