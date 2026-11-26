import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {selectContext,defaultContextBudgetBytes} from '../core/context-budget-d14c2.mjs';
import {EverlightCore} from '../core/engine.mjs';
import {recallRequestContent} from '../core/recall-request-content-w3h6p.mjs';
import {approveBoth} from './joint-fixture.mjs';
const row=(id,sources,extra={})=>({id,scope:'a',revision:1,slot:'S05',kind:'fact',payload:{statement:'alpha'},sources,temporal_context:{status:'unverified_time'},...extra});
test('J5 dedup keeps different evidence, event time and association proof; removes only identical evidence payload',()=>{
 const a=row('a',['1','2']), b=row('b',['2','1']), c=row('c',['3']), d=row('d',['1','2'],{temporal_context:{status:'unverified_time',event_at:'2026-01-01T00:00:00Z'}}), e=row('e',['1','2'],{event_proof:{anchor_id:'z'}});
 const result=selectContext({ranked:[a,b,c,d,e],rows:[a,b,c,d,e],limit:8,budget:defaultContextBudgetBytes});
 assert.deepEqual(result.selected.map(x=>x.id),['a','c','d','e']);assert.deepEqual(result.lane.deduplicated_ids,['b']);
});
for(const indexedRecall of [false,true])test(`J5 actual S10 readback is scoped, exact bytes, zero candidates supported, indexed=${indexedRecall}`,t=>{
 const dir=mkdtempSync(join(tmpdir(),'j5-'));const c=new EverlightCore(join(dir,'core.sqlite'),{indexedRecall,contextBudget:1024});t.after(()=>{c.close();rmSync(dir,{recursive:true,force:true})});
 function add(statement,key){const s=c.source({scope:'a',actor:'human',kind:'conversation',source_ref:key,body:{text:statement}});const p=c.propose({scope:'a',slot:'S05',kind:'fact',payload:{statement,subject:'fixture',attribution:'direct'},source_refs:[s.id],reason:'fixture',idempotency_key:key});approveBoth(c,p.id);return c.commit(p.id);}
 const large=add('alpha '+ '猫'.repeat(1000),'large'); const small=add('alpha short','small');
 const run=c.recall({scope:'a',query:'alpha'}); const detail=c.ledgerDetail({scope:'a',slot:'S10',id:run.run_id});const a=detail.selection_audit;
 assert.deepEqual(run.selected.map(r=>r.id),[small.id]);assert.equal(a.selected_count,1);assert.equal(a.candidate_count,2);assert.equal(a.budget_bytes,1024);assert.ok(a.budget_lane.budget_omitted_ids.includes(large.id));assert.equal(a.recall_envelope_utf8_bytes,Buffer.byteLength(recallRequestContent(run)));assert.equal(a.token_usage,null);assert.throws(()=>c.ledgerDetail({scope:'b',slot:'S10',id:run.run_id}));
 const empty=c.recall({scope:'a',query:'zyxwvut987654321'});assert.equal(empty.selected.length,0);assert.equal(empty.checked.length,12);assert.equal(c.ledgerDetail({scope:'a',slot:'S10',id:empty.run_id}).selection_audit.selected_count,0);assert.equal(c.verifyActualRequest({scope:'a',run_id:empty.run_id,messages:[{role:'system',content:recallRequestContent(empty)}]}).verified,true);
});
