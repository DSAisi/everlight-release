import test from 'node:test';import assert from 'node:assert/strict';import {EverlightCore} from '../core/engine.mjs';import {approveBoth} from './joint-fixture.mjs';import {personRecallLane} from '../core/relations.mjs';
for(const indexedRecall of [false,true])test(`H6N intent beats generic person recall indexed=${indexedRecall}`,()=>{
 const old=process.env.EVERLIGHT_W2_PERSON_RECALL;process.env.EVERLIGHT_W2_PERSON_RECALL='1';const c=new EverlightCore(':memory:',{indexedRecall});let n=0;const scope='demo';
 try{const a=c.relationPerson({scope,label:'小明'}),b=c.relationPerson({scope,label:'小红'});
 const add=(who,summary)=>{const key='h6n-'+ ++n;const s=c.source({scope,actor:'human',kind:'conversation',source_ref:key,body:{text:summary}});const p=c.propose({scope,slot:'S04',kind:'episode',payload:{summary,participants:['某人'],participant_person_ids:[who.id]},source_refs:[s.id],reason:'fixture',idempotency_key:key});approveBoth(c,p.id);const m=c.commit(p.id);return m;};
 const target=add(a,'共同修复数据库迁移');const noise=add(a,'一起喝茶');const other=add(b,'数据库迁移');
 // Force deterministic recency in the synthetic fixture.
 for(const [m,t] of [[target,'2025-01-01'],[noise,'2025-02-01'],[other,'2025-03-01']])c.db.prepare('UPDATE memories SET created_at=? WHERE id=?').run(t,m.id);
 assert.equal(personRecallLane(c,scope,'小明 数据库迁移',2).rows[0].id,target.id);
 assert.equal(c.recall({scope,query:'小明 数据库迁移',limit:1}).selected[0].id,target.id);
 assert.equal(personRecallLane(c,scope,'小明',2,'他怎么处理数据库迁移').rows[0].id,target.id);
 assert.equal(personRecallLane(c,scope,'小明',2).rows[0].id,noise.id);
 assert.equal(personRecallLane(c,scope,'小明和小红 数据库迁移',2).rows.length,0);
 }finally{c.close();if(old===undefined)delete process.env.EVERLIGHT_W2_PERSON_RECALL;else process.env.EVERLIGHT_W2_PERSON_RECALL=old;}
});
