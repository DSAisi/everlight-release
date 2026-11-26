// Derived index only. Transactional triggers track every canonical revision.
export function installVectorOutbox(db){db.exec(`
CREATE TABLE IF NOT EXISTS vector_outbox(seq INTEGER PRIMARY KEY AUTOINCREMENT,scope TEXT NOT NULL,id TEXT NOT NULL,revision INTEGER NOT NULL,op TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS vector_offsets(scope TEXT NOT NULL,consumer TEXT NOT NULL,seq INTEGER NOT NULL,PRIMARY KEY(scope,consumer));
CREATE TABLE IF NOT EXISTS vector_initialized(flag INTEGER PRIMARY KEY);
BEGIN IMMEDIATE;
INSERT INTO vector_outbox(scope,id,revision,op) SELECT scope,id,revision,CASE WHEN state='current' THEN 'upsert' ELSE 'delete' END FROM memories WHERE NOT EXISTS(SELECT 1 FROM vector_initialized) ORDER BY id,revision;
INSERT OR IGNORE INTO vector_initialized VALUES(1);
CREATE TRIGGER IF NOT EXISTS vector_insert AFTER INSERT ON memories BEGIN INSERT INTO vector_outbox(scope,id,revision,op) VALUES(new.scope,new.id,new.revision,CASE WHEN new.state='current' THEN 'upsert' ELSE 'delete' END); END;
CREATE TRIGGER IF NOT EXISTS vector_update AFTER UPDATE OF state ON memories WHEN old.state<>new.state BEGIN INSERT INTO vector_outbox(scope,id,revision,op) VALUES(new.scope,new.id,new.revision,CASE WHEN new.state='current' THEN 'upsert' ELSE 'delete' END); END;
COMMIT;`)}
export function vectorPage(db,{scope,consumer,limit=25}){
 if(!scope||!consumer||!Number.isInteger(limit)||limit<1||limit>100)throw Object.assign(Error('invalid vector cursor'),{status:422});
 const offset=db.prepare('SELECT seq FROM vector_offsets WHERE scope=? AND consumer=?').get(scope,consumer)?.seq??0;
 const rows=db.prepare('SELECT * FROM vector_outbox WHERE scope=? AND seq>? ORDER BY seq LIMIT ?').all(scope,offset,limit);
 return {offset,rows:rows.map(r=>{const m=db.prepare("SELECT * FROM memories WHERE scope=? AND id=? AND revision=? AND state='current'").get(scope,r.id,r.revision);return {...r,op:m&&r.op==='upsert'?'upsert':'delete',...(m&&r.op==='upsert'?{slot:m.slot,kind:m.kind,payload:JSON.parse(m.payload)}:{})}})};
}
export function vectorAck(db,{scope,consumer,expected,seq}){
 const page=vectorPage(db,{scope,consumer,limit:1});if(page.offset!==expected||page.rows[0]?.seq!==seq)throw Object.assign(Error('vector cursor conflict'),{status:409});
 db.prepare('INSERT INTO vector_offsets VALUES(?,?,?) ON CONFLICT(scope,consumer) DO UPDATE SET seq=excluded.seq').run(scope,consumer,seq);return {seq};
}
