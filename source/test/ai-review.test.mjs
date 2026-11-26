import test from 'node:test';import assert from 'node:assert/strict';import {reviewPage} from '../automation/ai-review.mjs';
test('review scan uses durable decisions and explicit companion response only',async()=>{
 const votes=[];const channel={page:async()=>({rows:['done','yes','wait','bad','revoked'].map(id=>({id})),has_more:false}),status:async id=>({digest:'d',policy:{joint:true},decisions:id==='done'?[{role:'ai',digest:'d'}]:[]}),detail:async id=>({id,state:'pending',source_valid:id!=='revoked'}),decide:async v=>{votes.push(v);return {auto_commit:'waiting'}}};
 const r=await reviewPage({channel,decide:async({candidate})=>candidate.id==='yes'?{decision:'approve',reason:'accurate'}:candidate.id==='wait'?{decision:'defer'}:{}});
 assert.deepEqual(votes,[{id:'yes',digest:'d',decision:'approve',reason:'accurate'}]);assert.deepEqual(r.results.map(x=>x.state),['already_decided','decided','deferred','failed','unavailable']);
});
