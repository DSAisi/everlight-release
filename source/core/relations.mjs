import {tokenizeD14} from './indexed-retrieval-d14c.mjs';
import {personEventRows} from './person-event-w3h6j.mjs';
import crypto from 'node:crypto';
const uuid=()=>crypto.randomUUID();
const ok=(v)=>typeof v==='string'&&v.trim().length>0;
function bad(message,status=422){const e=new Error(message);e.status=status;throw e}
const norm=(v)=>String(v).trim().normalize('NFKC').toLowerCase();
const stableFields=['person_id','subject_person_id','object_person_id','owner_person_id'];
const genericNames=new Set(['宝宝','老婆','老公','哥哥','姐姐','亲爱的','主人','宝贝','他','她','你','我','baby','honey','darling','dear']);
const nameMatch=(text,name)=>{const n=norm(name);if(n.length<2)return false;const t=norm(text);if(/^[a-z0-9_ -]+$/i.test(n)){const i=t.indexOf(n);for(let j=i;j>=0;j=t.indexOf(n,j+1)){if(!/[a-z0-9_]/i.test(t[j-1]||'')&&!/[a-z0-9_]/i.test(t[j+n.length]||''))return true;}return false;}return t.includes(n);};
const activeNames=(c,scope)=>c.db.prepare("SELECT * FROM relation_names_d8 WHERE scope=? AND state='confirmed' ORDER BY created_at,id").all(scope).filter(n=>!!c.getSource(n.source_id,scope));
const activeAliases=(c,scope)=>c.db.prepare("SELECT * FROM relation_aliases WHERE scope=? AND state='confirmed'").all(scope).filter(a=>!!c.getSource(a.source_id,scope));
const validMemorySQL=`m.state='current' AND NOT EXISTS (SELECT 1 FROM json_each(m.sources) j LEFT JOIN sources s ON s.id=j.value AND s.scope=m.scope AND s.revoked=0 WHERE s.id IS NULL)`;
function relatedRows(c,scope,person,limit){const fields=stableFields.map(k=>`json_extract(m.payload,'$.${k}')=?`);fields.push("EXISTS (SELECT 1 FROM json_each(m.payload,'$.person_ids') WHERE value=?)","EXISTS (SELECT 1 FROM json_each(m.payload,'$.participant_person_ids') WHERE value=?)","(m.slot='S07' AND (json_extract(m.payload,'$.subject')=? OR json_extract(m.payload,'$.object')=?))");return c.db.prepare(`SELECT m.* FROM memories m WHERE m.scope=? AND ${validMemorySQL} AND m.slot IN ('S03','S04','S05','S06','S07','S08','S09','S11') AND (${fields.join(' OR ')}) ORDER BY m.created_at DESC,m.id DESC LIMIT ?`).all(scope,...Array(8).fill(person),limit).map(r=>({...r,payload:JSON.parse(r.payload),sources:JSON.parse(r.sources)}));}
// W2: pure mention resolution; no recall receipt or state mutation.
function mentionMatches(c,scope,text,channel,speaker_person_id){
 const people=c.db.prepare('SELECT id,label FROM relation_people WHERE scope=?').all(scope);
 const aliases=activeAliases(c,scope),names=activeNames(c,scope);
 const knownSpeaker=people.some(p=>p.id===speaker_person_id);
 return people.filter(p=>(!genericNames.has(norm(p.label))&&nameMatch(text,p.label))||aliases.some(a=>a.person_id===p.id&&ok(a.display_name)&&!genericNames.has(norm(a.display_name))&&(!channel||norm(channel)===a.channel)&&nameMatch(text,a.display_name))||names.some(n=>n.person_id===p.id&&n.kind!=='historical'&&(!n.channel||channel&&norm(channel)===n.channel)&&(n.kind!=='address'||knownSpeaker&&n.speaker_person_id===speaker_person_id)&&nameMatch(text,n.name)));
}
// Use stable IDs only. Select a bounded diverse set; do not expand to other people.
export function personRecallLane(c,scope,query,limit=8,intentQuery=query){
 const matches=mentionMatches(c,scope,query);
 if(matches.length!==1)return {rows:[],reason:matches.length?'ambiguous_or_multiple_mentions':'no_known_person_mention'};
 const person=matches[0],cap=Math.min(4,Math.max(1,Math.floor(limit/2)));
 const rows=relatedRows(c,scope,person.id,100);
 const chosen=[],seen=new Set();
 // Identity activates the lane; the current question, not the prior mention,
 // determines which of the person's memories should occupy the limited context.
 const names=[person.label,...activeAliases(c,scope).filter(a=>a.person_id===person.id).map(a=>a.display_name),...activeNames(c,scope).filter(n=>n.person_id===person.id&&n.kind!=='historical').map(n=>n.name)].filter(ok);
 let topic=norm(intentQuery);for(const name of names.sort((a,b)=>b.length-a.length))topic=topic.split(norm(name)).join(' ');
 const terms=[...new Set(tokenizeD14(topic))].filter(t=>t.length>1);
 const score=r=>{const text=norm(['summary','statement','title','content','lesson','reflection','outcome','description','intent','reason','relation'].map(k=>typeof r.payload[k]==='string'?r.payload[k]:'').join(' '));return terms.reduce((n,t)=>n+Number(text.includes(t)),0);};
 const targeted=rows.map((r,i)=>({r,i,score:score(r)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.i-b.i);
 for(const {r} of targeted){if(chosen.length>=cap)break;chosen.push(r);seen.add(r.id);}
 // A concrete topical hit is a sufficient activation: never pad its lane with unrelated biography.
 // A name-only/broad cue still activates diverse relationship history.
 if(!targeted.length){
 for(const slot of ['S07','S04','S03','S11','S05','S08','S06','S09']){
  if(chosen.length>=cap)break;const r=rows.find(r=>r.slot===slot&&!seen.has(r.id));if(r){chosen.push(r);seen.add(r.id);}
 }
 for(const r of rows){if(chosen.length>=cap)break;if(!seen.has(r.id)){chosen.push(r);seen.add(r.id);}}
 }
 const extra=personEventRows(c,scope,person.id,chosen,Math.min(2,Math.max(0,limit-chosen.length)));
 return {rows:[...chosen,...extra],reason:'stable_person_id',person_id:person.id,activation:targeted.length?'topic_evidence':'broad_person',topic_hits:targeted.length,topic_terms:terms,unfilled_slots:Math.max(0,cap-chosen.length),associated_hits:extra.length};
}
export function installRelations(Core){
 Core.prototype.initRelations=function(){this.db.exec(`CREATE TABLE IF NOT EXISTS relation_people(id TEXT PRIMARY KEY,scope TEXT NOT NULL,label TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS relation_aliases(id TEXT PRIMARY KEY,scope TEXT NOT NULL,person_id TEXT NOT NULL,channel TEXT NOT NULL,external_id TEXT NOT NULL,display_name TEXT,source_id TEXT NOT NULL,state TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(scope,channel,external_id));
 CREATE TABLE IF NOT EXISTS relation_identity_reviews(id TEXT PRIMARY KEY,scope TEXT NOT NULL,person_id TEXT NOT NULL,channel TEXT NOT NULL,external_id TEXT NOT NULL,display_name TEXT,source_id TEXT NOT NULL,state TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(scope,channel,external_id,person_id));
 CREATE TABLE IF NOT EXISTS relation_names_d8(id TEXT PRIMARY KEY,scope TEXT NOT NULL,person_id TEXT NOT NULL,name TEXT NOT NULL,kind TEXT NOT NULL,speaker_person_id TEXT,channel TEXT,source_id TEXT NOT NULL,state TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,reviewer TEXT,reviewed_at TEXT,review_reason TEXT);
 CREATE INDEX IF NOT EXISTS ix_relation_names_d8 ON relation_names_d8(scope,state,person_id);
 CREATE INDEX IF NOT EXISTS ix_relation_s07_d8 ON memories(scope,slot,state,created_at,id);`)};
 Core.prototype.relationNameProposal=function({scope,person_id,name,kind,speaker_person_id=null,channel=null,source_id,reason}){
  if(![scope,person_id,name,source_id,reason].every(ok)||name.length>120||!['nickname','historical','address'].includes(kind))bad('invalid name proposal');
  const exists=id=>this.db.prepare('SELECT 1 FROM relation_people WHERE scope=? AND id=?').get(scope,id);
  if(!exists(person_id)||speaker_person_id!==null&&!exists(speaker_person_id))bad('same-scope person required');
  if(kind==='address'&&!ok(speaker_person_id)||kind!=='address'&&speaker_person_id!==null||kind!=='address'&&genericNames.has(norm(name)))bad('relational address requires speaker context');
  if(channel!==null&&!ok(channel))bad('invalid channel');if(!this.getSource(source_id,scope))bad('active source required');
  const prior=this.db.prepare("SELECT * FROM relation_names_d8 WHERE scope=? AND person_id=? AND kind=? AND source_id=? AND state IN ('pending','confirmed')").all(scope,person_id,kind,source_id).find(n=>norm(n.name)===norm(name)&&n.speaker_person_id===speaker_person_id&&n.channel===(channel===null?null:norm(channel)));if(prior)return {id:prior.id,state:prior.state,idempotent:true};
  const id=uuid();this.db.prepare('INSERT INTO relation_names_d8 VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,scope,person_id,name.trim(),kind,speaker_person_id,channel===null?null:norm(channel),source_id,'pending',reason,new Date().toISOString(),null,null,null);return {id,state:'pending'};
 };
 Core.prototype.relationNameDecision=function({scope,id,decision,reviewer,reason}){
  if(![scope,id,reviewer,reason].every(ok)||!['approve','reject','retire'].includes(decision))bad('invalid name decision');
  return this.tx(()=>{const r=this.db.prepare('SELECT * FROM relation_names_d8 WHERE scope=? AND id=?').get(scope,id);if(!r)bad('name not found',404);if(decision==='retire'?r.state!=='confirmed':r.state!=='pending')bad('invalid name state',409);if(decision==='approve'&&!this.getSource(r.source_id,scope))bad('source revoked');const state=decision==='approve'?'confirmed':decision==='reject'?'rejected':'retired';this.db.prepare('UPDATE relation_names_d8 SET state=?,reviewer=?,reviewed_at=?,review_reason=? WHERE id=? AND scope=?').run(state,reviewer,new Date().toISOString(),reason,id,scope);this.receipt('relation.name.'+decision,scope,id,'ok',{reviewer,reason});return {id,state};});
 };
 Core.prototype.relationPerson=function({scope,label}){if(!ok(scope)||!ok(label))bad('scope/label required');const id=uuid();this.db.prepare('INSERT INTO relation_people VALUES(?,?,?,?)').run(id,scope,label,new Date().toISOString());return {id,scope,label}};
 Core.prototype.relationAliasProposal=function({scope,person_id,channel,external_id,display_name='',source_id,reason}){
  if(![scope,person_id,channel,external_id,source_id,reason].every(ok))bad('scope/person_id/channel/external_id/source_id/reason required');
  if(!this.db.prepare('SELECT id FROM relation_people WHERE id=? AND scope=?').get(person_id,scope))bad('person not found',404);
  if(!this.getSource(source_id,scope))bad('active source required');
  const existing=this.db.prepare('SELECT * FROM relation_aliases WHERE scope=? AND channel=? AND external_id=?').get(scope,norm(channel),external_id.trim());
  if(existing){if(existing.person_id!==person_id)bad('channel identity already belongs to another person: manual conflict resolution required',409);return {id:existing.id,state:'confirmed',idempotent:true}}
  const prior=this.db.prepare('SELECT * FROM relation_identity_reviews WHERE scope=? AND channel=? AND external_id=? AND person_id=?').get(scope,norm(channel),external_id.trim(),person_id);
  if(prior)return {id:prior.id,state:prior.state,idempotent:true};
  const id=uuid();this.db.prepare('INSERT INTO relation_identity_reviews VALUES(?,?,?,?,?,?,?,?,?,?)').run(id,scope,person_id,norm(channel),external_id.trim(),display_name,source_id,'pending',reason,new Date().toISOString());return {id,state:'pending',auto_merged:false};
 };
 Core.prototype.relationAliasDecision=function({scope,id,decision,reviewer}){
  if(!ok(scope)||!ok(id)||!ok(reviewer)||!['approve','reject'].includes(decision))bad('invalid review');
  const row=this.db.prepare('SELECT * FROM relation_identity_reviews WHERE id=? AND scope=?').get(id,scope);if(!row)bad('review not found',404);
  if(row.state!=='pending')bad('already reviewed',409);
  if(decision==='approve'){
   if(!this.getSource(row.source_id,scope))bad('source revoked');
   const existing=this.db.prepare('SELECT person_id FROM relation_aliases WHERE scope=? AND channel=? AND external_id=?').get(scope,row.channel,row.external_id);
   if(existing)bad('alias conflict: do not auto merge',409);
   this.db.prepare('INSERT INTO relation_aliases VALUES(?,?,?,?,?,?,?,?,?)').run(uuid(),scope,row.person_id,row.channel,row.external_id,row.display_name,row.source_id,'confirmed',new Date().toISOString());
  }
  this.db.prepare('UPDATE relation_identity_reviews SET state=? WHERE id=?').run(decision==='approve'?'approved':'rejected',id);
  return {id,state:decision==='approve'?'approved':'rejected',reviewer};
 };
 Core.prototype.relationGraph=function({scope}){
  if(!ok(scope))bad('scope required');
  const people=this.db.prepare('SELECT * FROM relation_people WHERE scope=? ORDER BY label,id').all(scope), ids=new Set(people.map(p=>p.id));
  const aliases=activeAliases(this,scope),names=activeNames(this,scope);
  const retired=this.db.prepare("SELECT * FROM relation_names_d8 WHERE scope=? AND state='retired' ORDER BY reviewed_at DESC,id").all(scope).filter(n=>!!this.getSource(n.source_id,scope));
  const pending=this.db.prepare("SELECT * FROM relation_identity_reviews WHERE scope=? AND state='pending'").all(scope).filter(a=>!!this.getSource(a.source_id,scope));
  const name_pending=this.db.prepare("SELECT id,person_id,name,kind,speaker_person_id,channel,source_id,reason FROM relation_names_d8 WHERE scope=? AND state='pending'").all(scope).filter(a=>!!this.getSource(a.source_id,scope));
  const endpoint=(explicit,raw)=>ids.has(explicit)?explicit:explicit==null&&ids.has(raw)?raw:null;
  const edges=this.db.prepare(`SELECT m.* FROM memories m WHERE m.scope=? AND m.slot='S07' AND m.kind='relationship' AND ${validMemorySQL} ORDER BY m.created_at DESC,m.id DESC`).all(scope).map(m=>{const p=JSON.parse(m.payload);return {id:m.id,revision:m.revision,from:endpoint(p.subject_person_id,p.subject),to:endpoint(p.object_person_id,p.object),subject:p.subject,object:p.object,relation:p.relation,circle:p.circle??null,boundary:p.boundary??null,category_label:p.category_label??null,object_person_id:p.object_person_id??null,sources:JSON.parse(m.sources),verified:'committed_memory'};});
  return {people:people.map(p=>({...p,aliases:aliases.filter(a=>a.person_id===p.id).map(({external_id,channel,display_name,source_id})=>({external_id,channel,display_name,source_id})),names:names.filter(n=>n.person_id===p.id),retired_names:retired.filter(n=>n.person_id===p.id)})),edges,pending,name_pending,identity_resolution:'confirmed_aliases_only',unresolved_edges_may_use_raw_names:true,projection:'current_s07',refreshed_at:new Date().toISOString()};
 };
 /** Read-only preview: stable confirmed person IDs only; no recall side effects.
  * Private/photo/system slots are intentionally excluded from this public-facing panel.
  */
 Core.prototype.personMemories=function({scope,person_id,limit=20,offset=0}={}){
  if(!ok(scope)||!ok(person_id))bad('scope/person_id required');
  const n=Number(limit);if(!Number.isSafeInteger(n)||n<1||n>50)bad('limit must be 1..50');
  const skip=Number(offset);if(!Number.isSafeInteger(skip)||skip<0||skip>1000000)bad('offset must be 0..1000000');
  const person=this.db.prepare('SELECT id FROM relation_people WHERE scope=? AND id=?').get(scope,person_id);
  if(!person)bad('person not found',404);
  // Match only explicitly designated stable-ID fields. Never search arbitrary text or nicknames.
  // Query across the complete database, not a fixed 5000-row recent slice.
  const allowed=['S03','S04','S05','S06','S07','S08','S09','S11'];
  const scalar=['person_id','subject_person_id','object_person_id','owner_person_id'];
  const tests=scalar.map(k=>`json_extract(m.payload,'$.${k}')=?`);
  tests.push(`EXISTS (SELECT 1 FROM json_each(m.payload,'$.person_ids') WHERE value=?)`);
  tests.push(`EXISTS (SELECT 1 FROM json_each(m.payload,'$.participant_person_ids') WHERE value=?)`);
  tests.push(`(m.slot='S07' AND (json_extract(m.payload,'$.subject')=? OR json_extract(m.payload,'$.object')=?))`);
  const sql=`SELECT m.* FROM memories m WHERE m.scope=? AND m.state='current'
   AND m.slot IN (${allowed.map(()=>'?').join(',')})
   AND json_valid(m.payload) AND (${tests.join(' OR ')})
   AND NOT EXISTS (SELECT 1 FROM json_each(m.sources) j LEFT JOIN sources s
      ON s.id=j.value AND s.scope=m.scope AND s.revoked=0 WHERE s.id IS NULL)
   ORDER BY m.created_at DESC,m.id DESC LIMIT ? OFFSET ?`;
  const rows=this.db.prepare(sql).all(scope,...allowed,...Array(tests.length+1).fill(person_id),n+1,skip);
  const direct=rows.slice(0,n);const extra=skip===0?personEventRows(this,scope,person_id,direct.map(row=>({...row,payload:JSON.parse(row.payload),sources:JSON.parse(row.sources)})),Math.min(2,Math.max(0,n-direct.length))):[];
  const items=direct.map(row=>{
   const p=JSON.parse(row.payload),sources=JSON.parse(row.sources);
   const summary=[p.summary,p.statement,p.description,p.content,p.claim, row.kind==='relationship'?[p.subject,p.relation,p.object].filter(Boolean).join(' · '):null].find(v=>typeof v==='string'&&v.trim())||'已提交的关联记忆（无公开摘要）';
   return {memory_id:row.id,library:row.slot,title:row.kind,summary:summary.slice(0,280),source_id:sources[0]||null,status:'committed',revision:row.revision,recorded_at:row.created_at};
  });
  for(const row of extra)items.push({memory_id:row.id,library:row.slot,title:row.kind,summary:String(row.payload.summary||row.payload.statement||row.payload.claim||row.payload.problem||row.payload.expression||'关联记忆').slice(0,280),source_id:row.event_proof.source_id,status:'committed',revision:row.revision,association:'episode_shared_evidence',anchor_memory_id:row.event_proof.anchor_id});
  return {items,person_id,scope,offset:skip,limit:n,next_offset:rows.length>n?skip+n:null,has_more:rows.length>n,preview_only:true,actual_request_verified:false,excluded_slots:['S01','S02','S10','S12']};
 };
 Core.prototype.relationResolve=function({scope,channel,external_id}){
  if(![scope,channel,external_id].every(ok))bad('scope/channel/external_id required');
  const alias=this.db.prepare('SELECT * FROM relation_aliases WHERE scope=? AND channel=? AND external_id=?').get(scope,norm(channel),external_id.trim());
  if(!alias||!this.getSource(alias.source_id,scope))return {matched:false,needs_review:true};
  const person=this.db.prepare('SELECT id,label FROM relation_people WHERE id=? AND scope=?').get(alias.person_id,scope);
  return person?{matched:true,person,source_id:alias.source_id,confidence:'human_confirmed_mapping'}:{matched:false,needs_review:true};
 };
 /** Trigger person-related memory only when a trusted contact identity is confirmed or an unambiguous person name is explicitly mentioned. */
 Core.prototype.personTriggeredRecall=function({scope,trigger,channel,external_id,text='',person_id,speaker_person_id,limit=8}){
  if(!ok(scope)||!['incoming_contact','person_mentioned'].includes(trigger))bad('invalid scope/trigger');
  if(trigger==='incoming_contact'&&(!ok(channel)||!ok(external_id)))bad('verified contact channel/id required');
  if(trigger==='person_mentioned'&&!ok(text)&&!ok(person_id))bad('mention text or confirmed person_id required');
  let person=null,reason='';
  if(trigger==='incoming_contact'){
   const result=this.relationResolve({scope,channel,external_id});
   if(result.matched)person=result.person;else reason='unconfirmed_contact_identity';
  }else if(ok(person_id)){
   person=this.db.prepare('SELECT id,label FROM relation_people WHERE scope=? AND id=?').get(scope,person_id);
   if(!person)reason='unknown_person_id';
  }else{
   const matches=mentionMatches(this,scope,text,channel,speaker_person_id);
   if(matches.length===1)person=matches[0];else reason=matches.length?'ambiguous_person_mention':'no_known_person_mention';
  }
  if(!person)return {trigger,matched:false,reason,selected:[],actual_request_verified:false};
  const aliases=this.db.prepare("SELECT channel,external_id,display_name,source_id FROM relation_aliases WHERE scope=? AND person_id=? AND state='confirmed'").all(scope,person.id).filter(a=>!!this.getSource(a.source_id,scope));
  // Only stable person IDs are safe to join across libraries. Names are not identity evidence.
  const cap=Math.max(1,Math.min(20,Number.isSafeInteger(Number(limit))?Number(limit):8));
  const related=relatedRows(this,scope,person.id,cap+1);
  let selected=related.slice(0,cap).map(m=>({...m,reason:'stable_person_id_match'}));
  if(process.env.EVERLIGHT_D14E6B_PERSON_TIME==='1'){
   // Include all current same-scope temporal peers before labeling a person's memories; never expose unrelated peers.
   const peers=new Map(selected.map(m=>[m.id,m]));const keys=new Set(selected.map(m=>m.payload.temporal?.key).filter(k=>typeof k==='string'&&k));
   for(const key of keys)for(const r of this.db.prepare(`SELECT m.* FROM memories m WHERE m.scope=? AND ${validMemorySQL} AND json_extract(m.payload,'$.temporal.key')=?`).all(scope,key))if(!peers.has(r.id))peers.set(r.id,{...r,payload:JSON.parse(r.payload),sources:JSON.parse(r.sources)});
   const annotated=new Map(this.annotateRecall(scope,[...peers.values()]).map(m=>[m.id,m.temporal_context]));selected=selected.map(m=>({...m,temporal_context:annotated.get(m.id)}));
  }
  const run_id=uuid();
  const checked=['S03','S04','S05','S06','S07','S08','S09','S11'];
  this.db.prepare('INSERT INTO recall_runs VALUES(?,?,?,?,?,?,?,?,?)').run(run_id,scope,JSON.stringify({trigger,person_id:person.id}),JSON.stringify(checked),JSON.stringify(related.map(m=>({id:m.id,revision:m.revision}))),JSON.stringify(selected.map(m=>({id:m.id,revision:m.revision}))), 'selected_not_verified',null,new Date().toISOString());
  this.receipt('recall.person_trigger',scope,run_id,'ok',{trigger,person_id:person.id,hits:related.length,selected:selected.length});
  return {trigger,matched:true,person,aliases,run_id,checked,hits:related.length,has_more:related.length>cap,selected,actual_request_verified:false,upstream_submitted:false};
 };

}
