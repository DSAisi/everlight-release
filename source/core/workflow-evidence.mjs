import crypto from 'node:crypto';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status})};
const text=(v,n=256)=>typeof v==='string'&&v.trim()&&v.length<=n;
const now=()=>new Date().toISOString();
const hash=v=>crypto.createHash('sha256').update(JSON.stringify(v)).digest('hex');
export function installWorkflowEvidence(db){db.exec(`CREATE TABLE IF NOT EXISTS task_workflow_evidence(id TEXT PRIMARY KEY,scope TEXT NOT NULL,memory_id TEXT NOT NULL,revision INTEGER NOT NULL,kind TEXT NOT NULL,step_id TEXT,source_id TEXT NOT NULL,actor TEXT NOT NULL,detail TEXT NOT NULL,at TEXT NOT NULL,idem TEXT NOT NULL,digest TEXT NOT NULL,UNIQUE(scope,idem)); CREATE INDEX IF NOT EXISTS ix_task_workflow_evidence ON task_workflow_evidence(scope,memory_id,revision); CREATE TABLE IF NOT EXISTS dream_candidate_decisions(scope TEXT NOT NULL,job_id TEXT NOT NULL,candidate_index INTEGER NOT NULL,digest TEXT NOT NULL,decision TEXT NOT NULL,reason TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(scope,job_id,candidate_index));`);if(!db.prepare('PRAGMA table_info(dream_candidate_decisions)').all().some(c=>c.name==='proposal_id'))db.exec('ALTER TABLE dream_candidate_decisions ADD COLUMN proposal_id TEXT');}
export function taskEvidenceView(core,scope,memoryId,revision){
 const rows=core.db.prepare('SELECT id,kind,step_id,source_id,actor,detail,at FROM task_workflow_evidence WHERE scope=? AND memory_id=? AND revision=? ORDER BY rowid').all(scope,memoryId,revision).filter(r=>core.getSource(r.source_id,scope));
 const steps=rows.filter(r=>r.kind==='step_add').map(r=>({...r,verification:rows.find(v=>v.kind==='step_verify'&&v.step_id===r.id)||null}));
 return {steps,deliveries:rows.filter(r=>r.kind==='delivery'),revision,revoked_step_count:core.db.prepare("SELECT COUNT(*) n FROM task_workflow_evidence WHERE scope=? AND memory_id=? AND revision=? AND kind='step_add'").get(scope,memoryId,revision).n-steps.length};
}
// Validates an evidence-backed acceptance, not the existence of an external artifact.
export function validTaskVerification(core,evidence,event,complete){
 const delivery=evidence.deliveries.find(d=>d.id===event.receipt_ref);
 const source=core.getSource(event.source_id, event.scope??complete?.scope??'');
 // taskBoard exposes scope implicitly; caller may pass a projected event without scope.
 return !!(delivery&&complete?.action==='complete'&&complete.revision===event.revision&&event.revision===evidence.revision&&['human','host'].includes(event.actor)&&event.source_id!==delivery.source_id&&event.source_id!==complete.source_id&&evidence.revoked_step_count===0&&evidence.steps.every(s=>s.verification)&&source?.actor===event.actor);
}
export function taskEvidenceWrite(core,b){
 const {scope,memory_id,expected_revision,kind,source_id,actor,detail,idempotency_key}=b;const step_id=b.step_id??null;
 if(![scope,memory_id,source_id,idempotency_key].every(v=>text(v,256))||!Number.isSafeInteger(expected_revision)||expected_revision<1||!text(detail,2000)||!['step_add','step_verify','delivery'].includes(kind)||!['human','ai','host'].includes(actor)|| (kind==='step_verify'?!text(step_id):step_id!==null))fail(422,'invalid workflow evidence');
 return core.tx(()=>{
  const task=core.taskBoard({scope,memory_id,limit:1})[0];if(!task)fail(404,'task missing or revoked');if(task.revision!==expected_revision)fail(409,'task revision changed');
  const src=core.getSource(source_id,scope);if(!src||src.actor!==actor)fail(422,'source missing, revoked or actor mismatch');
  if(kind==='step_verify'&&actor==='ai')fail(403,'AI cannot independently verify its own step');
  const digest=hash([scope,memory_id,expected_revision,kind,step_id,source_id,actor,detail]);
  const old=core.db.prepare('SELECT id,digest FROM task_workflow_evidence WHERE scope=? AND idem=?').get(scope,idempotency_key);
  if(old){if(old.digest!==digest)fail(409,'idempotency conflict');return {id:old.id,idempotent:true,canonicalMemoryChanged:false};}
  if(['done','verified'].includes(task.state)&&kind==='step_add')fail(409,'reopen task before adding steps');
  const v=task.workflow_evidence;
  if(kind==='step_verify'){const step=v.steps.find(s=>s.id===step_id);if(!step)fail(404,'step missing or revoked');if(step.verification)fail(409,'step already verified');if(step.source_id===source_id)fail(422,'new independent evidence required');}
  if(kind==='delivery'&&v.deliveries.some(r=>r.source_id===source_id&&r.detail===detail))fail(409,'delivery already recorded');
  const id=crypto.randomUUID();core.db.prepare('INSERT INTO task_workflow_evidence VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,scope,memory_id,expected_revision,kind,step_id,source_id,actor,detail,now(),idempotency_key,digest);
  return {id,receipt:core.receipt('task.workflow.evidence',scope,memory_id,'ok',{id,kind,source_id,revision:expected_revision}),canonicalMemoryChanged:false,delivery_verified:false};
 });
}
export function dreamCandidates(core,r){return JSON.parse(r.proposals).map((p,index)=>({...p,index,digest:hash(p),decision:core.db.prepare('SELECT decision,reason,at,proposal_id FROM dream_candidate_decisions WHERE scope=? AND job_id=? AND candidate_index=? AND digest=?').get(r.scope,r.id,index,hash(p))||null}));}
export function dreamCandidateWrite(core,{scope,id,index,digest,decision,reason,source_id}){
 if(!text(scope)||!text(id)||!Number.isSafeInteger(index)||index<0||!text(digest,64)||!['reject','defer','propose'].includes(decision)||(decision==='propose'?!text(source_id):source_id!=null&&source_id!=='')||!text(reason,2000))fail(422,'invalid candidate decision');
 return core.tx(()=>{
  const r=core.db.prepare('SELECT * FROM dreams WHERE scope=? AND id=?').get(scope,id);if(!r)fail(404,'dream missing');
  if(!JSON.parse(r.snapshot).source_ids.every(s=>core.getSource(s,scope)))fail(409,'dream evidence revoked');
  const candidate=dreamCandidates(core,r)[index];if(!candidate||candidate.digest!==digest)fail(409,'candidate changed');
  if(candidate.decision){const old=candidate.decision;const sameSource=decision!=='propose'||old.proposal_id&&core.proposalDetail({scope,id:old.proposal_id}).source_refs[0]===source_id;if(old.decision===decision&&old.reason===reason&&sameSource)return {id,index,proposal_id:old.proposal_id,idempotent:true,canonicalMemoryChanged:false};fail(409,'candidate already decided');}
  if(r.state!=='awaiting_review')fail(409,'dream not awaiting review');
  let proposal_id=null;
  if(decision==='propose'){
   const src=core.getSource(source_id,scope);if(!candidate.source_refs.includes(source_id)||!src||src.actor!=='human')fail(422,'select an active human source from this candidate');
   const body=JSON.parse(src.body);if(![body?.subject,body?.field,body?.value].every(v=>text(v,2000)))fail(422,'structured human source required');
   // Preserve source wording as a reported observation, not a definitive resolution.
   const strict=process.env.EVERLIGHT_STRICT_WRITE_D9==='1';
   const payload=strict?{template_version:'everlight.write.d7',contract_version:'everlight.write.d9',category:'lesson',claim:'存在未解决的来源冲突，不能确认当前事实',observation:`${body.subject} / ${body.field}: ${body.value}`,verified_level:'guess',next_action:'核对原始证据及有效时间后另行提交事实修订'}:{subject:body.subject,statement:`${body.field}: ${body.value}`,attribution:'human_source_report',dream_origin:{job_id:id,index,digest,source_id},conflict_unresolved:true};
   const proposal=core.propose({scope,slot:strict?'S11':'S05',kind:strict?'reflection':'fact',payload,source_refs:[source_id,...candidate.source_refs.filter(x=>x!==source_id)],reason,idempotency_key:'dream-candidate:'+hash([scope,id,index,digest])},true);proposal_id=proposal.id;
  }
  core.db.prepare('INSERT INTO dream_candidate_decisions(scope,job_id,candidate_index,digest,decision,reason,at,proposal_id) VALUES(?,?,?,?,?,?,?,?)').run(scope,id,index,digest,decision,reason,now(),proposal_id);
  return {id,index,proposal_id,receipt:core.receipt('dream.candidate.disposition',scope,id,'ok',{index,digest,decision,proposal_id}),canonicalMemoryChanged:false};
 });
}
