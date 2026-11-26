// Derived, opt-in index of canonical current records. No model calls, no raw S01 indexing.
import {createHash} from 'node:crypto';
export const tokenizeD14=s=>{const lower=s.toLowerCase(),words=lower.match(/[a-z0-9_]{2,}/g)||[];for(const phrase of lower.match(/[\p{Script=Han}]+/gu)||[]){const chars=Array.from(phrase);if(chars.length===1)words.push(chars[0]);else for(let i=0;i<chars.length-1;i++)words.push(chars[i]+chars[i+1]);}return words;};
const token=s=>'t'+Buffer.from(s).toString('hex');
const scopeToken=s=>'s'+createHash('sha256').update(s).digest('hex');
export function installIndexed(db){db.exec(`BEGIN IMMEDIATE;
CREATE TABLE IF NOT EXISTS d14c_meta(version INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS d14c_dirty(scope TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,PRIMARY KEY(scope,id,revision));
CREATE TABLE IF NOT EXISTS d14c_keys(k INTEGER PRIMARY KEY AUTOINCREMENT,scope TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,UNIQUE(scope,id,revision));
CREATE VIRTUAL TABLE IF NOT EXISTS d14c_fts USING fts5(tenant,tokens, tokenize='ascii');
CREATE INDEX IF NOT EXISTS ix_d14c_temporal ON memories(scope,state,json_extract(payload,'$.temporal.key'));
INSERT OR IGNORE INTO d14c_dirty SELECT scope,id,revision FROM memories WHERE state='current' AND NOT EXISTS(SELECT 1 FROM d14c_meta WHERE version=1);
INSERT OR IGNORE INTO d14c_meta VALUES(1);
CREATE TRIGGER IF NOT EXISTS d14c_insert AFTER INSERT ON memories BEGIN
 INSERT OR IGNORE INTO d14c_dirty VALUES(new.scope,new.id,new.revision); END;
CREATE TRIGGER IF NOT EXISTS d14c_update AFTER UPDATE OF state,payload,sources,scope,id,revision ON memories BEGIN
 DELETE FROM d14c_fts WHERE rowid IN(SELECT k FROM d14c_keys WHERE scope=old.scope AND id=old.id AND revision=old.revision);
 INSERT OR IGNORE INTO d14c_dirty VALUES(old.scope,old.id,old.revision);
 INSERT OR IGNORE INTO d14c_dirty VALUES(new.scope,new.id,new.revision); END;
CREATE TRIGGER IF NOT EXISTS d14c_delete AFTER DELETE ON memories BEGIN
 DELETE FROM d14c_fts WHERE rowid IN(SELECT k FROM d14c_keys WHERE scope=old.scope AND id=old.id AND revision=old.revision);
 INSERT OR IGNORE INTO d14c_dirty VALUES(old.scope,old.id,old.revision); END;
COMMIT;`);}
export function pendingIndex(db,scope,limit=129){return scope===undefined?db.prepare('SELECT * FROM d14c_dirty ORDER BY scope,id,revision LIMIT ?').all(limit):db.prepare('SELECT * FROM d14c_dirty WHERE scope=? ORDER BY id,revision LIMIT ?').all(scope,limit);}
const validSQL=`NOT EXISTS (SELECT 1 FROM json_each(m.sources) j WHERE NOT EXISTS (SELECT 1 FROM sources s WHERE s.id=j.value AND s.scope=m.scope AND s.revoked=0))`;
// Caller owns transaction. Acknowledge only after derived writes, no lost writes on restart.
export function syncIndex(db,rows){const current=db.prepare(`SELECT payload FROM memories m WHERE m.scope=? AND m.id=? AND m.revision=? AND m.state='current' AND ${validSQL}`),key=db.prepare('SELECT k FROM d14c_keys WHERE scope=? AND id=? AND revision=?'),put=db.prepare('INSERT OR IGNORE INTO d14c_keys(scope,id,revision) VALUES(?,?,?)'),del=db.prepare('DELETE FROM d14c_fts WHERE rowid=?'),drop=db.prepare('DELETE FROM d14c_keys WHERE k=?'),write=db.prepare('INSERT INTO d14c_fts(rowid,tenant,tokens) VALUES(?,?,?)'),ack=db.prepare('DELETE FROM d14c_dirty WHERE scope=? AND id=? AND revision=?');for(const r of rows){const args=[r.scope,r.id,r.revision],m=current.get(...args);let k=key.get(...args)?.k;if(k!==undefined)del.run(k);if(m){if(k===undefined){put.run(...args);k=key.get(...args).k;}write.run(k,scopeToken(r.scope),tokenizeD14(m.payload).map(token).join(' '));}else if(k!==undefined)drop.run(k);ack.run(...args);}return rows.length;}
export function indexBatch(db,{scope,limit=128}={}){if(!Number.isInteger(limit)||limit<1||limit>1000)throw Error('invalid index batch');db.exec('BEGIN IMMEDIATE');try{const n=syncIndex(db,pendingIndex(db,scope,limit));db.exec('COMMIT');return n;}catch(e){db.exec('ROLLBACK');throw e;}}
export function indexCandidates(db,{scope,query,cap=100}){const terms=[...new Set(tokenizeD14(query))];if(terms.length>64)return null;if(!terms.length)return [];const q='tenant:'+scopeToken(scope)+' AND tokens:('+terms.map(t=>'"'+token(t)+'"').join(' OR ')+')';return db.prepare(`SELECT m.*,bm25(d14c_fts,0,1) AS rank FROM d14c_fts JOIN d14c_keys k ON k.k=d14c_fts.rowid JOIN memories m ON m.id=k.id AND m.revision=k.revision AND m.scope=k.scope WHERE d14c_fts MATCH ? AND k.scope=? AND m.state='current' AND ${validSQL} ORDER BY rank,m.id LIMIT ?`).all(q,scope,cap);}
export function indexedCurrent(db,scope,id,revision){return db.prepare(`SELECT m.* FROM memories m WHERE m.scope=? AND m.id=? AND m.revision=? AND m.state='current' AND ${validSQL}`).get(scope,id,revision);}
export function indexedPeers(db,scope,key){return db.prepare(`SELECT m.* FROM memories m WHERE m.scope=? AND m.state='current' AND json_extract(m.payload,'$.temporal.key')=? AND ${validSQL} ORDER BY m.id`).all(scope,key);}
