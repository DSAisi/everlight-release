import {sharedEvidenceLinks} from './write-compiler-w3h6e.mjs';
import {indexedCurrent} from './indexed-retrieval-d14c.mjs';
const ids=p=>[p.person_id,p.subject_person_id,p.object_person_id,p.owner_person_id,...(Array.isArray(p.person_ids)?p.person_ids:[]),...(Array.isArray(p.participant_person_ids)?p.participant_person_ids:[]),...(p.subject&&p.object&&p.relation?[p.subject,p.object]:[])].filter(x=>typeof x==='string'&&x);
function safeSource(c,scope,id){const s=c.getSource(id,scope);if(!s||!['conversation','client_request','client_response'].includes(s.kind))return false;try{const b=JSON.parse(s.body);return typeof b.text==='string'&&!!b.text.trim()&&!['private','sensitive','fiction','night','private_consent'].some(k=>b[k])&&b.auto_memory_allowed!==false;}catch{return false;}}
const safeRow=(c,scope,r)=>r.sources.length>0&&r.sources.every(x=>safeSource(c,scope,x))&&!['private','sensitive','fiction','night','private_media','consent_ref'].some(k=>r.payload[k]);
const decode=r=>({...r,payload:JSON.parse(r.payload),sources:JSON.parse(r.sources)});
function anchor(c,scope,row,person){return row.slot==='S04'&&row.payload.contract_version==='everlight.write.d9'&&ids(row.payload).includes(person)&&safeRow(c,scope,row);}
function related(c,scope,row,person){return ['S03','S04','S05','S06','S08','S09','S11'].includes(row.slot)&&row.payload.contract_version==='everlight.write.d9'&&ids(row.payload).every(x=>x===person)&&safeRow(c,scope,row);}
// Expand only an already activated, canonical episode. One shared evidence edge,
// no second-hop propagation, no new claims or external calls.
export function personEventRows(c,scope,person,seeds,limit=2){
 const out=[],seen=new Set(seeds.map(r=>r.id));if(!Number.isInteger(limit)||limit<1)return out;
 for(const seed of seeds.filter(r=>anchor(c,scope,r,person)).slice(0,4)){
  for(const link of sharedEvidenceLinks(c,scope,seed.sources,20).items){if(seen.has(link.memory_id))continue;const current=indexedCurrent(c.db,scope,link.memory_id,link.revision);if(!current)continue;const row=decode(current);if(!related(c,scope,row,person))continue;const ref=row.sources.find(x=>seed.sources.includes(x));if(!ref)continue;seen.add(row.id);out.push({...row,event_proof:{person_id:person,anchor_id:seed.id,anchor_revision:seed.revision,source_id:ref}});if(out.length>=limit)return out;}
 }return out;
}
export function verifyPersonEvent(c,scope,selected){const p=selected.event_proof;if(!p)return true;const a=indexedCurrent(c.db,scope,p.anchor_id,p.anchor_revision),b=indexedCurrent(c.db,scope,selected.id,selected.revision);if(!a||!b||!c.db.prepare('SELECT 1 FROM relation_people WHERE scope=? AND id=?').get(scope,p.person_id))return false;const seed=decode(a),row=decode(b);return anchor(c,scope,seed,p.person_id)&&related(c,scope,row,p.person_id)&&seed.sources.includes(p.source_id)&&row.sources.includes(p.source_id);}
