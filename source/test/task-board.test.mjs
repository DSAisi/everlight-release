import {approveBoth} from './joint-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {EverlightCore} from '../core/engine.mjs';
test('S03 task transitions are sourced, durable, scoped and not self-verified',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'everlight-task-'));const file=path.join(dir,'db.sqlite');let core=new EverlightCore(file);
 try{
  const src=core.source({scope:'personal',actor:'human',kind:'conversation',source_ref:'turn:1',body:{text:'请完成开源测试'}});
  const p=core.propose({scope:'personal',slot:'S03',kind:'goal',reason:'accepted',idempotency_key:'task-a',source_refs:[src.id],payload:{summary:'开源测试',owner:'AI',intent:'验收',state:'todo',acceptance:'tests green'}});
  core.review(p.id,{decision:'approve',reviewer:'human'});const task=(approveBoth(core,p.id),core.commit(p.id));
  const progress=core.taskEvent({scope:'personal',memory_id:task.id,expected_revision:1,action:'progress',state:'in_progress',actor:'ai',source_id:src.id,idempotency_key:'progress-1'});
  assert.equal(progress.canonicalMemoryChanged,false);assert.equal(core.taskBoard({scope:'personal'})[0].state,'in_progress');
  assert.equal(core.taskEvent({scope:'personal',memory_id:task.id,expected_revision:1,action:'progress',state:'in_progress',actor:'ai',source_id:src.id,idempotency_key:'progress-1'}).idempotent,true);
  assert.throws(()=>core.taskEvent({scope:'personal',memory_id:task.id,expected_revision:1,action:'verify',state:'verified',actor:'ai',source_id:src.id,receipt_ref:'fake',idempotency_key:'bad'}));
  core.taskEvent({scope:'personal',memory_id:task.id,expected_revision:1,action:'complete',state:'done',actor:'ai',source_id:src.id,idempotency_key:'done-1'});
  const deliverySource=core.source({scope:'personal',actor:'host',kind:'execution',source_ref:'delivery:1',body:{text:'synthetic artifact'}}).id;
  const acceptance=core.source({scope:'personal',actor:'human',kind:'message',source_ref:'acceptance:1',body:{text:'independent synthetic acceptance'}}).id;
  const delivery=core.taskEvidence({scope:'personal',memory_id:task.id,expected_revision:1,kind:'delivery',source_id:deliverySource,actor:'host',detail:'artifact recorded',idempotency_key:'delivery-1'});
  const verify={scope:'personal',memory_id:task.id,expected_revision:1,action:'verify',state:'verified',actor:'human',source_id:acceptance,receipt_ref:delivery.id,idempotency_key:'verify-1'};
  assert.throws(()=>core.taskEvent({...verify,receipt_ref:'fake'}),{status:422});assert.throws(()=>core.taskEvent({...verify,source_id:deliverySource}),{status:422});assert.throws(()=>core.taskEvent({...verify,source_id:src.id}),{status:422});core.taskEvent(verify);
  assert.equal(core.sharedView({scope:'personal'}).tasks[0].verified,true);
  assert.equal(core.taskBoard({scope:'other'}).length,0);
  core.close();core=new EverlightCore(file);assert.equal(core.taskBoard({scope:'personal'})[0].events.length,3);
  core.revoke({scope:'personal',kind:'source',target:deliverySource,reason:'delivery withdrawn'});assert.equal(core.taskBoard({scope:'personal'})[0].verified,false);assert.equal(core.taskBoard({scope:'personal'})[0].state,'done');assert.equal(core.taskEvent(verify).current_state,'done');const recalled=core.recall({scope:'personal',query:'开源测试'}).selected.find(r=>r.id===task.id);assert.equal(recalled.temporal_context.task_state.state,'done');assert.equal(recalled.temporal_context.task_state.verified,false);
  core.revoke({scope:'personal',kind:'source',target:src.id,reason:'withdrawn'});assert.equal(core.taskBoard({scope:'personal'}).length,0);
 }finally{core.close();fs.rmSync(dir,{recursive:true,force:true})}
});
