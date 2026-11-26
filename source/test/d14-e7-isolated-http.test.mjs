import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {EverlightCore} from '../core/engine.mjs';
import {EverlightHostAdapter} from '../adapters/host-neutral.mjs';
import {createGateway} from '../gateway/server.mjs';
import {approveBoth} from './joint-fixture.mjs';
const scope='e7-fixture',token='e7-core-'+ 'a'.repeat(32),hostToken='e7-host-'+ 'b'.repeat(32),key='e7-gateway-'+ 'c'.repeat(32);
async function listen(s){await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',resolve)});return `http://127.0.0.1:${s.address().port}`;}
const close=s=>new Promise(r=>{s.closeAllConnections();s.close(r)});
test('E7 real local core HTTP + SQLite + gateway + upstream HTTP: injection, actual failure interception, and degradation', {timeout:20000},async t=>{
 const dir=mkdtempSync(path.join(tmpdir(),'everlight-e7-'));const db=path.join(dir,'core.sqlite');const seed=new EverlightCore(db);
 try{seed.source({scope,actor:'human',kind:'conversation',source_ref:'e7-seed',source_id:'e7-seed',body:{text:'orchidfixture prefers blue'}});const p=seed.propose({scope,slot:'S05',kind:'fact',payload:{statement:'orchidfixture prefers blue',subject:'orchidfixture',attribution:'direct'},source_refs:['e7-seed'],reason:'synthetic evidence',idempotency_key:'e7-seed'});approveBoth(seed,p.id);seed.commit(p.id);}finally{seed.close()}
 const reservation=http.createServer();const coreUrl=await listen(reservation);const port=reservation.address().port;await close(reservation);
 const child=spawn(process.execPath,[path.resolve(import.meta.dirname,'../core/server.mjs')],{env:{...process.env,EVERLIGHT_CORE_TOKEN:token,EVERLIGHT_SHARED_HOST_TOKEN:hostToken,EVERLIGHT_BOUND_SCOPE:scope,EVERLIGHT_CORE_DB:db,EVERLIGHT_CORE_PORT:String(port)},stdio:['ignore','pipe','pipe']});let diagnostics='';child.stderr.on('data',d=>diagnostics+=d);child.stdout.resume();const exited=once(child,'exit');t.after(async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill();await exited;}rmSync(dir,{recursive:true,force:true});});
 let ready=false;for(let i=0;i<100;i++){try{const r=await fetch(coreUrl+'/api/v8/status?scope='+scope,{headers:{authorization:'Bearer '+token},signal:AbortSignal.timeout(500)});if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,50));}assert.ok(ready,diagnostics);
 const real=new EverlightHostAdapter({baseUrl:coreUrl,token,hostToken});const upstreamBodies=[];const upstream=http.createServer(async(req,res)=>{let body='';for await(const ch of req)body+=ch;upstreamBodies.push(body);res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({choices:[{index:0,message:{role:'assistant',content:'synthetic answer'},finish_reason:'stop'}]}));});const upstreamUrl=await listen(upstream);t.after(()=>close(upstream));
 let revokeOnReadback=false;let latestRun,latestReadback;const adapter={recall:async(...a)=>{latestRun=await real.recall(...a);return latestRun},snapshotReadback:async(...a)=>{if(revokeOnReadback){revokeOnReadback=false;await real.revoke(scope,'source','e7-seed','test source revoked between recall and readback');}latestReadback=await real.snapshotReadback(...a);return latestReadback;}};
 const receipts=[];const strict=createGateway({adapter,scope,key,upstream:upstreamUrl,upstreamKey:'fixture',models:['mock'],onReceipt:x=>receipts.push(x)});const strictUrl=await listen(strict);t.after(()=>close(strict));
 const send=(url,extra={})=>fetch(url+'/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({model:'mock',messages:[{role:'user',content:'orchidfixture'}],...extra})});
 let r=await send(strictUrl);assert.equal(r.status,200);await r.text();assert.equal(latestRun.checked.length,12);assert.equal(latestReadback.verified,true);assert.match(JSON.parse(upstreamBodies[0]).messages[0].content,/orchidfixture prefers blue/);assert.equal(receipts.at(-1).body_hash,createHash('sha256').update(upstreamBodies[0]).digest('hex'));assert.equal(receipts.at(-1).provider_delivery_verified,false);
 revokeOnReadback=true;r=await send(strictUrl);assert.equal(r.status,503);await r.text();assert.equal(latestReadback.verified,false);assert.equal(upstreamBodies.length,1);
 const degraded=createGateway({adapter:{...adapter,snapshotReadback:async(s,id,m)=>real.snapshotReadback(s,id,[{role:'system',content:'tampered'},...m.slice(1)])},scope,key,upstream:upstreamUrl,upstreamKey:'fixture',models:['mock'],degradeOnRecallFailure:true,onReceipt:x=>receipts.push(x)});const degradedUrl=await listen(degraded);t.after(()=>close(degraded));r=await send(degradedUrl,{tools:[{type:'function',function:{name:'act'}}],tool_choice:'auto'});assert.equal(r.status,200);assert.equal(r.headers.get('x-everlight-recall-state'),'degraded');await r.text();const wire=JSON.parse(upstreamBodies[1]);assert.match(wire.messages[0].content,/没有可信的外部记忆注入/);assert.doesNotMatch(wire.messages[0].content,/orchidfixture prefers blue/);assert.equal(wire.tools,undefined);assert.equal(wire.tool_choice,undefined);assert.equal(receipts.at(-1).recall_state,'degraded');
});
