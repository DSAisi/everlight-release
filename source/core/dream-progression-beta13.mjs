// Projection from actual proposal and canonical revision rows, never from stage labels.
import {eligibleDreamSource} from './dream-host-beta09.mjs';
const fail=(message,status=422)=>{throw Object.assign(Error(message),{status});};
export function dreamChanges(core,job){
 const scope=job.scope,id=job.id;
 const rows=core.db.prepare(`SELECT p.id proposal_id,p.state proposal_state,p.slot,p.target,p.expected_revision,p.sources,m.id memory_id,m.revision,m.state memory_state,m.created_at committed_at FROM receipts r JOIN proposals p ON p.id=r.subject AND p.scope=r.scope LEFT JOIN memories m ON m.proposal_id=p.id AND m.scope=p.scope WHERE r.scope=? AND r.op IN ('dream.revision','dream.improvement') AND json_extract(r.details,'$.job_id')=? ORDER BY r.at,p.id`).all(scope,id);
 const unique=new Map();for(const row of rows){if(!JSON.parse(row.sources).every(s=>eligibleDreamSource(core,scope,s)))continue;const {sources,...rest}=row;unique.set(row.proposal_id,rest);}
 const changes=[...unique.values()];const checks=core.db.prepare("SELECT details,at FROM receipts WHERE scope=? AND subject=? AND op='dream.recall_replay' ORDER BY at DESC,rowid DESC LIMIT 50").all(scope,id).map(r=>({...JSON.parse(r.details),at:r.at})).filter(r=>changes.some(c=>c.proposal_id===r.proposal_id&&c.memory_state==='current'&&c.revision===r.revision));
 return {changes,canonical_memory_changed:changes.some(c=>c.proposal_state==='committed'&&c.memory_id),recall_replay_verified:checks.some(c=>c.selected_current_revision),recall_replay:checks,behavioral_learning_verified:false};
}
// Compare real persisted retrievals for the exact same query. This verifies retrieval,
// not whether the model understood the memory or improved its behavior.
export function dreamReplay(core,{scope,id,proposal_id,before_run_id,after_run_id}){
 if(![scope,id,proposal_id,before_run_id,after_run_id].every(s=>typeof s==='string'&&s.trim()&&s.length<=256)||before_run_id===after_run_id)fail('invalid replay references');
 return core.tx(()=>{const job=core.db.prepare('SELECT * FROM dreams WHERE scope=? AND id=?').get(scope,id);if(!job)fail('dream missing',404);const snap=JSON.parse(job.snapshot);if(!snap.category||snap.category==='imagined'||!snap.source_ids.every(s=>eligibleDreamSource(core,scope,s)))fail('dream evidence unavailable',409);
 const change=dreamChanges(core,job).changes.find(c=>c.proposal_id===proposal_id);if(!change||change.proposal_state!=='committed'||change.memory_state!=='current'||!change.target)fail('current committed revision required',409);
 const get=rid=>core.db.prepare('SELECT * FROM recall_runs WHERE scope=? AND id=?').get(scope,rid);const a=get(before_run_id),b=get(after_run_id);if(!a||!b||a.query!==b.query||a.at>=change.committed_at||b.at<change.committed_at)fail('same query and actual before/after commit runs required',409);
 const old=JSON.parse(a.selected),next=JSON.parse(b.selected);if(!old.some(x=>x.id===change.memory_id&&x.revision===change.expected_revision))fail('baseline must select old revision',409);
 const selected_current_revision=next.some(x=>x.id===change.memory_id&&x.revision===change.revision)&&!next.some(x=>x.id===change.memory_id&&x.revision!==change.revision);
 const details={proposal_id,memory_id:change.memory_id,revision:change.revision,before_run_id,after_run_id,selected_current_revision,behavioral_learning_verified:false};
 const previous=core.db.prepare("SELECT id FROM receipts WHERE scope=? AND subject=? AND op='dream.recall_replay' AND json_extract(details,'$.proposal_id')=? AND json_extract(details,'$.before_run_id')=? AND json_extract(details,'$.after_run_id')=?").get(scope,id,proposal_id,before_run_id,after_run_id);if(!previous)core.receipt('dream.recall_replay',scope,id,selected_current_revision?'ok':'failed',details);return details;});
}
