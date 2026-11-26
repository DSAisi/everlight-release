import {contract,errors} from '../protocol/write-contract-d9.mjs';
import {historicalTask} from './quality-w1.mjs';
// Canonical compiler for evidence-backed inputs, not a semantic extractor.
// Never manufactures missing content, approves, or commits.
export function compileCanonical(c,{scope,kind,fields,source_refs,reason,idempotency_key,target_id,expected_revision}){
 const spec=contract(kind);
 if(!spec||!fields||typeof fields!=='object'||Array.isArray(fields))throw Object.assign(Error('unknown canonical kind or fields'),{status:422});
 if(!Array.isArray(source_refs)||!source_refs.length||!source_refs.every(id=>typeof id==='string'&&c.getSource(id,scope)))throw Object.assign(Error('missing or revoked scoped evidence'),{status:422});
 const payload={...fields,template_version:'everlight.write.d7',contract_version:'everlight.write.d9'};
 const p={scope,kind,slot:spec.slot,payload,source_refs:[...new Set(source_refs)],reason,idempotency_key,...(target_id!==undefined?{target_id}:{}),...(expected_revision!==undefined?{expected_revision}:{})};
 const gaps=errors(p);
 if(kind==='goal'&&['todo','in_progress','blocked'].includes(payload.state)&&historicalTask(c,scope,payload,p.source_refs))gaps.push('historical task requires current evidence');
 if(gaps.length)throw Object.assign(Error('canonical compile: '+gaps.join('; ')),{status:422});
 return p;
}
// Compatibility adapter for existing automatic writers. Preserve canonical payload
// order/idempotency and governance; the producer must still establish semantic evidence.
export function proposeCanonical(c,p,withinTransaction=false){
 const q=compileCanonical(c,{scope:p.scope,kind:p.kind,fields:p.payload,source_refs:p.source_refs,reason:p.reason,idempotency_key:p.idempotency_key,target_id:p.target_id,expected_revision:p.expected_revision});
 if(p.slot!==q.slot||p.payload.template_version!==q.payload.template_version||p.payload.contract_version!==q.payload.contract_version)throw Object.assign(Error('canonical producer slot/version mismatch'),{status:422});
 return c.propose(q,withinTransaction);
}
// All ordinary canonical memories may be linked by shared evidence, but this is
// not proof of a semantic relationship. No transitive expansion or raw/private reads.
export function sharedEvidenceLinks(c,scope,refs,limit=20){
 if(!Array.isArray(refs)||!Number.isInteger(limit)||limit<1||limit>50)throw Error('invalid link query');
 const valid=[...new Set(refs)].filter(id=>!!c.getSource(id,scope));
 if(!valid.length)return {items:[],has_more:false};
 const rows=c.db.prepare(`SELECT m.id,m.revision,m.slot,m.kind,m.payload,m.sources FROM memories m WHERE m.scope=? AND m.state='current' AND m.slot IN ('S03','S04','S05','S06','S07','S08','S09','S11') AND EXISTS (SELECT 1 FROM json_each(m.sources) s JOIN json_each(?) r ON s.value=r.value) AND NOT EXISTS (SELECT 1 FROM json_each(m.sources) s LEFT JOIN sources x ON x.id=s.value AND x.scope=m.scope AND x.revoked=0 WHERE x.id IS NULL OR CASE WHEN json_valid(x.body) THEN (coalesce(json_extract(x.body,'$.private'),0)=1 OR coalesce(json_extract(x.body,'$.sensitive'),0)=1 OR coalesce(json_extract(x.body,'$.fiction'),0)=1 OR coalesce(json_extract(x.body,'$.night'),0)=1 OR coalesce(json_extract(x.body,'$.private_consent'),0) NOT IN (0,'')) ELSE 1 END) ORDER BY m.created_at DESC,m.id LIMIT ?`).all(scope,JSON.stringify(valid),limit+1);
 const keys=new Set(valid);
 return {items:rows.slice(0,limit).map(m=>{const b=JSON.parse(m.payload),t=m.slot==='S03'?c.taskBoard({scope,memory_id:m.id,limit:1})[0]:null;return {memory_id:m.id,revision:m.revision,slot:m.slot,label:String(b.summary||b.statement||b.claim||b.problem||b.expression||b.object||m.slot).slice(0,280),task_state:t?.state??null,source_refs:JSON.parse(m.sources).filter(x=>keys.has(x)),association:'shared_source_only'};}),has_more:rows.length>limit};
}

// Bounded evidence graph: one verified, current S04 bridge only. Common identity
// mapping, settings and unrelated metadata cannot act as a bridge. It is a
// provenance relationship, not a claim that two events are semantically identical.
export function eventEvidenceLinks(c,scope,refs,limit=20){
 const direct=sharedEvidenceLinks(c,scope,refs,limit);
 if(direct.has_more)return direct;
 const eligible=id=>{const s=c.getSource(id,scope);if(!s||!['conversation','client_request','client_response'].includes(s.kind))return false;try{const b=JSON.parse(s.body);return b&&typeof b.text==='string'&&!!b.text.trim()&&!['private','sensitive','fiction','night','private_consent'].some(k=>b[k])&&b.auto_memory_allowed!==false;}catch{return false;}};
 const seed=[...new Set(refs)].filter(eligible);if(!seed.length)return direct;
 const bridges=c.db.prepare(`SELECT m.id,m.sources FROM memories m WHERE m.scope=? AND m.state='current' AND m.slot='S04' AND json_extract(m.payload,'$.contract_version')='everlight.write.d9' AND EXISTS (SELECT 1 FROM json_each(m.sources) s JOIN json_each(?) r ON s.value=r.value) AND NOT EXISTS (SELECT 1 FROM json_each(m.sources) s LEFT JOIN sources x ON x.id=s.value AND x.scope=m.scope AND x.revoked=0 WHERE x.id IS NULL) ORDER BY m.created_at DESC,m.id LIMIT 21`).all(scope,JSON.stringify(seed));
 const via=new Map();let truncated=bridges.length>20;
 for(const bridge of bridges.slice(0,20)){
  const sources=JSON.parse(bridge.sources);if(!sources.every(eligible))continue;
  for(const id of sources){if(seed.includes(id)||via.has(id))continue;if(via.size>=50){truncated=true;break;}via.set(id,bridge.id);}
 }
 if(!via.size)return {...direct,has_more:truncated};
 const indirect=sharedEvidenceLinks(c,scope,[...via.keys()],50);
 const seen=new Set(direct.items.map(x=>x.memory_id));const extra=indirect.items.filter(x=>!seen.has(x.memory_id)).map(x=>({...x,association:'episode_evidence_bridge',bridge_memory_id:via.get(x.source_refs[0])}));
 const all=[...direct.items,...extra];return {items:all.slice(0,limit),has_more:truncated||indirect.has_more||all.length>limit};
}
