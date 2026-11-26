import {setTimeout as sleep} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
export async function recoverPage({baseUrl,token,hostToken,scope,cursor='',fetchImpl=fetch,operation='commit'}){
 if(!scope||!token||!hostToken)throw Error('scope and credentials required');
 if(!['commit','reminders'].includes(operation))throw Error('invalid operation');
 const r=await fetchImpl(new URL(operation==='commit'?'/api/v8/commit/recover':'/api/v8/review/reminders',baseUrl),{method:'POST',redirect:'error',headers:{authorization:'Bearer '+token,'x-everlight-host-token':hostToken,'content-type':'application/json'},body:JSON.stringify({scope,cursor,limit:25}),signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw Error('recovery HTTP '+r.status);return r.json();
}
export async function runRecovery(config,{signal,intervalMs=30000,onCycle=()=>{}}={}){
 let cursor='';while(!signal?.aborted){try{const result=await recoverPage({...config,cursor});cursor=result.next_cursor||'';onCycle(result);}catch(e){onCycle({error:e.message});}try{await sleep(intervalMs,undefined,{signal});}catch{break;}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const c=new AbortController();for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>c.abort());await runRecovery({baseUrl:process.env.EVERLIGHT_CORE_URL||'http://127.0.0.1:8790',token:process.env.EVERLIGHT_CORE_TOKEN,hostToken:process.env.EVERLIGHT_SHARED_HOST_TOKEN,scope:process.env.EVERLIGHT_BOUND_SCOPE||'personal'},{signal:c.signal,onCycle:r=>console.log(JSON.stringify(r))});}
