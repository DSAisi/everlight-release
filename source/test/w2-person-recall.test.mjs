import test from 'node:test';import assert from 'node:assert/strict';import {EverlightCore} from '../core/engine.mjs';import {approveBoth} from './joint-fixture.mjs';import {recallContent} from '../core/temporal.mjs';
for(const indexedRecall of [false,true])test(`W2 person associations in normal CRSI, indexed=${indexedRecall}`,()=>{
 const old=process.env.EVERLIGHT_W2_PERSON_RECALL;process.env.EVERLIGHT_W2_PERSON_RECALL='1';const c=new EverlightCore(':memory:',{indexedRecall});let i=0;
 try{const scope='demo',a=c.relationPerson({scope,label:'小明'}),b=c.relationPerson({scope,label:'小红'});
 const add=(person,summary,scope='demo')=>{const key='w2-'+ ++i;const s=c.source({scope,actor:'human',kind:'conversation',source_ref:key,body:{text:summary}});const p=c.propose({scope,slot:'S04',kind:'episode',payload:{summary,participants:['某人'],participant_person_ids:[person.id]},source_refs:[s.id],reason:'fixture',idempotency_key:key});approveBoth(c,p.id);return {...c.commit(p.id),source:s.id};};
 const x=add(a,'一起看烟花'),y=add(b,'一起跑步'),z=add(a,'其他作用域','other');
 const r=c.recall({scope,query:'小明'});assert.equal(r.checked.length,12);assert.deepEqual(r.selected.map(m=>m.id),[x.id]);assert.equal(c.verifyActualRequest({scope,run_id:r.run_id,messages:[{role:'system',content:recallContent(r.selected)}]}).verified,true);
 assert.equal(c.recall({scope,query:'天气'}).selected.length,0);assert.deepEqual(c.recall({scope,query:'小红'}).selected.map(m=>m.id),[y.id]);assert.equal(c.recall({scope,query:'小明和小红'}).lanes.find(l=>l.name==='person-association-w2').hits,0);
 c.revoke({scope,kind:'source',target:x.source,reason:'withdrawn'});assert.equal(c.recall({scope,query:'小明'}).selected.length,0);assert.equal(c.verifyActualRequest({scope,run_id:r.run_id,messages:[{role:'system',content:recallContent(r.selected)}]}).verified,false);assert.ok(!r.selected.some(m=>m.id===z.id));
 }finally{c.close();if(old===undefined)delete process.env.EVERLIGHT_W2_PERSON_RECALL;else process.env.EVERLIGHT_W2_PERSON_RECALL=old;}
});
