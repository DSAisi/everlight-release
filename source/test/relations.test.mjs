import test from 'node:test';import assert from 'node:assert/strict';import os from 'node:os';import path from 'node:path';import fs from 'node:fs';import {EverlightCore} from '../core/engine.mjs';
test('cross-channel identity requires review, resolves to same person, and revocation hides alias',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'everlight-rel-'));try{
 const c=new EverlightCore(path.join(dir,'test.sqlite'));const a=c.source({scope:'test',actor:'host',kind:'event',source_ref:'matrix-event-1',body:{id:'@one:example'}});
 const p=c.relationPerson({scope:'test',label:'小明'});
 const pending=c.relationAliasProposal({scope:'test',person_id:p.id,channel:'Matrix',external_id:'@one:example',source_id:a.id,reason:'user-confirmed identity'});
 assert.equal(c.relationResolve({scope:'test',channel:'matrix',external_id:'@one:example'}).matched,false);
 c.relationAliasDecision({scope:'test',id:pending.id,decision:'approve',reviewer:'human'});
 assert.equal(c.relationResolve({scope:'test',channel:'matrix',external_id:'@one:example'}).person.id,p.id);
 const other=c.relationPerson({scope:'test',label:'另一个人'});
 assert.throws(()=>c.relationAliasProposal({scope:'test',person_id:other.id,channel:'matrix',external_id:'@one:example',source_id:a.id,reason:'guess'}),{status:409});
 assert.equal(c.relationGraph({scope:'test'}).people.find(x=>x.id===p.id).aliases.length,1);
 c.revoke({scope:'test',kind:'source',target:a.id,reason:'withdrawn'});
 assert.equal(c.relationResolve({scope:'test',channel:'matrix',external_id:'@one:example'}).matched,false);
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});
