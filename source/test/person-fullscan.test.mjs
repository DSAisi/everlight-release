import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {EverlightCore} from '../core/engine.mjs';
test('person preview finds old matches beyond 5000 unrelated rows and excludes revoked sources',()=>{
 const dir=mkdtempSync(join(tmpdir(),'everlight-fullperson-'));
 try{
  const c=new EverlightCore(join(dir,'db.sqlite'));
  const person=c.relationPerson({scope:'personal',label:'Test'});
  const source=c.source({scope:'personal',actor:'human',kind:'message',source_ref:'test:1',body:'evidence'}).id;
  const stmt=c.db.prepare('INSERT INTO memories VALUES(?,?,?,?,?,?,?,?,?,?)');
  stmt.run('old',1,'S07','relationship','personal',JSON.stringify({subject:person.id,relation:'knows',object:'other',summary:'old matching memory'}),JSON.stringify([source]),'current','2020-01-01T00:00:00.000Z','p-old');
  for(let i=0;i<5005;i++)stmt.run('noise-'+i,1,'S07','relationship','personal',JSON.stringify({subject:'someone-else',relation:'knows',object:'other'}),JSON.stringify([source]),'current','2026-01-01T00:00:00.000Z','p-'+i);
  assert.equal(c.personMemories({scope:'personal',person_id:person.id}).items[0].memory_id,'old');
  c.revoke({scope:'personal',kind:'source',target:source,reason:'withdrawn'});
  assert.equal(c.personMemories({scope:'personal',person_id:person.id}).items.length,0);
  c.close?.();
 }finally{rmSync(dir,{recursive:true,force:true})}
});
