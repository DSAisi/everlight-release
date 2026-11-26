import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'everlight-v4-test-'));
const port=19581,corePort=19582;
const uiToken='test-ui-token-for-local-only', hostToken='test-host-token-for-local-only',coreToken='test-core-token-for-local-only';
const base=`http://127.0.0.1:${port}`;const core=`http://127.0.0.1:${corePort}`;
const coreEnv={...process.env,EVERLIGHT_DB:path.join(dir,'original-core.sqlite'),EVERLIGHT_TOKEN:coreToken};
const children=[];
async function wait(url){for(let i=0;i<70;i++){try{const r=await fetch(url);if(r.status!==502)return}catch{}await new Promise(r=>setTimeout(r,120))}throw Error('server did not start '+url)}
function start(file,args,env){const child=spawn(process.execPath,[file,...args],{cwd:ROOT,env:{...process.env,...env},stdio:'pipe'});children.push(child);let errors='';child.stderr.on('data',x=>errors+=x);child.stdout.on('data',()=>{});child.on('exit',code=>{if(code&&code!==null)console.error('server exit',file,code,errors.slice(0,1000))});return child}
let cookie='';
async function request(route,{method='GET',data,host=false,login=false}={}){
 const h={};if(data!==undefined)h['content-type']='application/json';if(cookie&&!login&&!host)h.cookie=cookie;if(host)h.authorization=`Bearer ${hostToken}`;
 const r=await fetch(base+route,{method,headers:h,body:data===undefined?undefined:JSON.stringify(data)});const content=r.headers.get('content-type')||'';const body=content.includes('application/json')?await r.json():await r.text();return {status:r.status,body,headers:r.headers};
}
async function must(route,opts,code=200){const r=await request(route,opts);assert.equal(r.status,code,`${route}: ${JSON.stringify(r.body)}`);return r.body}
const tempSuccess=()=>fs.rmSync(dir,{recursive:true,force:true});
test('完整接口 + 原 12 库核心独立进程连通',async t=>{
 t.after(()=>{for(const c of children)if(c.exitCode===null)c.kill('SIGTERM');tempSuccess()});
 // An explicitly isolated example identity, never real D's identity or memory.
 execFileSync(process.execPath,[path.join(ROOT,'core/everlight.mjs'),'init','--name','隔离测试长明','--calls','用户','--voice','测试','--nickname','测试者'],{cwd:ROOT,env:coreEnv,stdio:'pipe'});
 start(path.join(ROOT,'core/everlight.mjs'),['serve','--port',String(corePort)],coreEnv);
 await wait(core+'/api/status');
 start(path.join(ROOT,'server.mjs'),[],{PORT:String(port),EVERLIGHT_UI_DB:path.join(dir,'ui.sqlite'),EVERLIGHT_UI_TOKEN:uiToken,EVERLIGHT_HOST_TOKEN:hostToken,EVERLIGHT_CORE_URL:core,EVERLIGHT_CORE_TOKEN:coreToken});
 await wait(base+'/ui/api/v1/status');
 assert.equal((await request('/api/status')).status,401,'private core GET requires login');
 const login=await request('/api/session',{method:'POST',login:true,data:{token:uiToken}});assert.equal(login.status,200);cookie=login.headers.get('set-cookie')?.split(';')[0]||'';assert.ok(cookie.startsWith('everlight_ui='));
 const coreStatus=await must('/api/status');assert.equal(coreStatus.counts.S09,1);
 assert.equal((await request('/api/annotation',{method:'POST',data:{slot:'S09',id:'1',note:'bad'}})).status,403,'core writes default closed');
 assert.ok((await must('/api/list?slot=S09')).rows.length===1);
 assert.equal((await must('/ui/api/v1/status')).productionConnected,false);
 assert.equal((await must('/ui/api/v1/tasks')).items.length,0);
 const task=(await must('/ui/api/v1/tasks',{method:'POST',data:{title:'查清楚回执',project:'长明',owner:'D',sourceRef:'test-host-event-123',acceptance:'有核验过的交付回执'}},201)).item;
 assert.equal(task.status,'proposed');assert.equal(task.revision,1);
 assert.equal((await request(`/ui/api/v1/tasks/${task.id}`,{method:'PATCH',data:{expectedRevision:0,status:'todo'}})).status,409);
 let task2=(await must(`/ui/api/v1/tasks/${task.id}`,{method:'PATCH',data:{expectedRevision:1,status:'todo'}})).item;
 assert.equal(task2.status,'todo');
 task2=(await must(`/ui/api/v1/tasks/${task.id}/steps`,{method:'POST',data:{expectedRevision:2,title:'核对请求快照'}} ,201)).item;
 assert.equal(task2.steps.length,1);
 task2=(await must(`/ui/api/v1/tasks/${task.id}`,{method:'PATCH',data:{expectedRevision:3,status:'in_progress'}})).item;
 assert.equal((await request(`/ui/api/v1/tasks/${task.id}/steps/0`,{method:'PATCH',data:{expectedRevision:4,evidenceRef:'not-a-real-receipt'}})).status,422);
 await must('/ui/api/v1/host/evidence',{method:'POST',host:true,data:{id:'step-actual-event',scope:'personal',actor:'D-host',kind:'step_event',sourceRef:'real-step-artifact'}},201);
 await must('/ui/api/v1/host/receipts',{method:'POST',host:true,data:{id:'real-step-receipt',taskId:task.id,kind:'step',stepIndex:0,eventId:'step-actual-event',sourceRef:'real-step-artifact',occurredAt:'2026-11-22T14:55:00+08:00',result:'ok'}},201);
 task2=(await must(`/ui/api/v1/tasks/${task.id}/steps/0`,{method:'PATCH',data:{expectedRevision:4,evidenceRef:'real-step-receipt'}})).item;
 assert.equal(task2.steps[0].done,true);
 assert.equal((await request(`/ui/api/v1/tasks/${task.id}`,{method:'PATCH',data:{expectedRevision:5,status:'awaiting_delivery'}})).status,200);
 assert.equal((await request(`/ui/api/v1/tasks/${task.id}`,{method:'PATCH',data:{expectedRevision:6,status:'verified_done',evidenceRef:'fake'}})).status,422,'fake receipt must fail');
 assert.equal((await request('/ui/api/v1/host/receipts',{method:'POST',data:{id:'x',taskId:task.id,kind:'delivery',result:'ok'}})).status,403,'host requires its own token');
 const receipt={id:'test-delivery-receipt',taskId:task.id,kind:'delivery',result:'ok',eventId:'test-core-receipt-event',sourceRef:'test-artifact-xyz',occurredAt:'2026-11-22T15:00:00+08:00'};
 await must('/ui/api/v1/host/evidence',{method:'POST',host:true,data:{id:receipt.eventId,scope:'personal',kind:'delivery_event',actor:'D-host',sourceRef:receipt.sourceRef}},201);
 await must('/ui/api/v1/host/receipts',{method:'POST',host:true,data:receipt},201);
 const finished=(await must(`/ui/api/v1/tasks/${task.id}`,{method:'PATCH',data:{expectedRevision:6,status:'verified_done',evidenceRef:'test-delivery-receipt'}})).item;
 assert.equal(finished.status,'verified_done');assert.ok(finished.activity.length>=4);
 assert.equal((await request(`/ui/api/v1/tasks/${task.id}`,{method:'PATCH',data:{expectedRevision:finished.revision,status:'todo'}})).status,409);
 const exportData=await request('/ui/api/v1/tasks/export');assert.equal(exportData.status,200);assert.ok(exportData.body.includes('test-delivery-receipt'));
 await must('/ui/api/v1/settings/theme',{method:'PUT',data:{theme:'moon',customColor:'#6688aa'}});
 assert.equal((await must('/ui/api/v1/settings/theme')).customColor,'#6688aa');
 assert.equal((await request('/ui/api/v1/settings/theme',{method:'PUT',data:{theme:'evil'}})).status,422);
 const evidence=[{id:'host-ev-old',sourceRef:'raw/test:1',scope:'personal',actor:'human',kind:'claim',subject:'A',field:'preference',value:'粉色',effectiveAt:'2026-11-01T10:00:00+08:00'},{id:'host-ev-new',sourceRef:'raw/test:2',scope:'personal',actor:'human',kind:'correction',subject:'A',field:'preference',value:'黑色',effectiveAt:'2026-11-21T10:00:00+08:00'}];
 for(const x of evidence)await must('/ui/api/v1/host/evidence',{method:'POST',host:true,data:x},201);
 await must('/ui/api/v1/host/evidence',{method:'POST',host:true,data:{id:'work-host-event',sourceRef:'original-s03-task-ref',scope:'personal',actor:'D-host',kind:'accepted_task'}},201);
 const synced=await must('/ui/api/v1/host/task-sync',{method:'POST',host:true,data:{externalId:'real-s03-item-123',sourceEventId:'work-host-event',title:'检查 S03 同步状态',acceptance:'有可信任务状态证据',owner:'D',project:'长明',status:'todo'}});
 assert.equal(synced.item.status,'todo');assert.equal(synced.projectionOnly,true);
 assert.equal((await request('/ui/api/v1/host/task-sync',{method:'POST',host:true,data:{externalId:'real-s03-item-123',sourceEventId:'work-host-event',title:'A',acceptance:'B',status:'verified_done'}})).status,422);
 const hostDream=(await must('/ui/api/v1/host/dreams/request',{method:'POST',host:true,data:{sourceEventId:'host-ev-new',trigger:'new_evidence'}},202)).item;
 assert.ok(hostDream.id.startsWith('DR-'));

 assert.equal((await request('/ui/api/v1/host/evidence',{method:'POST',host:true,data:evidence[0]})).status,409);
 const dream=(await must('/ui/api/v1/dreams/request',{method:'POST',data:{scope:'personal',trigger:'manual_request'}},202)).item;
 let processed;
 for(let i=0;i<30;i++){processed=(await must(`/ui/api/v1/dreams/${dream.id}`)).item;if(processed.status==='reviewing')break;await new Promise(r=>setTimeout(r,40))}
 assert.equal(processed.status,'reviewing');assert.equal(processed.proposals.length,1);
 const p=processed.proposals[0];assert.deepEqual(p.sourceRefs,['host-ev-old','host-ev-new']);
 const response=await must(`/ui/api/v1/dreams/${dream.id}/proposals/${p.id}/decision`,{method:'POST',data:{decision:'submit_for_review'}});
 assert.equal(response.canonicalMemoryChanged,false);
 const reviews=(await must('/ui/api/v1/dreams/reviews')).items;assert.equal(reviews.length,1);
 const result=await must(`/ui/api/v1/dreams/reviews/${reviews[0].id}/decision`,{method:'POST',data:{decision:'approve_proposal',reason:'核对来源后同意提议'}});
 assert.equal(result.canonicalMemoryChanged,false);
 assert.equal(result.item.status,'approved_pending_canonical');
 const revoked=await must('/ui/api/v1/host/evidence/host-ev-old/revoke',{method:'POST',host:true,data:{reason:'原始来源撤回'}});assert.equal(revoked.revoked,true);
 assert.equal((await must('/ui/api/v1/evidence')).rows.find(x=>x.id==='host-ev-old').deleted,1);
 const originalRaw=(await must('/api/list?slot=S01')).rows;assert.equal(originalRaw.length,0,'dream never inserts original S01');
 const auditRows=(await must('/ui/api/v1/audit')).rows;assert.ok(auditRows.length>4);
 const html=await request('/');assert.ok(html.body.includes('addon.js'));assert.equal(html.status,200);
 for(const asset of new Set(['/assets/lampkin-peek.png',...Array.from(html.body.matchAll(/(?:src|href)="([^" ]+\.(?:js|css))"/g),m=>'/'+m[1].replace(/^\//,''))]))assert.equal((await request(asset)).status,200,asset);
});
