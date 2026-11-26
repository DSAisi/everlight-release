import test from 'node:test';import assert from 'node:assert/strict';import {EverlightCore} from '../core/engine.mjs';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';
test('S01 occurrence order: backfill, timezone, ties, unknown, revocation, scoped cursor, reopen and read-only original',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'everlight-d3-'));const file=path.join(dir,'core.sqlite');let c;
 try{c=new EverlightCore(file);const add=(id,body,scope='personal')=>c.source({source_id:id,scope,actor:'register',kind:'raw_event',source_ref:'fixture:'+id,body});
 add('recent',{text:'d3 sample',happened_at:'2026-11-25T02:00:00+08:00'});
 add('tie-z',{text:'d3 sample',happened_at:'2026-11-24T18:00:00Z'});
 add('older',{text:'d3 sample',happened_at:'2026-09-01T10:00:00Z'});
 add('late-old',{text:'d3 sample',happened_at:'2026-08-01T10:00:00Z'});
 add('fallback',{text:'d3 sample',happened_at:'bad',occurred_at:'2026-10-01T00:00:00Z'});
 add('no-zone',{text:'d3 sample',happened_at:'2026-12-01T01:00:00'});
 add('invalid',{text:'d3 sample',happened_at:'2026-02-30T01:00:00Z'});
 add('literal','{"text":"d3 sample","happened_at":"2099-01-01T00:00:00Z"}');
 add('secret',{text:'d3 sample',happened_at:'2099-01-01T00:00:00Z'},'other');
 add('revoked',{text:'d3 sample',happened_at:'2099-01-01T00:00:00Z'});c.db.prepare('UPDATE sources SET revoked=1 WHERE id=?').run('revoked');
 const original=c.db.prepare('SELECT id,body,hash,at FROM sources ORDER BY id').all();
 const list=()=>{let all=[],cursor;do{const p=c.pageLedger({scope:'personal',slot:'S01',limit:2,cursor});assert.equal(p.order,'event_time_desc_unknown_last');all.push(...p.rows);cursor=p.next_cursor;}while(cursor);return all;};
 let rows=list();assert.deepEqual(rows.slice(0,5).map(x=>x.id),['tie-z','recent','fallback','older','late-old']);assert.equal(rows.length,8);assert.equal(new Set(rows.map(x=>x.id)).size,8);assert.ok(rows.slice(5).every(x=>x.happened_at===null));assert.equal(rows[1].happened_at,'2026-11-24T18:00:00.000Z');
 assert.equal(c.ledgerDetail({scope:'personal',slot:'S01',id:'recent'}).body.happened_at,'2026-11-25T02:00:00+08:00');
 assert.deepEqual(c.dashboardRecords({scope:'personal',slot:'S01',query:'d3 sample'}).rows.map(x=>x.id),rows.map(x=>x.id));
 assert.throws(()=>c.pageLedger({scope:'personal',slot:'S01',cursor:Buffer.from(JSON.stringify(['S01','personal','x','y'])).toString('base64url')}),/游标/);
 const cursor=c.pageLedger({scope:'personal',slot:'S01',limit:1}).next_cursor;assert.throws(()=>c.pageLedger({scope:'other',slot:'S01',cursor}),/游标/);
 assert.deepEqual(c.db.prepare('SELECT id,body,hash,at FROM sources ORDER BY id').all(),original);c.db.close();c=new EverlightCore(file);assert.deepEqual(list().map(x=>x.id),rows.map(x=>x.id));
 assert.ok(c.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='ix_source_event_order_d3'").get());
 }finally{c?.db.close();rmSync(dir,{recursive:true,force:true})}
});
