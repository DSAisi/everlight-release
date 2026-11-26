import {approveBoth} from './joint-fixture.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import os from 'node:os';import fs from 'node:fs';import path from 'node:path';import {EverlightCore} from '../core/engine.mjs';
test('incoming confirmed contact or explicit mention triggers same cross-library memories, unrelated text does not',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'everlight-person-trigger-'));const c=new EverlightCore(path.join(dir,'db.sqlite'));
 try{
  const source=c.source({scope:'demo',actor:'human',kind:'conversation',source_ref:'msg1',body:{statement:'confirmed'}});
  const person=c.relationPerson({scope:'demo',label:'小明'});
  const review=c.relationAliasProposal({scope:'demo',person_id:person.id,channel:'matrix',external_id:'@ming:example',source_id:source.id,reason:'confirmed by human'});
  assert.equal(c.personTriggeredRecall({scope:'demo',trigger:'incoming_contact',channel:'matrix',external_id:'@ming:example'}).matched,false);
  c.relationAliasDecision({scope:'demo',id:review.id,decision:'approve',reviewer:'human'});
  const p=c.propose({scope:'demo',slot:'S04',kind:'episode',payload:{summary:'一起看烟花',participants:['小明'],participant_person_ids:[person.id]},source_refs:[source.id],reason:'documented episode',idempotency_key:'episode1'});
  c.review(p.id,{decision:'approve',reviewer:'human'});const memory=(approveBoth(c,p.id),c.commit(p.id));
  const contact=c.personTriggeredRecall({scope:'demo',trigger:'incoming_contact',channel:'matrix',external_id:'@ming:example'});
  assert.equal(contact.selected[0].id,memory.id);assert.equal(contact.actual_request_verified,false);
  assert.equal(c.personTriggeredRecall({scope:'demo',trigger:'person_mentioned',text:'昨天小明说了什么'}).selected[0].id,memory.id);
  assert.equal(c.personTriggeredRecall({scope:'demo',trigger:'person_mentioned',text:'今天吃什么'}).matched,false);
  assert.equal(c.personTriggeredRecall({scope:'demo',trigger:'incoming_contact',channel:'discord',external_id:'same-name'}).matched,false);
  c.revoke({scope:'demo',kind:'source',target:source.id,reason:'privacy'});
  assert.equal(c.personTriggeredRecall({scope:'demo',trigger:'incoming_contact',channel:'matrix',external_id:'@ming:example'}).matched,false);
  assert.equal(c.personTriggeredRecall({scope:'demo',trigger:'person_mentioned',text:'小明'}).selected.length,0);
 }finally{c.close();fs.rmSync(dir,{recursive:true,force:true})}
});
test('E6B person recall labels historical and conflicting facts using same-scope peers without leaking unrelated rows',()=>{const prev=process.env.EVERLIGHT_D14E6B_PERSON_TIME;process.env.EVERLIGHT_D14E6B_PERSON_TIME='1';const c=new EverlightCore(':memory:');try{const scope='demo',person=c.relationPerson({scope,label:'小明'});let i=0;const add=(summary,temporal,personIds)=>{const source=c.source({scope,actor:'human',kind:'conversation',source_ref:'event'+ ++i,body:{summary}});const p=c.propose({scope,slot:'S04',kind:'episode',payload:{summary,participants:['小明'],participant_person_ids:personIds,temporal},source_refs:[source.id],reason:'fixture',idempotency_key:'person-time-'+i});c.review(p.id,{decision:'approve',reviewer:'human'});approveBoth(c,p.id);return c.commit(p.id);};const old=add('过去住处',{key:'home-old',event_at:'2000-01-01T00:00:00Z',valid_from:'2000-01-01T00:00:00Z',valid_until:'2001-01-01T00:00:00Z'},[person.id]);const a=add('现在住处候选',{key:'home',valid_from:'2000-01-01T00:00:00Z'},[person.id]);const b=add('冲突的住处',{key:'home',valid_from:'2000-01-01T00:00:00Z'},[]);const r=c.personTriggeredRecall({scope,trigger:'person_mentioned',text:'小明'});assert.equal(r.selected.find(m=>m.id===old.id).temporal_context.status,'historical');assert.equal(r.selected.find(m=>m.id===a.id).temporal_context.status,'conflict');assert.equal(r.selected.some(m=>m.id===b.id),false);assert.equal(r.actual_request_verified,false);}finally{c.close();if(prev===undefined)delete process.env.EVERLIGHT_D14E6B_PERSON_TIME;else process.env.EVERLIGHT_D14E6B_PERSON_TIME=prev;}});
