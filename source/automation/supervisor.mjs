import {spawn} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {setTimeout as sleep} from 'node:timers/promises';
export function workerPlan(env){
 const scope=env.EVERLIGHT_BOUND_SCOPE;
 if(!scope||!env.EVERLIGHT_CORE_TOKEN||env.EVERLIGHT_CORE_TOKEN.length<24||!env.EVERLIGHT_SHARED_HOST_TOKEN||env.EVERLIGHT_SHARED_HOST_TOKEN.length<24||env.EVERLIGHT_CORE_TOKEN===env.EVERLIGHT_SHARED_HOST_TOKEN)throw Error('explicit scope and distinct credentials required');
 const plan=['write-worker.mjs','review-reminders.mjs'];
 if(env.EVERLIGHT_TASK_REPORTING_OPT_IN==='1'||env.EVERLIGHT_W1_QUALITY_NUDGE==='1'||env.EVERLIGHT_H6_CONTINUITY==='1'){if(!env.EVERLIGHT_CORE_DB)throw Error('task/quality scheduler database required');plan.push('task-scheduler.mjs');}
 if(env.EVERLIGHT_AUTO_COMMIT==='1')plan.push('commit-recovery.mjs');
 if(env.EVERLIGHT_CLASSIFIER_OPT_IN==='1'){for(const k of ['URL','KEY','MODEL'])if(!env['EVERLIGHT_CLASSIFIER_'+k])throw Error('classifier configuration incomplete');plan.push('classification-worker.mjs');}
 if(env.EVERLIGHT_VECTOR_INDEX_OPT_IN==='1')plan.push('vector-sync.mjs');
 return plan;
}
export async function supervise(env,{signal,spawnImpl=spawn,onState=()=>{}}={}){
 const plan=workerPlan(env);
 await Promise.all(plan.map(async name=>{let delay=1000;while(!signal?.aborted){
  const child=spawnImpl(process.execPath,[fileURLToPath(new URL(name,import.meta.url))],{env:{...env,EVERLIGHT_SCOPE:env.EVERLIGHT_BOUND_SCOPE},stdio:['ignore','inherit','inherit']});
  const start=Date.now();let timer;const stop=()=>{child.kill('SIGTERM');timer=setTimeout(()=>child.kill('SIGKILL'),10000);timer.unref();};
  const done=new Promise(resolve=>{child.once('error',()=>resolve('error'));child.once('exit',code=>resolve(code));});
  signal?.addEventListener('abort',stop,{once:true});if(signal?.aborted)stop();onState({worker:name,state:'started'});
  const code=await done;clearTimeout(timer);signal?.removeEventListener('abort',stop);onState({worker:name,state:'exited',code});if(signal?.aborted)break;
  if(Date.now()-start>60000)delay=1000;try{await sleep(delay,undefined,{signal});}catch{break;}delay=Math.min(60000,delay*2);
 }}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const c=new AbortController();for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>c.abort());await supervise(process.env,{signal:c.signal,onState:r=>console.log(JSON.stringify(r))});}
