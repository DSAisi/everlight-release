import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {EverlightCore} from '../core/engine.mjs';
test('dashboard search reads beyond legacy 500 rows, keeps scope, pagination and revocation',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'ev-h6-'));const core=new EverlightCore(path.join(dir,'core.sqlite'));
 try{
 const old=core.source({scope:'personal',actor:'human',kind:'message',source_ref:'old',body:{text:'needle_% 演示'}});
 const insert=core.db.prepare('INSERT INTO sources VALUES(?,?,?,?,?,?,?,?,0)');
 core.tx(()=>{for(let i=0;i<530;i++)insert.run('fixture-'+i,'personal','human','message','fixture-'+i,JSON.stringify({text:'ordinary'}),'fixture','2099-01-01T00:00:00.000Z');});
 core.source({scope:'other',actor:'human',kind:'message',source_ref:'other',body:{text:'needle_% 演示'}});
 assert.equal(core.dashboardRecords({scope:'personal',slot:'S01',query:'needle_%'}).rows[0].id,old.id);
 assert.equal(core.dashboardRecords({scope:'personal',slot:'S01',query:'needle_%'}).total,1);
 assert.equal(core.dashboardRecords({scope:'personal',slot:'S01',query:'ordinary',limit:25,offset:525}).rows.length,5);
 assert.equal(core.dashboardRecords({scope:'personal',slot:'S01',query:'ordinary',limit:25}).total,530);
 assert.equal(core.dashboardRecords({scope:'personal',recent:true,limit:1}).rows.length,1);
 assert.throws(()=>core.dashboardRecords({scope:'personal',query:' ',limit:2}));
 assert.throws(()=>core.dashboardRecords({scope:'personal',query:'x',slot:'invalid'}));
 core.revoke({scope:'personal',kind:'source',target:old.id,reason:'test'});
 assert.equal(core.dashboardRecords({scope:'personal',query:'needle_%'}).total,0);
 }finally{core.close();rmSync(dir,{recursive:true,force:true})}
});
