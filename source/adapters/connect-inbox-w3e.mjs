import {DatabaseSync} from 'node:sqlite';
import {connectClient} from './connect-e12.mjs';
import {chmodSync} from 'node:fs';
// One host per scope. The host owns model dispatch, never a model credential.
// Store only event IDs, not private content; re-read current projection before dispatch.
export function openInbox({url,token,file,scope,fetchImpl,unified=false}){
 if(!file||!scope)throw Error('dedicated local inbox database and scope required');
 const client=connectClient({url,token,fetchImpl,unified}),db=new DatabaseSync(file);chmodSync(file,0o600);db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS inbox_scope(scope TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS checkpoint(seq INTEGER NOT NULL); INSERT INTO checkpoint SELECT 0 WHERE NOT EXISTS(SELECT 1 FROM checkpoint);');
 const prior=db.prepare('SELECT scope FROM inbox_scope').get();if(prior&&prior.scope!==scope){db.close();throw Error('inbox scope mismatch');}if(!prior)db.prepare('INSERT INTO inbox_scope VALUES(?)').run(scope);
 let busy=false;
 return {async tick({handle,maxPages=10}={}){if(typeof handle!=='function')throw Error('host callback required');if(busy)throw Error('inbox consumer already running');busy=true;try{const m=await client.discover();if(m.scope!==scope||!m.inbox)throw Error('inbox grant not available for scope');let after=db.prepare('SELECT seq FROM checkpoint').get().seq,processed=0;for(let p=0;p<maxPages;p++){const page=await client.inbox({after,limit:50});for(const e of page.items){if(e.active)await handle(e,{idempotencyKey:`everlight:${scope}:${e.seq}`}); // callback must persist durably and deduplicate before returning
 db.prepare('UPDATE checkpoint SET seq=?').run(e.seq);after=e.seq;processed++;}if(!page.has_more)return {after,processed,drained:true,model_delivery_verified:false};}return {after,processed,drained:false,model_delivery_verified:false};}finally{busy=false;}},close(){if(busy)throw Error('consumer busy');db.close();}};
}
