import test from 'node:test';
import assert from 'node:assert/strict';
import {EverlightCore} from '../core/engine.mjs';
import {approveBoth} from './joint-fixture.mjs';
import {chooseRelevant} from '../core/context-relevance-j11.mjs';
import {recallRequestContent} from '../core/recall-request-content-w3h6p.mjs';
for(const indexedRecall of [false,true])test(`J11 name-only leakage is deferred across local lanes indexed=${indexedRecall}`,()=>{
 const old=process.env.EVERLIGHT_W2_PERSON_RECALL;process.env.EVERLIGHT_W2_PERSON_RECALL='1';const c=new EverlightCore(':memory:',{indexedRecall,contextBudget:12000});
 try{const scope='a',person=c.relationPerson({scope,label:'小明'});let i=0;
 const add=(summary,linked=true)=>{const key='j11-'+ ++i;const s=c.source({scope,actor:'human',kind:'conversation',source_ref:key,body:{text:summary}});const p=c.propose({scope,slot:'S04',kind:'episode',payload:{summary,participants:['小明'],...(linked?{participant_person_ids:[person.id]}:{})},source_refs:[s.id],reason:'fixture',idempotency_key:key});approveBoth(c,p.id);return c.commit(p.id);};
 const target=add('数据库迁移'),noise=add('喝茶聊天'),unlinked=add('周末看电影',false);
 const run=c.recall({scope,query:'小明 数据库迁移'});assert.equal(run.checked.length,12);assert.deepEqual(run.selected.map(r=>r.id),[target.id]);
 const audit=c.ledgerDetail({scope,slot:'S10',id:run.run_id}).selection_audit;assert.ok(audit.candidate_count>=3);assert.deepEqual(new Set(audit.relevance_lane.deferred_local_ids),new Set([noise.id,unlinked.id]));
 assert.equal(c.verifyActualRequest({scope,run_id:run.run_id,messages:[{role:'system',content:recallRequestContent(run)}]}).verified,true);
 assert.ok(c.recall({scope,query:'小明'}).selected.some(r=>r.id===noise.id));
 const semantic=c.recall({scope,query:'小明 数据库迁移'},[{name:'remote-vector',search:()=>[{id:noise.id,revision:noise.revision}]}]);assert.ok(semantic.selected.some(r=>r.id===noise.id));
 }finally{c.close();if(old===undefined)delete process.env.EVERLIGHT_W2_PERSON_RECALL;else process.env.EVERLIGHT_W2_PERSON_RECALL=old;}
});
test('independent semantic and shared-evidence candidates remain eligible, and generic cues are unchanged',()=>{
 const ranked=[{id:'a',payload:{summary:'blue'}},{id:'b',payload:{summary:'tea'}},{id:'c',payload:{summary:'walk'}},{id:'d',payload:{summary:'dinner'}}];const support=new Map([['a',new Set(['lexical'])],['b',new Set(['local-bm25'])],['c',new Set(['remote-vector'])],['d',new Set(['lexical'])]]);
 const result=chooseRelevant({ranked,support,association:{activation:'topic_evidence',topic_terms:['blue'],rows:[ranked[3]]}});assert.deepEqual(result.ranked.map(r=>r.id),['a','c','d']);assert.deepEqual(result.lane.deferred_local_ids,['b']);assert.equal(chooseRelevant({ranked,support,association:{activation:'broad_person'}}).ranked,ranked);
});
