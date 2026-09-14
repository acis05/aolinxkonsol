import crypto from 'node:crypto'

function stateSecret(){
  const raw=process.env.AUTH_SECRET || process.env.APP_ENCRYPTION_KEY
  if(!raw) throw new Error('AUTH_SECRET atau APP_ENCRYPTION_KEY wajib diisi')
  return raw
}
function sig(payload:string){return crypto.createHmac('sha256',stateSecret()).update(payload).digest('base64url')}
export function createOAuthState(userId:string){
  const payload=Buffer.from(JSON.stringify({uid:userId,nonce:crypto.randomBytes(16).toString('hex'),exp:Math.floor(Date.now()/1000)+600})).toString('base64url')
  return `${payload}.${sig(payload)}`
}
export function parseOAuthState(state?:string|null){
  if(!state)return null
  const [payload,signature]=state.split('.')
  if(!payload||!signature)return null
  const expected=sig(payload)
  const a=Buffer.from(signature),b=Buffer.from(expected)
  if(a.length!==b.length||!crypto.timingSafeEqual(a,b))return null
  try{
    const value=JSON.parse(Buffer.from(payload,'base64url').toString()) as {uid?:string;exp?:number}
    if(!value.uid||!value.exp||value.exp<Math.floor(Date.now()/1000))return null
    return {uid:value.uid,exp:value.exp}
  }catch{return null}
}
