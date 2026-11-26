import {semanticHints} from './semantic.mjs';
import {createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
const canonical=v=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const key=v=>JSON.stringify(canonical(v));
const parseTime=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v))?Date.parse(v):null;
export function associate(records,items){
 const sources=new Map(records.map(r=>[r.source_id,r]));
 const groups=new Map(), identities=new Map(), conflicts=[];
 for(const r of records){
  if(!r.message_id||r.message_id===`seq-${r.seq}`)continue;
  const k=key([r.conversation_id,r.message_id]);
  const fingerprint=key([r.actor,r.happened_at,r.text]);
  if(!identities.has(k))identities.set(k,new Map());
  const variants=identities.get(k);if(!variants.has(fingerprint))variants.set(fingerprint,[]);variants.get(fingerprint).push(r.source_id);
 }
 for(const [identity,variants] of identities)if(variants.size>1)conflicts.push({identity,variants:[...variants.values()]});
 for(const item of items)for(const c of item.candidates){
  const refs=[...new Set(c.source_refs)].sort();if(refs.some(r=>!sources.has(r)))throw Error('Unknown evidence');
  // Only exact payload + exact evidence are deduplicated. Never merge distinct events by text alone.
  const k=key([c.slot,c.kind,c.payload,refs]);
  if(!groups.has(k))groups.set(k,{candidate_id:hash(k),slot:c.slot,kind:c.kind,payload:c.payload,source_refs:refs,origins:[],reasons:[],state:'pending_review'});
  const g=groups.get(k);if(!g.origins.includes(item.source_id))g.origins.push(item.source_id);if(!g.reasons.includes(c.reason))g.reasons.push(c.reason);
 }
 const links=new Map();
 for(const g of groups.values())for(const field of ['subject','owner','object','entity','person']){
  const v=g.payload[field];if(typeof v!=='string'||!v.trim())continue;
  const conversations=[...new Set(g.source_refs.map(id=>sources.get(id).conversation_id))];
  for(const conversation of conversations){const k=key([conversation,v]);if(!links.has(k))links.set(k,new Set());links.get(k).add(g.candidate_id);}
 }
 // Conservative state review: identical task labels are hints, not identity proof.
 const histories=new Map();
 for(const g of groups.values()){
  if(g.kind!=='goal')continue;
  const {owner,summary,state}=g.payload;
  if(![owner,summary,state].every(v=>typeof v==='string'&&v.trim()))continue;
  const conversations=[...new Set(g.source_refs.map(id=>sources.get(id).conversation_id))];
  if(conversations.length!==1)continue;
  const k=key([conversations[0],owner,summary]);
  if(!histories.has(k))histories.set(k,[]);
  histories.get(k).push({candidate_id:g.candidate_id,reported_state:state,source_refs:g.source_refs,message_times:g.source_refs.map(id=>sources.get(id).happened_at??null),effective_time:null,reported_time_ms:Math.max(...g.source_refs.map(id=>parseTime(sources.get(id).happened_at)??-Infinity))});
 }
 const state_review=[...histories].filter(([,v])=>v.length>1).map(([k,versions])=>({label:JSON.parse(k),versions:versions.sort((a,b)=>(a.reported_time_ms??-Infinity)-(b.reported_time_ms??-Infinity)||a.candidate_id.localeCompare(b.candidate_id)).map(v=>({...v,reported_time_ms:Number.isFinite(v.reported_time_ms)?v.reported_time_ms:null})),state:'pending_review',current_state:null}));
 const crossConversation=new Map();
 for(const g of groups.values()){for(const field of ['subject','owner','object']){const value=g.payload[field];if(typeof value!=='string'||!value.trim())continue;const k=key(value);if(!crossConversation.has(k))crossConversation.set(k,new Map());const bucket=crossConversation.get(k);for(const ref of g.source_refs){const conversation=sources.get(ref).conversation_id;if(!bucket.has(conversation))bucket.set(conversation,new Set());bucket.get(conversation).add(g.candidate_id);}}}
 const cross_conversation_review=[...crossConversation].filter(([,v])=>v.size>1).map(([label,v])=>({label:JSON.parse(label),groups:[...v].map(([conversation_id,ids])=>({conversation_id,candidate_ids:[...ids]})),state:'unverified_hint',identity_confirmed:false}));
 return {semantic_review:semanticHints([...groups.values()]),cross_conversation_review,state_review,candidates:[...groups.values()],duplicate_source_groups:[...identities.values()].flatMap(v=>[...v.values()].filter(a=>a.length>1)),identity_conflicts:conflicts,association_hints:[...links].filter(([,v])=>v.size>1).map(([label,v])=>({label:JSON.parse(label),candidate_ids:[...v],state:'unverified_hint'})),timeline:records.map(r=>({source_id:r.source_id,seq:r.seq,message_time:r.happened_at,parsed_time:typeof r.happened_at==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(r.happened_at)&&Number.isFinite(Date.parse(r.happened_at))?Date.parse(r.happened_at):null})).sort((a,b)=>(a.parsed_time??Infinity)-(b.parsed_time??Infinity)||a.seq-b.seq)};
}
