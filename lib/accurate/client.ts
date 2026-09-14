import { getValidAccessToken } from './oauth'

async function decode(res:Response){
  const text=await res.text()
  let body:any
  try{body=JSON.parse(text)}catch{body={raw:text}}
  return {text,body}
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
  // Accurate dapat memindahkan database ke host lain dengan HTTP 308. Fetch
  // otomatis dapat membuang Authorization pada cross-origin redirect, jadi kita
  // tangani redirect tersebut sendiri dan kirim ulang header secara eksplisit.
  for(let attempt=0;attempt<3;attempt++){
    const res=await fetch(url,{headers,redirect:'manual',cache:'no-store'})
    if([301,302,307,308].includes(res.status)){
      const location=res.headers.get('location')
      if(!location) throw new Error(`Accurate ${res.status}: redirect tanpa Location`)
      url=new URL(location,url)
      continue
    }
    const {text,body}=await decode(res)
    if(!res.ok||body?.s===false){
      const detail=Array.isArray(body?.d)?body.d.join(', '):body?.message||body?.error||text.slice(0,300)
      throw new Error(`Accurate ${res.status}: ${detail}`)
    }
    return body as T
  }
  throw new Error('Terlalu banyak redirect host Accurate')
}
