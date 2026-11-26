import test from 'node:test';
import assert from 'node:assert/strict';
import {EverlightCore} from '../core/engine.mjs';
import {SLOT_RULES,REQUIRED_PAYLOAD} from '../protocol/portable-v1.mjs';
import {approveBoth} from './joint-fixture.mjs';
for(const [slot,rule] of Object.entries(SLOT_RULES)) for(const kind of rule.kind) test(`write gate ${slot}/${kind}`,()=>{
 const c=new EverlightCore(':memory:');try{
 const source={scope:'trial',actor:'human',kind:'conversation',source_ref:'turn:1',body:{text:'synthetic fixture'},source_id:'s'};c.source(source);
 const payload=Object.fromEntries((REQUIRED_PAYLOAD[kind]||[]).map(k=>[k,'fixture']));if(kind==='reflection')payload.verified_level='guess';
 const p={scope:'trial',slot,kind,payload,source_refs:['s'],reason:'fixture',idempotency_key:'p'};
 if(rule.write!=='proposal_review_commit'){assert.throws(()=>c.propose(p));return;}
 for(const k of REQUIRED_PAYLOAD[kind]){const missing={...payload};delete missing[k];assert.throws(()=>c.propose({...p,payload:missing}));}
 assert.throws(()=>c.propose({...p,scope:'other'}));assert.throws(()=>c.propose({...p,source_refs:['missing']}));
 const {id}=c.propose(p);assert.throws(()=>c.commitScoped({scope:'trial',id}));approveBoth(c,id);const r=c.commitScoped({scope:'trial',id});assert.equal(r.readback.slot,slot);assert.equal(r.readback_verified,true);c.revoke({scope:'trial',kind:'source',target:'s',reason:'fixture'});assert.equal(c.list({scope:'trial'}).length,0);
 }finally{c.close()}
});
test('idempotency binds source metadata and proposal revision intent',()=>{const c=new EverlightCore(':memory:');try{const s={scope:'trial',actor:'human',kind:'conversation',source_ref:'turn:1',body:'fixture',source_id:'s'};c.source(s);assert.throws(()=>c.source({...s,source_ref:'turn:2'}));assert.throws(()=>c.source({...s,kind:'document'}));const p={scope:'trial',slot:'S05',kind:'fact',payload:{statement:'x',subject:'x',attribution:'direct'},source_refs:['s'],reason:'fixture',idempotency_key:'p'};c.propose(p);assert.throws(()=>c.propose({...p,target_id:'other',expected_revision:1}));assert.throws(()=>c.propose({...p,reason:'changed'}));}finally{c.close()}});
