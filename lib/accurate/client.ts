import { getValidAccessToken } from './oauth'

async function decode(res:Response){
  const text=await res.text()
  let body:any
  try{body=JSON.parse(text)}catch{body={raw:text}}
  return {text,body}
}

const sleep=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms))

// Accurate membatasi maksimal 8 request/detik per token. Jarak 160 ms memberi
// headroom (sekitar 7 request/detik) untuk request lain seperti open-db/list.
// Reservasi waktu dilakukan sinkron sebelum await sehingga aman dipakai oleh
// beberapa worker paralel dalam satu proses Node.
const nextRequestAt=new Map<string,number>()
async function throttle(userId:string){
  const now=Date.now()
  const reserved=Math.max(now,nextRequestAt.get(userId)||0)
  nextRequestAt.set(userId,reserved+140)
  const wait=reserved-now
  if(wait>0)await sleep(wait)
}

export async function accurateGet<T>(userId:string,host:string,path:string,sessionId:string|null|undefined,params:Record<string,string|number|boolean|undefined>={}){
  const accessToken=await getValidAccessToken(userId)
  const headers:Record<string,string>={Accept:'application/json',Authorization:`Bearer ${accessToken}`}
  if(sessionId)headers['X-Session-ID']=sessionId

  const build=(base:string)=>{
    const url=new URL(path,base.endsWith('/')?base:base+'/')
    Object.entries(params).forEach(([k,v])=>{if(v!==undefined)url.searchParams.set(k,String(v))})
    return url
  }

  let url=build(host)
  let redirects=0
  let rateRetries=0
  while(redirects<4){
    await throttle(userId)
    const res=await fetch(url,{headers,redirect:'manual',cache:'no-store'})

    if([301,302,307,308].includes(res.status)){
      const location=res.headers.get('location')
      if(!location) throw new Error(`Accurate ${res.status}: redirect tanpa Location`)
      url=new URL(location,url)
      redirects++
      continue
    }

    const {text,body}=await decode(res)
    if(res.status===429){
      if(rateRetries>=5){
        const detail=Array.isArray(body?.d)?body.d.join(', '):body?.message||body?.error||text.slice(0,300)
        throw new Error(`Accurate 429 setelah retry: ${detail}`)
      }
      const retryAfter=Number(res.headers.get('retry-after')||0)
      const backoff=Math.max(retryAfter*1000,1000*Math.pow(2,rateRetries))+Math.floor(Math.random()*250)
      rateRetries++
      await sleep(backoff)
      continue
    }

    if(!res.ok||body?.s===false){
      const detail=Array.isArray(body?.d)?body.d.join(', '):body?.message||body?.error||text.slice(0,300)
      throw new Error(`Accurate ${res.status}: ${detail}`)
    }
    return body as T
  }
  throw new Error('Terlalu banyak redirect host Accurate')
}
