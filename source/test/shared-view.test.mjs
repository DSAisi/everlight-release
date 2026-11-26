import {approveBoth} from './joint-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {EverlightCore} from '../core/engine.mjs';
test('shared view reflects actual S03 commit, not a pending task',()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'everlight-view-'));const core=new EverlightCore(path.join(dir,'db.sqlite'));try{
 const source=core.source({scope:'personal',actor:'human',kind:'conversation',source_ref:'chat:1',body:{text:'我答应完成测试'}});
 const p=core.propose({slot:'S03',kind:'goal',scope:'personal',reason:'明确承诺',idempotency_key:'test-task',source_refs:[source.id],payload:{summary:'完成测试',owner:'AI',intent:'测试交付',state:'todo',acceptance:'通过所有测试'}});
 let v=core.sharedView({scope:'personal'});assert.equal(v.tasks.length,0);assert.equal(v.pending.length,1);assert.equal(v.system_ledgers.S01,1);
 core.review(p.id,{decision:'approve',reviewer:'human'});v=core.sharedView({scope:'personal'});assert.equal(v.tasks.length,0);assert.equal(v.pending[0].state,'approved_pending_commit');
 (approveBoth(core,p.id),core.commit(p.id));v=core.sharedView({scope:'personal'});assert.equal(v.tasks.length,1);assert.equal(v.tasks[0].title,'完成测试');assert.equal(v.pending.length,0);assert.equal(v.slots.S03,1);assert.equal(v.tasks[0].verification,'unverified_or_legacy_claim');
 const q=core.createSharedAction({scope:'personal',kind:'task_nudge',actor:'human',body:'请检查任务',idempotency_key:'nudge1'});assert.equal(core.sharedView({scope:'personal'}).actions[0].state,'queued');assert.equal(q.delivered,false);
}finally{core.close();fs.rmSync(dir,{recursive:true,force:true})}});
