import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const now = () => new Date().toISOString();
export const newId = (prefix) => `${prefix}-${crypto.randomBytes(8).toString('hex')}`;
export const bad = (status, message) => Object.assign(new Error(message), {status});
export const trimmed = (v, n = 1000) => typeof v === 'string' ? v.trim().slice(0,n) : '';
export const parse = (v, fallback=null) => {try{return JSON.parse(v)}catch{return fallback}};

export function openDatabase(file) {
  fs.mkdirSync(path.dirname(file), {recursive:true,mode:0o700});
  const db = new DatabaseSync(file);
  try{fs.chmodSync(file,0o600)}catch{}
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=3000;');
  db.exec(`
  CREATE TABLE IF NOT EXISTS ui_settings (owner TEXT PRIMARY KEY, theme TEXT NOT NULL DEFAULT 'berry',custom_color TEXT,updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS ui_tasks (id TEXT PRIMARY KEY, scope TEXT NOT NULL, record TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS ui_task_events (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL,at TEXT NOT NULL, note TEXT, ref TEXT,FOREIGN KEY(task_id) REFERENCES ui_tasks(id));
  CREATE TABLE IF NOT EXISTS ui_host_receipts (id TEXT PRIMARY KEY, task_id TEXT NOT NULL, kind TEXT NOT NULL, step_index INTEGER, event_id TEXT NOT NULL, source_ref TEXT NOT NULL, trace_id TEXT, result TEXT NOT NULL, occurred_at TEXT NOT NULL, inserted_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS ui_source_events (id TEXT PRIMARY KEY, scope TEXT NOT NULL, actor TEXT NOT NULL, kind TEXT NOT NULL, subject TEXT, field TEXT, value TEXT, source_ref TEXT NOT NULL, effective_at TEXT, revision INTEGER NOT NULL DEFAULT 1, deleted INTEGER NOT NULL DEFAULT 0, inserted_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS ix_ui_source_scope ON ui_source_events(scope,inserted_at);
  CREATE TABLE IF NOT EXISTS ui_dreams (id TEXT PRIMARY KEY,scope TEXT NOT NULL,record TEXT NOT NULL,updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS ui_proposals (id TEXT PRIMARY KEY, job_id TEXT NOT NULL,record TEXT NOT NULL,review_id TEXT,FOREIGN KEY(job_id) REFERENCES ui_dreams(id));
  CREATE TABLE IF NOT EXISTS ui_reviews (id TEXT PRIMARY KEY,proposal_id TEXT NOT NULL, record TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS ui_audit (id TEXT PRIMARY KEY,actor TEXT NOT NULL, action TEXT NOT NULL, target TEXT, at TEXT NOT NULL, result TEXT NOT NULL, details TEXT);
  `);
  return db;
}
export function transaction(db, fn) { db.exec('BEGIN IMMEDIATE');try{const x=fn();db.exec('COMMIT');return x}catch(e){db.exec('ROLLBACK');throw e} }
export function audit(db,actor,action,target,result,details=null){db.prepare('INSERT INTO ui_audit VALUES(?,?,?,?,?,?,?)').run(newId('audit'),actor,action,target,now(),result,details?JSON.stringify(details):null)}
export function getTask(db,id){const r=db.prepare('SELECT record FROM ui_tasks WHERE id=?').get(id);return r?parse(r.record):null}
export function allTasks(db,scope='personal'){return db.prepare('SELECT record FROM ui_tasks WHERE scope=? ORDER BY updated_at DESC').all(scope).map(x=>parse(x.record));}
export function putTask(db,t){db.prepare('INSERT INTO ui_tasks(id,scope,record,revision,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record,revision=excluded.revision,updated_at=excluded.updated_at').run(t.id,t.scope||'personal',JSON.stringify(t),t.revision,t.updatedAt);}
export function getDream(db,id){const r=db.prepare('SELECT record FROM ui_dreams WHERE id=?').get(id);if(!r)return null;const x=parse(r.record);x.proposals=db.prepare('SELECT record FROM ui_proposals WHERE job_id=? ORDER BY rowid').all(id).map(q=>parse(q.record));return x}
export function allDreams(db,scope='personal'){return db.prepare('SELECT id FROM ui_dreams WHERE scope=? ORDER BY updated_at DESC').all(scope).map(x=>getDream(db,x.id));}
export function putDream(db,j){const copy={...j};delete copy.proposals;db.prepare('INSERT INTO ui_dreams(id,scope,record,updated_at) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record,updated_at=excluded.updated_at').run(j.id,j.scope,JSON.stringify(copy),j.updatedAt)}
export function getProposal(db,id){const r=db.prepare('SELECT record FROM ui_proposals WHERE id=?').get(id);return r?parse(r.record):null;}
export function putProposal(db,p){db.prepare('INSERT INTO ui_proposals(id,job_id,record,review_id) VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET record=excluded.record, review_id=excluded.review_id').run(p.id,p.jobId,JSON.stringify(p),p.reviewId||null)}
export function recordTaskEvent(db,t,actor,action,note='',ref=''){db.prepare('INSERT INTO ui_task_events VALUES (?,?,?,?,?,?,?)').run(newId('evt'),t.id,actor,action,now(),note,ref);audit(db,actor,action,t.id,'ok',{ref})}
export function getTaskActivity(db,id){return db.prepare('SELECT at,action,note,actor,ref FROM ui_task_events WHERE task_id=? ORDER BY at').all(id)}
export function getSettings(db,owner='local'){return db.prepare('SELECT theme,custom_color FROM ui_settings WHERE owner=?').get(owner)}
export function getReceipts(db,taskId){return db.prepare('SELECT * FROM ui_host_receipts WHERE task_id=? ORDER BY inserted_at DESC').all(taskId)}
