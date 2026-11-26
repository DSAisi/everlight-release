import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,chmodSync,lstatSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
// Metadata only. Retrying a receipt never repeats a model request.
export function openStrategyOutbox({dbPath,scope,send,clock=Date.now}){
 const p=resolve(dbPath);mkdirSync(dirname(p),{recursive:true,mode:0o700});
 if(existsSync(p)){const s=lstatSync(p);if(!s.isFile()||s.nlink!==1||(s.mode&0o077)!==0)throw Error('private receipt database required');}
 const db=new DatabaseSync(p);chmodSync(p,0o600);
 db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=3000;
 CREATE TABLE IF NOT EXISTS metadata(k TEXT PRIMARY KEY,v TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS pending(ref TEXT PRIMARY KEY,body TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,due INTEGER NOT NULL);
 CREATE INDEX IF NOT EXISTS pending_due ON pending(due,ref);`);
 db.prepare('INSERT OR IGNORE INTO metadata VALUES(?,?)').run('scope',scope);
 if(db.prepare('SELECT v FROM metadata WHERE k=?').get('scope').v!==scope){db.close();throw Error('receipt outbox scope mismatch');}
 let busy=false,closed=false;
 function enqueue(b){const body=JSON.stringify(b),old=db.prepare('SELECT body FROM pending WHERE ref=?').get(b.ref);if(old&&old.body!==body)throw Error('receipt conflict');db.prepare('INSERT OR IGNORE INTO pending(ref,body,due) VALUES(?,?,?)').run(b.ref,body,clock());}
 async function drain(limit=20){if(busy||closed)return {busy:true};busy=true;try{let delivered=0;for(const r of db.prepare('SELECT * FROM pending WHERE due<=? ORDER BY due,ref LIMIT ?').all(clock(),limit)){try{const ack=await send(JSON.parse(r.body));if(typeof ack!=='boolean')throw Error('invalid acknowledgement');db.prepare('DELETE FROM pending WHERE ref=?').run(r.ref);delivered++;}catch{db.prepare('UPDATE pending SET attempts=attempts+1,due=? WHERE ref=?').run(clock()+Math.min(300000,1000*2**Math.min(r.attempts,9)),r.ref);}}return {delivered,pending:db.prepare('SELECT count(*) n FROM pending').get().n};}finally{busy=false;}}
 return {enqueue,drain,count:()=>db.prepare('SELECT count(*) n FROM pending').get().n,close(){if(busy)throw Error('outbox drain in progress');closed=true;db.close();}};
}
