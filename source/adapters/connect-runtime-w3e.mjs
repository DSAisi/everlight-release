import {DatabaseSync} from 'node:sqlite';
import {chmodSync} from 'node:fs';
import {openInbox} from './connect-inbox-w3e.mjs';
import {connectClient} from './connect-e12.mjs';
// One host-local durable dispatcher. Callback must deduplicate durably; no event bodies on disk.
export function openConnectRuntime({url,token,scope,file,cursorFile,fetchImpl,unified=false,reportAcceptance=unified,now=Date.now}) {
 if(!file||!cursorFile||file===cursorFile||!scope)throw Error('two dedicated local files and scope required');
 const client=connectClient({url,token,fetchImpl,unified}),db=new DatabaseSync(file);chmodSync(file,0o600);
 db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS runtime_scope(scope TEXT PRIMARY KEY); CREATE TABLE IF NOT EXISTS delivery(seq INTEGER PRIMARY KEY,state TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,due INTEGER NOT NULL DEFAULT 0,updated INTEGER NOT NULL);`);
 const old=db.prepare('SELECT scope FROM runtime_scope').get();if(old&&old.scope!==scope){db.close();throw Error('runtime scope mismatch');}if(!old)db.prepare('INSERT INTO runtime_scope VALUES(?)').run(scope);
 const inbox=openInbox({url,token,scope,file:cursorFile,fetchImpl,unified});let busy=false,closed=false,timer=null;
 async function tick({dispatch,limit=50}={}){
  if(closed||busy||typeof dispatch!=='function'||!Number.isSafeInteger(limit)||limit<1||limit>100)throw Error('invalid or busy runtime');busy=true;
  try{
   const ingest=await inbox.tick({handle:async e=>{db.prepare("INSERT OR IGNORE INTO delivery(seq,state,updated) VALUES(?,'queued',?)").run(e.seq,now());}});
   const rows=db.prepare("SELECT * FROM delivery WHERE state IN ('queued','retry','accepted_unreported') AND due<=? ORDER BY seq LIMIT ?").all(now(),limit);
   for(const r of rows){let accepted=r.state==='accepted_unreported';try{
    if(accepted){await client.receipt(r.seq);db.prepare("UPDATE delivery SET state='host_accepted',updated=? WHERE seq=?").run(now(),r.seq);continue;}
    const page=await client.inbox({after:r.seq-1,limit:1});const e=page.items[0];
    if(!e||e.seq!==r.seq)throw Error('event unavailable; check database identity');
    if(!e.active){db.prepare("UPDATE delivery SET state='skipped',updated=? WHERE seq=?").run(now(),r.seq);continue;}
    await dispatch(e,{idempotencyKey:`everlight:${scope}:${r.seq}`,mode:e.wake?'wake':'sync'});
    if(reportAcceptance){db.prepare("UPDATE delivery SET state='accepted_unreported',updated=? WHERE seq=?").run(now(),r.seq);accepted=true;await client.receipt(r.seq);}
    db.prepare("UPDATE delivery SET state='host_accepted',attempts=attempts+1,updated=? WHERE seq=?").run(now(),r.seq);
   }catch{const attempts=r.attempts+1;db.prepare("UPDATE delivery SET state=?,attempts=?,due=?,updated=? WHERE seq=?").run(accepted?'accepted_unreported':'retry',attempts,now()+Math.min(300000,1000*2**Math.min(attempts,8)),now(),r.seq);}}
   return {ingest,counts:status(),model_delivery_verified:false};
  }finally{busy=false;}
 }
 function status(){return Object.fromEntries(db.prepare('SELECT state,count(*) AS n FROM delivery GROUP BY state').all().map(r=>[r.state,r.n]));}
 return {tick,status,start({dispatch,intervalMs=3000,onError=()=>{}}={}){if(closed||timer||typeof dispatch!=='function'||!Number.isSafeInteger(intervalMs)||intervalMs<250)throw Error('invalid scheduler');const run=()=>{if(!busy&&!closed)tick({dispatch}).catch(onError);};timer=setInterval(run,intervalMs);run();},stop(){if(timer)clearInterval(timer);timer=null;},close(){if(busy)throw Error('runtime busy');this.stop();inbox.close();db.close();closed=true;}};
}
