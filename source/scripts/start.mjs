import {inviteEnv} from '../contracts/invite-profile-beta08.mjs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {preflight} from './preflight.mjs';
import {waitReady} from './readiness.mjs';
const env=inviteEnv(process.env);const validated=preflight(env);
for(const warning of validated.warnings)console.warn(warning);
const children=[];let stopping=false;
function alive(c){return c.exitCode===null&&c.signalCode===null&&!c.spawnFailed;}
async function terminate(c,ms){
 if(!alive(c))return;
 await new Promise(resolve=>{let timer;const done=()=>{clearTimeout(timer);c.off('exit',done);c.off('error',done);resolve()};c.once('exit',done);c.once('error',done);timer=setTimeout(()=>{if(alive(c))c.kill('SIGKILL')},ms);c.kill('SIGTERM');if(!alive(c))done();});
}
function stop(code=0){if(stopping)return;stopping=true;process.exitCode=code;
 void (async()=>{for(const c of [...children].reverse())await terminate(c,12000);console.log(JSON.stringify({state:'stack_stopped',code}));})();
}
for(const s of ['SIGINT','SIGTERM'])process.on(s,()=>stop());
function launch(relative){const c=spawn(process.execPath,[fileURLToPath(new URL(relative,import.meta.url))],{env,stdio:'inherit'});children.push(c);c.on('error',()=>{c.spawnFailed=true;stop(1)});c.on('exit',()=>{if(!stopping)stop(1)});}
const plan=validated.services;
const probe=(url,token,body)=>async()=>{const r=await fetch(url,{headers:{authorization:'Bearer '+token,...(body?{'content-type':'application/json'}:{})},...(body?{method:'POST',body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(1000)});await r.text();return r.ok;};
try{
 for(const service of plan.filter(x=>!x.includes('supervisor'))){
  if(stopping)break;
  launch(service);
  let check;
  if(service.includes('vector/'))check=probe(`http://127.0.0.1:${env.EVERLIGHT_VECTOR_PORT||8793}/search`,env.EVERLIGHT_VECTOR_TOKEN,{scope:env.EVERLIGHT_BOUND_SCOPE,q:'startup readiness',k:1});
  if(service.includes('core/'))check=probe(`http://127.0.0.1:${env.EVERLIGHT_CORE_PORT||8790}/api/v8/contract`,env.EVERLIGHT_CORE_TOKEN);
  if(service.includes('d14/'))check=probe(`http://127.0.0.1:${env.EVERLIGHT_D14_PORT}/status`,env.EVERLIGHT_D14_TOKEN);
  if(service.includes('dashboard/'))check=probe(`http://127.0.0.1:${env.PORT||8787}/`,env.EVERLIGHT_UI_TOKEN);
  if(service.includes('gateway/'))check=probe(`http://127.0.0.1:${env.EVERLIGHT_GATEWAY_PORT||8792}/v1/models`,env.EVERLIGHT_GATEWAY_KEY);
  await waitReady(check,{stopped:()=>stopping});
  console.log(JSON.stringify({service,state:'ready'}));
 }
 if(!stopping)launch('../automation/supervisor.mjs');
}catch(e){if(!stopping){console.error(e.message);stop(1);}}
