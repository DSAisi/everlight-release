import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
const dir=mkdtempSync(path.join(tmpdir(),'everlight-stack-'));
const key=()=>randomBytes(32).toString('hex');
const servers=[]; let child; let received;
async function listen(handler){const s=http.createServer(handler);servers.push(s);await new Promise(r=>s.listen(0,'127.0.0.1',r));return s;}
async function port(){const s=await listen((q,r)=>r.end());const p=s.address().port;await new Promise(r=>s.close(r));return p;}
const base=p=>`http://127.0.0.1:${p}`;
try{
 const upstream=await listen(async(q,r)=>{let b='';for await(const c of q)b+=c;received=JSON.parse(b);r.setHeader('content-type','application/json');r.end(JSON.stringify({choices:[{index:0,message:{role:'assistant',content:'fixture reply'},finish_reason:'stop'}]}));});
 const [core,ui,vector,gateway]=await Promise.all(Array.from({length:4},port));
 const e={PATH:process.env.PATH,HOME:dir,PORT:String(ui),EVERLIGHT_CORE_PORT:String(core),EVERLIGHT_VECTOR_PORT:String(vector),EVERLIGHT_GATEWAY_PORT:String(gateway),EVERLIGHT_CORE_URL:base(core),EVERLIGHT_VECTOR_URL:base(vector),EVERLIGHT_UPSTREAM_URL:base(upstream.address().port)+'/v1',EVERLIGHT_UPSTREAM_KEY:key(),EVERLIGHT_MODELS:'fixture',EVERLIGHT_BOUND_SCOPE:'personal',EVERLIGHT_UI_SCOPE:'personal',EVERLIGHT_CORE_ADAPTER:'v8',EVERLIGHT_TRIAL_VECTOR:'1',EVERLIGHT_TRIAL_GATEWAY:'1',EVERLIGHT_VECTOR_CONSUMER:'trial-local',EVERLIGHT_VECTOR_OPT_IN:'1',EVERLIGHT_VECTOR_INDEX_OPT_IN:'1',EVERLIGHT_GATEWAY_DEGRADE:'1',EVERLIGHT_GATEWAY_CAPTURE:'1',EVERLIGHT_GATEWAY_PURPOSE:'conversation',EVERLIGHT_DREAM_AUTO:'0',EVERLIGHT_AUTO_COMMIT:'0',EVERLIGHT_CLASSIFIER_OPT_IN:'0'};
 for(const k of ['CORE','UI','VECTOR'])e[`EVERLIGHT_${k}_DB`]=path.join(dir,k+'.sqlite');
 for(const k of ['CORE_TOKEN','UI_TOKEN','VECTOR_TOKEN','GATEWAY_KEY','SHARED_HOST_TOKEN','AI_DECISION_TOKEN','HUMAN_DECISION_TOKEN','GOVERNANCE_ADMIN_TOKEN'])e['EVERLIGHT_'+k]=key();
 child=spawn(process.execPath,['scripts/start.mjs'],{cwd:path.resolve(import.meta.dirname,'..'),env:e,stdio:'inherit'});
 const get=(url,k)=>fetch(url,{headers:{authorization:'Bearer '+k},signal:AbortSignal.timeout(2000)});
 async function wait(fn){for(let i=0;i<100;i++){if(child.exitCode!==null)throw Error('stack exited');try{if(await fn())return;}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('readiness timeout');}
 await wait(async()=> (await get(base(core)+'/api/v8/contract',e.EVERLIGHT_CORE_TOKEN)).ok&&(await get(base(ui)+'/',e.EVERLIGHT_UI_TOKEN)).ok&&(await get(base(gateway)+'/v1/models',e.EVERLIGHT_GATEWAY_KEY)).ok);
 const gh=await get(base(ui)+'/api/v8/ui/gateway-health',e.EVERLIGHT_UI_TOKEN);assert.equal(gh.status,200);const g=await gh.json();assert.equal(g.state,'ready');assert.equal(g.upstream_verified,false);assert.equal((await fetch(base(ui)+'/api/v8/ui/gateway-health')).status,401);console.log('PASS J1 authenticated gateway status through dashboard, upstream remains unverified');
 const post=(url,k,b)=>fetch(url,{method:'POST',headers:{authorization:'Bearer '+k,'content-type':'application/json'},body:JSON.stringify(b),signal:AbortSignal.timeout(15000)});
 await wait(async()=> (await post(base(vector)+'/search',e.EVERLIGHT_VECTOR_TOKEN,{scope:'personal',q:'fixture',k:5})).ok);
 const r=await post(base(gateway)+'/v1/chat/completions',e.EVERLIGHT_GATEWAY_KEY,{model:'fixture',messages:[{role:'user',content:'我喜欢蓝色'}]});assert.equal(r.status,200);assert.equal(r.headers.get('x-everlight-recall-state'),'verified');assert.equal((await r.json()).choices[0].message.content,'fixture reply');assert.equal(received.messages[0].role,'system');assert.equal(received.messages.at(-1).content,'我喜欢蓝色');console.log('PASS unified stack, authenticated vector search, gateway upstream request and reply');
 await wait(async()=>{const r=await get(base(core)+'/api/v8/write/inbox?scope=personal',e.EVERLIGHT_CORE_TOKEN);const {items}=await r.json();return items.some(x=>x.event_id.startsWith('gateway:')&&x.state==='proposed')&&items.some(x=>x.event_id.startsWith('gateway-reply:')&&x.state==='held');});
 const memories=await (await get(base(core)+'/api/v8/memories?scope=personal',e.EVERLIGHT_CORE_TOKEN)).json();assert.equal(memories.rows.length,0);
 console.log('PASS J3 real gateway-to-core capture: user candidate proposed, generated reply held, no canonical mutation');
}finally{if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(r=>child.once('exit',r));}for(const s of servers)if(s.listening)await new Promise(r=>s.close(r));rmSync(dir,{recursive:true,force:true});}
