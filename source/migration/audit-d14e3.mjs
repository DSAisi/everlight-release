// Read-only diagnostic for an explicitly supplied, checkpointed isolated core copy.
import {DatabaseSync} from 'node:sqlite';
import {lstatSync,existsSync,realpathSync,mkdtempSync,copyFileSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {SLOT_RULES,checkProposalShape} from '../protocol/portable-v1.mjs';
const parse=v=>{try{return JSON.parse(v)}catch{return null}};
const physical=['episode','fact_rev','identity','affect','atlas_file','person','raw_event'];
export function audit(file){
 const path=resolve(file),st=lstatSync(path);
 if(!st.isFile()||st.nlink!==1||realpathSync(path)!==path||['-wal','-shm','-journal'].some(s=>existsSync(path+s)))throw Error('requires standalone checkpointed copy, no links or sidecars');
 // SQLite may create WAL sidecars even for read-only open. Audit a private scratch copy instead.
 const scratch=mkdtempSync(join(tmpdir(),'everlight-e3-audit-'));let db;
 try{
 const dest=join(scratch,'core.sqlite');copyFileSync(path,dest);chmodSync(dest,0o600);const after=lstatSync(path);
 if(after.size!==st.size||after.mtimeMs!==st.mtimeMs||after.ino!==st.ino||['-wal','-shm','-journal'].some(s=>existsSync(path+s)))throw Error('input changed during snapshot');
 db=new DatabaseSync(dest,{readOnly:true});
 db.exec('PRAGMA query_only=ON; BEGIN');
 const tables=new Set(db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all().map(r=>r.name));
 const inventory=Object.fromEntries(physical.map(n=>[n,tables.has(n)?db.prepare(`SELECT count(*) n FROM "${n}"`).get().n:null]));
 const out={schema:'everlight.audit.d14e3.v1',production_approved:false,canonical_store:'memories',host_injection_verified:false,legacy_physical_counts:inventory,slots:Object.fromEntries(Object.keys(SLOT_RULES).map(s=>[s,{proposals:{},memory_states:{}}])),issues:{},next_actions:[]};
 const issue=k=>{out.issues[k]=(out.issues[k]||0)+1};
 if(!['proposals','memories','sources','receipts'].every(t=>tables.has(t))){out.schema_supported=false;out.next_actions.push('STOP: obtain actual host schema and mapping; do not infer from reference tables');return out;}
 const expected={proposals:['id','slot','kind','scope','payload','sources','state','reason','idem'],memories:['id','revision','slot','kind','scope','payload','sources','state','proposal_id'],sources:['id','scope','revoked'],receipts:['op','scope','subject','result','details']};
 if(Object.entries(expected).some(([t,cols])=>{const actual=new Set(db.prepare(`PRAGMA table_info(${t})`).all().map(r=>r.name));return cols.some(c=>!actual.has(c))})){out.schema_supported=false;out.next_actions.push('STOP: incompatible canonical schema');return out;}
 out.schema_supported=true;
 const allowed=(slot,kind)=>Object.hasOwn(SLOT_RULES,slot)&&SLOT_RULES[slot].write==='proposal_review_commit'&&SLOT_RULES[slot].kind.includes(kind);
 const states=['pending','approved_pending_commit','committed','rejected'];
 const bump=(obj,k)=>obj[k]=(obj[k]||0)+1;
 const findProposal=db.prepare('SELECT * FROM proposals WHERE id=?');
 const findSource=db.prepare('SELECT scope,revoked FROM sources WHERE id=?');
 const receipts=new Map();
 const key=(scope,id,revision,pid,slot)=>JSON.stringify([scope,id,revision,pid,slot]);
 for(const r of db.prepare("SELECT scope,subject,details FROM receipts WHERE op='memory.commit' AND result='ok'").iterate()){
  const d=parse(r.details);if(!d||!d.proposalId||!Number.isInteger(d.revision)||!d.slot){issue('malformed_commit_receipt');continue;}bumpReceipt(key(r.scope,r.subject,d.revision,d.proposalId,d.slot));
 }
 function bumpReceipt(k){receipts.set(k,(receipts.get(k)||0)+1)}
 const linked=new Map();
 for(const m of db.prepare('SELECT * FROM memories').iterate()){
  const group=Object.hasOwn(out.slots,m.slot)?out.slots[m.slot]:null;
  if(group)bump(group.memory_states,['current','superseded','revoked'].includes(m.state)?m.state:'unknown');
  if(!allowed(m.slot,m.kind))issue('memory_kind_slot_mismatch');
  if(!['current','superseded','revoked'].includes(m.state))issue('unknown_memory_state');
  linked.set(m.proposal_id,(linked.get(m.proposal_id)||0)+1);
  const p=findProposal.get(m.proposal_id);
  if(!p)issue('memory_without_proposal');else if(p.state!=='committed'||p.scope!==m.scope||p.slot!==m.slot||p.kind!==m.kind||p.payload!==m.payload||p.sources!==m.sources)issue('canonical_proposal_mismatch');
  const rk=key(m.scope,m.id,m.revision,m.proposal_id,m.slot),n=receipts.get(rk)||0;
  if(n!==1)issue(n===0?'memory_without_commit_receipt':'duplicate_commit_receipt');receipts.delete(rk);
  const refs=parse(m.sources);
  if(!Array.isArray(refs)||!refs.length||refs.some(x=>typeof x!=='string'||!x.trim()))issue('invalid_memory_sources');
  else if(m.state==='current'&&refs.some(x=>{const s=findSource.get(x);return !s||s.scope!==m.scope||s.revoked!==0}))issue('current_memory_invalid_source');
 }
 for(const _ of receipts)issue('commit_receipt_without_memory');
 for(const p of db.prepare('SELECT * FROM proposals').iterate()){
  if(Object.hasOwn(out.slots,p.slot))bump(out.slots[p.slot].proposals,states.includes(p.state)?p.state:'unknown');
  if(!states.includes(p.state))issue('unknown_proposal_state');
  if(!checkProposalShape({slot:p.slot,kind:p.kind,scope:p.scope,payload:parse(p.payload),source_refs:parse(p.sources),reason:p.reason,idempotency_key:p.idem}).ok)issue('proposal_contract_mismatch');
  const n=linked.get(p.id)||0;
  if(p.state==='committed'&&n!==1)issue(n===0?'committed_without_memory':'committed_multiple_memories');
  if(p.state!=='committed'&&n)issue('uncommitted_with_memory');
  if(p.state==='approved_pending_commit')issue('approved_waiting_for_commit');
 }
 for(const _ of db.prepare("SELECT id FROM memories WHERE state='current' GROUP BY id HAVING count(*)>1").iterate())issue('multiple_current_revisions');
 out.source_count=db.prepare('SELECT count(*) n FROM sources').get().n;
 out.integrity_pass=Object.keys(out.issues).every(k=>k==='approved_waiting_for_commit');
 out.next_actions.push('Compare canonical rows and commit receipts, not legacy table counts.');
 if(out.issues.approved_waiting_for_commit)out.next_actions.push('Inspect independent approvals and commit recovery; do not auto approve.');
 if(!out.integrity_pass)out.next_actions.push('STOP migration; diagnose on isolated copy, no automatic repair.');
 return out;
 }finally{try{db?.close()}finally{rmSync(scratch,{recursive:true,force:true})}}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){try{const [flag,file]=process.argv.slice(2);if(flag!=='--offline-copy'||!file||process.argv.length!==4)throw Error('usage: node migration/audit-d14e3.mjs --offline-copy /absolute/path/to/checkpointed-copy.sqlite');const r=audit(file);console.log(JSON.stringify(r,null,2));if(!r.schema_supported||!r.integrity_pass)process.exitCode=2;}catch(e){console.error('AUDIT_STOP: '+e.message);process.exitCode=1;}}
