/** Host-neutral recovery worker. No approvals, no commits, no fabricated events. */
import {setTimeout as sleep} from 'node:timers/promises';
const validScope=s=>typeof s==='string'&&/^[a-zA-Z0-9:_-]{1,100}$/.test(s);
export async function drainOnce({baseUrl,token,hostToken,scope='personal',fetchImpl=fetch,limit=25}){
 if(!validScope(scope))throw new Error('invalid scope');
 if(!/^https?:\/\//.test(baseUrl))throw new Error('invalid URL');
 if(!token||!hostToken)throw new Error('both host and core credentials required');
 const res=await fetchImpl(new URL('/api/v8/write/drain',baseUrl),{
  method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`,'x-everlight-host-token':hostToken},
  body:JSON.stringify({scope,limit}),signal:AbortSignal.timeout(15000)});
 if(!res.ok)throw new Error(`write drain HTTP ${res.status}`);
 const result=await res.json();
 if(!Array.isArray(result.results)||result.auto_committed!==false)throw new Error('invalid drain response');
 return result;
}
export async function runWorker({baseUrl,token,hostToken,scope='personal',intervalMs=30000,fetchImpl=fetch,signal,onCycle=()=>{}}){
 if(!Number.isInteger(intervalMs)||intervalMs<5000)throw new Error('interval must be >=5000ms');
 while(!signal?.aborted){
  try{onCycle({ok:true,result:await drainOnce({baseUrl,token,hostToken,scope,fetchImpl})})}
  catch(error){onCycle({ok:false,error:String(error.message||error)})}
  try{await sleep(intervalMs,undefined,{signal})}catch{break}
 }
}
if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href){
 const {EVERLIGHT_CORE_URL:baseUrl='http://127.0.0.1:8790',EVERLIGHT_CORE_TOKEN:token,EVERLIGHT_SHARED_HOST_TOKEN:hostToken,EVERLIGHT_SCOPE:scope='personal',EVERLIGHT_WORKER_INTERVAL_MS:raw='30000'}=process.env;
 const controller=new AbortController();process.on('SIGINT',()=>controller.abort());process.on('SIGTERM',()=>controller.abort());
 await runWorker({baseUrl,token,hostToken,scope,intervalMs:Number(raw),signal:controller.signal,onCycle:result=>console.log(JSON.stringify({at:new Date().toISOString(),...result}))});
}
