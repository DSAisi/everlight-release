import {approveBoth} from './joint-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {EverlightCore} from '../core/engine.mjs';
test('canonical pagination is stable, scope isolated, and excludes revoked sources',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'everlight-page-'));const core=new EverlightCore(path.join(dir,'db.sqlite'));
 try{
  const ids=[];
  for(let i=0;i<7;i++){
   const s='src-'+i;
   core.source({scope:'personal',actor:'human',kind:'conversation',source_ref:'test:'+i,body:{text:'原话'+i},source_id:s});
   const p=core.propose({scope:'personal',slot:'S05',kind:'preference',payload:{statement:'偏好'+i,subject:'甲',attribution:'direct_statement'},source_refs:[s],reason:'source',idempotency_key:'p'+i});
   core.review(p.id,{decision:'approve',reviewer:'human'});ids.push((approveBoth(core,p.id),core.commit(p.id)).id);
  }
  const all=[];let cursor=null;for(let i=0;i<10;i++){
   const page=core.pageMemories({scope:'personal',slot:'S05',limit:2,cursor});
   all.push(...page.rows.map(r=>r.id));if(!page.has_more){assert.equal(page.next_cursor,null);break}assert.ok(page.next_cursor);cursor=page.next_cursor;
  }
  assert.equal(all.length,7);assert.equal(new Set(all).size,7);
  assert.equal(core.pageMemories({scope:'other',slot:'S05'}).rows.length,0);
  core.revoke({scope:'personal',kind:'source',target:'src-3',reason:'withdraw'});
  const visible=[];cursor=null;for(let i=0;i<10;i++){
   const page=core.pageMemories({scope:'personal',slot:'S05',limit:2,cursor});visible.push(...page.rows.map(r=>r.id));if(!page.has_more)break;cursor=page.next_cursor;
  }
  assert.equal(visible.length,6);assert.ok(!visible.includes(ids[3]));
  assert.throws(()=>core.pageMemories({scope:'personal',limit:101}),/limit/);
  assert.throws(()=>core.pageMemories({scope:'personal',cursor:'bad'}),/游标/);
 }finally{core.close();fs.rmSync(dir,{recursive:true,force:true})}
});
