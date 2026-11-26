import {approveBoth} from './joint-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EverlightCore} from '../core/engine.mjs';
test('trusted scoped review -> commit -> canonical readback; scope and duplicate protection',()=>{
 const dir=mkdtempSync(join(tmpdir(),'everlight-scoped-'));
 try{
  const c=new EverlightCore(join(dir,'db.sqlite'));
  const source=c.source({scope:'personal',actor:'human',kind:'message',source_ref:'chat:1',body:{text:'a factual note'},at:'2026-11-24T00:00:00Z'});
  const p=c.propose({scope:'personal',slot:'S05',kind:'fact',payload:{statement:'a factual note',subject:'human',attribution:'human'},source_refs:[source.id],reason:'human reviewed source',idempotency_key:'scoped-test-1'});
  assert.throws(()=>c.reviewScoped({scope:'other',id:p.id,decision:'approve',reviewer:'reviewer',classification:'事实',review_reason:'来源核验通过',proposal_text:''}),/候选不存在/);
  assert.throws(()=>c.commitScoped({scope:'personal',id:p.id}),/共同批准/);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM memories').get().n,0);
  const reviewed=c.reviewScoped({scope:'personal',id:p.id,decision:'approve',reviewer:'reviewer',classification:'事实',review_reason:'来源核验通过',proposal_text:''});
  assert.equal(reviewed.state,'approved_pending_commit');
  assert.equal(reviewed.canonicalMemoryChanged,false);
  assert.equal(c.proposalDetail({scope:'personal',id:p.id}).review_note.reason,'来源核验通过');
  assert.equal(c.proposalDetail({scope:'personal',id:p.id}).review_note.classification,'事实');
  assert.throws(()=>c.commitScoped({scope:'other',id:p.id}),/候选不存在/);
  approveBoth(c,p.id);
  const committed=c.commitScoped({scope:'personal',id:p.id});
  assert.equal(committed.readback_verified,true);
  assert.equal(committed.readback.slot,'S05');
  assert.equal(committed.readback.scope,'personal');
  assert.equal(committed.actual_host_injection_verified,false);
  assert.equal(c.commitScoped({scope:'personal',id:p.id}).idempotent,true);
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM memories').get().n,1);
  c.close?.();
 }finally{rmSync(dir,{recursive:true,force:true})}
});
