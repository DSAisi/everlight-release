// D6 derived index. Never changes source bytes or treats a reference as a direct hit.
// Counts distinct recall runs; snapshot_verified reflects the currently stored readback state.
const hits=(from,where)=>`INSERT OR IGNORE INTO recall_activity_d6(scope,kind,target,revision,run_id,at)
 SELECT r.scope,'memory_hit',json_extract(j.value,'$.id'),0,r.id,r.at FROM ${from} CROSS JOIN json_each(r.hits) j
 WHERE ${where} AND j.type='object' AND json_type(j.value,'$.id')='text';`;
const selected=(from,where)=>`INSERT OR IGNORE INTO recall_activity_d6(scope,kind,target,revision,run_id,at)
 SELECT r.scope,'memory_selected',m.id,m.revision,r.id,r.at FROM ${from} CROSS JOIN json_each(r.selected) j
 CROSS JOIN memories m ON m.scope=r.scope AND m.id=json_extract(j.value,'$.id') AND m.revision=json_extract(j.value,'$.revision')
 WHERE ${where} AND j.type='object';`;
const indirect=(from,where)=>`INSERT OR IGNORE INTO recall_activity_d6(scope,kind,target,revision,run_id,at)
 SELECT r.scope,'source_indirect',s.id,0,r.id,r.at FROM ${from} CROSS JOIN json_each(r.selected) j
 CROSS JOIN memories m ON m.scope=r.scope AND m.id=json_extract(j.value,'$.id') AND m.revision=json_extract(j.value,'$.revision')
 CROSS JOIN json_each(m.sources) ref CROSS JOIN sources s ON s.scope=r.scope AND s.id=ref.value
 WHERE ${where} AND j.type='object' AND ref.type='text';`;
export function installRecallActivity(db){
 db.exec('BEGIN IMMEDIATE');
 try{
  db.exec('CREATE TABLE IF NOT EXISTS recall_activity_meta_d6(version INTEGER PRIMARY KEY, built_at TEXT NOT NULL)');
  if(!db.prepare('SELECT 1 FROM recall_activity_meta_d6 WHERE version=2').get())db.exec('DROP TRIGGER IF EXISTS recall_activity_d6_insert; DROP TRIGGER IF EXISTS recall_activity_d6_change;');
  db.exec(`CREATE TABLE IF NOT EXISTS recall_activity_d6(scope TEXT NOT NULL,kind TEXT NOT NULL,target TEXT NOT NULL,revision INTEGER NOT NULL,run_id TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(scope,kind,target,revision,run_id));
  CREATE INDEX IF NOT EXISTS ix_recall_activity_d6_recent ON recall_activity_d6(scope,kind,target,revision,at DESC,run_id DESC);
  CREATE INDEX IF NOT EXISTS ix_recall_activity_d6_run ON recall_activity_d6(run_id);
  CREATE TABLE IF NOT EXISTS recall_activity_meta_d6(version INTEGER PRIMARY KEY, built_at TEXT NOT NULL);
  CREATE TRIGGER IF NOT EXISTS recall_activity_d6_insert AFTER INSERT ON recall_runs BEGIN
   ${hits('recall_runs r','r.id=NEW.id')}${selected('recall_runs r','r.id=NEW.id')}${indirect('recall_runs r','r.id=NEW.id')}
  END;
  CREATE TRIGGER IF NOT EXISTS recall_activity_d6_delete AFTER DELETE ON recall_runs BEGIN DELETE FROM recall_activity_d6 WHERE run_id=OLD.id; END;
  CREATE TRIGGER IF NOT EXISTS recall_activity_d6_change AFTER UPDATE OF hits,selected,scope,at,id ON recall_runs BEGIN
   DELETE FROM recall_activity_d6 WHERE run_id=OLD.id;
   ${hits('recall_runs r','r.id=NEW.id')}${selected('recall_runs r','r.id=NEW.id')}${indirect('recall_runs r','r.id=NEW.id')}
  END;`);
  if(!db.prepare('SELECT 1 FROM recall_activity_meta_d6 WHERE version=1').get()){
   db.exec(`DELETE FROM recall_activity_d6;${hits('recall_runs r','1=1')}${selected('recall_runs r','1=1')}${indirect('recall_runs r','1=1')}`);
   db.prepare('INSERT INTO recall_activity_meta_d6 VALUES(1,?)').run(new Date().toISOString());
  }
  db.prepare('INSERT OR IGNORE INTO recall_activity_meta_d6 VALUES(2,?)').run(new Date().toISOString());
  db.exec('COMMIT');
 }catch(e){db.exec('ROLLBACK');throw e;}
}
function measure(db,scope,kind,target,revision){
 return db.prepare(`SELECT count(*) AS n,max(a.at) AS last,coalesce(sum(CASE WHEN r.actual_state='request_snapshot_verified' THEN 1 ELSE 0 END),0) AS verified
 FROM recall_activity_d6 a JOIN recall_runs r ON r.id=a.run_id AND r.scope=a.scope WHERE a.scope=? AND a.kind=? AND a.target=? AND a.revision=?`).get(scope,kind,target,revision);
}
function history(db,scope,kind,target,revision){
 return db.prepare(`SELECT a.run_id,a.at,r.actual_state FROM recall_activity_d6 a JOIN recall_runs r ON r.id=a.run_id AND r.scope=a.scope
 WHERE a.scope=? AND a.kind=? AND a.target=? AND a.revision=? ORDER BY a.at DESC,a.run_id DESC LIMIT 20`).all(scope,kind,target,revision);
}
export function memoryActivity(db,scope,id,revision){
 const h=measure(db,scope,'memory_hit',id,0),s=measure(db,scope,'memory_selected',id,revision);
 return {statistics:'indexed_d6',hit_count:h.n,last_hit:h.last,selected_count:s.n,last_selected:s.last,snapshot_verified_count:s.verified,recall_history:history(db,scope,'memory_selected',id,revision),history_limit:20};
}
export function sourceActivity(db,scope,id){
 const s=measure(db,scope,'source_indirect',id,0);
 return {statistics:'indexed_d6',direct_status:'not_enabled',direct_count:null,last_direct:null,indirect_selected_count:s.n,last_indirect_selected:s.last,indirect_snapshot_verified_count:s.verified,recall_history:history(db,scope,'source_indirect',id,0),history_limit:20,upstream_delivery_verified:false};
}
