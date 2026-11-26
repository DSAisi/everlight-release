import {recallContent} from '../core/temporal.mjs';
import {openDatabase,putTask,putDream} from '../dashboard/storage.mjs';
import {spawn} from 'node:child_process';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
const root=process.argv[2]||path.resolve(import.meta.dirname,'..'),dir=mkdtempSync(path.join(tmpdir(),'everlight-int-')),token='0123456789abcdef0123456789abcdef',ui='1234567890abcdefghijklmn';
const adminToken='governance-admin-fixture-0123456789';const aiToken='ai-decision-fixture-0123456789',humanToken='human-decision-fixture-0123456789';const hostToken='host-token-0123456789abcdef0123456789';const corePort=19190,uiPort=19191;const children=[];
const launch=(file,env)=>{const p=spawn(process.execPath,[file],{cwd:root,env:{...process.env,...env},stdio:'pipe'});children.push(p);p.stderr.on('data',d=>process.stderr.write(d));return p};
const get=async(url,auth)=>fetch(url,{headers:{authorization:'Bearer '+auth}});
const wait=async(url,auth)=>{for(let i=0;i<80;i++){try{const r=await get(url,auth);if(r.status===200)return}catch{}await new Promise(r=>setTimeout(r,100))}throw Error('startup timeout '+url)};
try{
 launch(path.join(root,'core/server.mjs'),{EVERLIGHT_GOVERNANCE_ADMIN_TOKEN:adminToken,EVERLIGHT_AI_DECISION_TOKEN:aiToken,EVERLIGHT_HUMAN_DECISION_TOKEN:humanToken,EVERLIGHT_SHARED_HOST_TOKEN:hostToken,EVERLIGHT_BOUND_SCOPE:'personal',EVERLIGHT_CORE_TOKEN:token,EVERLIGHT_CORE_PORT:String(corePort),EVERLIGHT_CORE_DB:path.join(dir,'core.sqlite')});
 await wait(`http://127.0.0.1:${corePort}/api/v8/status?scope=personal`,token);
 const denied=await fetch(`http://127.0.0.1:${corePort}/api/v8/source`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({scope:'personal',actor:'human',kind:'message',source_ref:'denied',body:{text:'must not write'}})});assert.equal(denied.status,403);
 // A core bearer alone must never mutate state, including previously unguarded modules.
 for(const endpoint of ['/api/v8/recall','/api/v8/dream/start','/api/v8/dream/advance','/api/v8/crsi/propose','/api/v8/crsi/evaluate','/api/v8/tasks/event','/api/v8/tasks/reporting','/api/v8/tasks/reporting/tick','/api/v8/shared/actions','/api/v8/relations/person','/api/v8/relations/alias/propose','/api/v8/relations/resolve']){
  const r=await fetch(`http://127.0.0.1:${corePort}${endpoint}`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:'{}'});
  assert.equal(r.status,403,`missing host credential on ${endpoint}`);
 }
 // Pure schema inspection remains accessible with a core bearer.
 const validate=await fetch(`http://127.0.0.1:${corePort}/api/v8/proposal/validate`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:'{}'});assert.equal(validate.status,200);
 const post=async(p,body)=>{const r=await fetch(`http://127.0.0.1:${corePort}${p}`,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','x-everlight-host-token':hostToken},body:JSON.stringify(body)});const bodyText=await r.text();assert.equal(r.status,200,bodyText);return JSON.parse(bodyText)};
 const joint=async(id)=>{const {digest}=await (await get(`http://127.0.0.1:${corePort}/api/v8/joint/status?scope=personal&id=${id}`,token)).json();const vote=(role,credential)=>fetch(`http://127.0.0.1:${corePort}/api/v8/joint/${role}`,{method:'POST',headers:{authorization:'Bearer '+token,'x-everlight-host-token':hostToken,'x-everlight-decision-token':credential,'content-type':'application/json'},body:JSON.stringify({scope:'personal',id,digest,decision:'approve',reason:'integration fixture'})});assert.equal((await vote('human',aiToken)).status,403);assert.equal((await vote('ai',aiToken)).status,200);assert.equal((await fetch(`http://127.0.0.1:${corePort}/api/v8/commit/scoped`,{method:'POST',headers:{authorization:'Bearer '+token,'x-everlight-host-token':hostToken,'content-type':'application/json'},body:JSON.stringify({scope:'personal',id})})).status,422);assert.equal((await vote('human',humanToken)).status,200);};
 await post('/api/v8/source',{scope:'personal',actor:'human',kind:'message',source_ref:'integration-1',body:{text:'长明测试'}});
 // Cross-scope reads and writes are rejected at the HTTP boundary in single-tenant mode.
 const otherGet=await get(`http://127.0.0.1:${corePort}/api/v8/memories/page?scope=other`,token);assert.equal(otherGet.status,403);
 const otherPost=await fetch(`http://127.0.0.1:${corePort}/api/v8/source`,{method:'POST',headers:{authorization:'Bearer '+token,'x-everlight-host-token':hostToken,'content-type':'application/json'},body:JSON.stringify({scope:'other',actor:'human',kind:'message',source_ref:'cross-tenant',body:{text:'forbidden'}})});assert.equal(otherPost.status,403);
 // D8: independent identity review, S07 read-through from dashboard.
 const dp=await post('/api/v8/relations/person',{scope:'personal',label:'D8甲'}),dq=await post('/api/v8/relations/person',{scope:'personal',label:'D8乙'});
 const ds=await post('/api/v8/source',{scope:'personal',actor:'human',kind:'message',source_ref:'d8-fixture',body:{text:'确认昵称和朋友关系'}});
 const dn=await post('/api/v8/relations/name/propose',{scope:'personal',person_id:dq.id,name:'D8昵称',kind:'nickname',source_id:ds.id,reason:'explicit'});
 const decideName=(credential)=>fetch(`http://127.0.0.1:${corePort}/api/v8/relations/name/review`,{method:'POST',headers:{authorization:'Bearer '+token,'x-everlight-host-token':hostToken,'x-everlight-decision-token':credential,'content-type':'application/json'},body:JSON.stringify({scope:'personal',id:dn.id,decision:'approve',reason:'confirmed'})});
 assert.equal((await decideName(aiToken)).status,403);assert.equal((await decideName(humanToken)).status,200);
 const dr=await post('/api/v8/relations/trigger-recall',{scope:'personal',trigger:'person_mentioned',text:'D8昵称'});assert.equal(dr.person.id,dq.id);
 const de=await post('/api/v8/write/templated-proposal',{scope:'personal',slot:'S07',kind:'relationship',source_refs:[ds.id],reason:'explicit',idempotency_key:'d8-edge',payload:{template_version:'everlight.write.d7',subject:dp.label,object:dq.label,subject_person_id:dp.id,object_person_id:dq.id,relation:'朋友',circle:'friend',boundary:null}});await joint(de.id);const dm=await post('/api/v8/commit/scoped',{scope:'personal',id:de.id});
 const dg=await (await get(`http://127.0.0.1:${corePort}/api/v8/relations/graph`,token)).json();assert.ok(dg.edges.some(e=>e.id===dm.id&&e.from===dp.id&&e.to===dq.id));
 launch(path.join(root,'dashboard/server.mjs'),{PORT:String(uiPort),EVERLIGHT_UI_TOKEN:ui,EVERLIGHT_UI_DB:path.join(dir,'ui.sqlite'),EVERLIGHT_CORE_URL:`http://127.0.0.1:${corePort}`,EVERLIGHT_CORE_TOKEN:token,EVERLIGHT_CORE_ADAPTER:'v8',EVERLIGHT_UI_SCOPE:'personal'});await wait(`http://127.0.0.1:${uiPort}/api/v8/relations/graph`,ui);
 const uiGraph=await (await get(`http://127.0.0.1:${uiPort}/api/v8/relations/graph`,ui)).json();assert.ok(uiGraph.edges.some(e=>e.id===dm.id));const uiPreview=await (await get(`http://127.0.0.1:${uiPort}/api/v8/ui/person-memories?person_id=${dq.id}`,ui)).json();assert.ok(uiPreview.items.some(e=>e.memory_id===dm.id));
 if(process.env.D8_BROWSER==='1'){const browser=spawn('python',[path.join(root,'test/d8-browser.py'),String(uiPort),ui,dq.id,dm.id],{cwd:root,stdio:'inherit'});assert.equal(await new Promise(r=>browser.on('exit',r)),0);}
 await post('/api/v8/revoke',{scope:'personal',kind:'source',target:ds.id,reason:'d8 withdrawal'});const dg2=await (await get(`http://127.0.0.1:${corePort}/api/v8/relations/graph`,token)).json();assert.ok(!dg2.edges.some(e=>e.id===dm.id));console.log('D8 HTTP identity approval, S07 commit/revoke verified');

}finally{for(const p of children){p.kill('SIGTERM');await new Promise(r=>p.once('exit',r));}rmSync(dir,{recursive:true,force:true});}
