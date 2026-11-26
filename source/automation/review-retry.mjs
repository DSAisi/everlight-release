import {DatabaseSync} from 'node:sqlite';
// Local scheduler ledger; never stores approval authority or candidate text.
export class ReviewRetry {
 constructor(path,{clock=Date.now}={}){if(!path)throw Error('persistent retry path required');this.clock=clock;this.db=new DatabaseSync(path);this.db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS review_retry(scope TEXT,id TEXT,digest TEXT,attempt INTEGER,next_at INTEGER,PRIMARY KEY(scope,id,digest))');}
 claim(scope,id,digest){const t=this.clock();return !!this.db.prepare('INSERT INTO review_retry VALUES(?,?,?,0,?) ON CONFLICT(scope,id,digest) DO UPDATE SET next_at=excluded.next_at WHERE review_retry.next_at<=? RETURNING id').get(scope,id,digest,t+300000,t);}
 finish(scope,id,digest,state){if(state==='decided'||state==='already_decided'||state==='unavailable'){this.db.prepare('DELETE FROM review_retry WHERE scope=? AND id=? AND digest=?').run(scope,id,digest);return;}const r=this.db.prepare('SELECT attempt FROM review_retry WHERE scope=? AND id=? AND digest=?').get(scope,id,digest);const n=(r?.attempt??0)+1;this.db.prepare('UPDATE review_retry SET attempt=?,next_at=? WHERE scope=? AND id=? AND digest=?').run(n,this.clock()+ (state==='deferred'?3600000:Math.min(3600000,30000*2**Math.min(n,7))),scope,id,digest);}
 close(){this.db.close();}
}
