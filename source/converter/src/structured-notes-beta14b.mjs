import {heldSource} from './import-privacy-beta14d.mjs';
// Only explicit, already structured notes. Similarity is not proof of a memory.
import {errors as d9Errors} from '../../protocol/write-contract-d9.mjs';
import {checkProposalShape} from './portable-v1.mjs';
export const noteFormat='everlight.historical-note.v1';
const past=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=Date.now();
export function localNoteItem(r){
 const raw=r.raw;if(raw?.format!==noteFormat)return null;
 const hold=()=>({source_id:r.source_id,status:'needs_review',candidates:[],classification_route:'local_note_held'});
 if(!past(r.happened_at)||r.actor==='unknown'||!r.actor.trim()||!raw.payload||typeof raw.payload!=='object'||Array.isArray(raw.payload))return hold();
 if(heldSource(r)||['private','fiction','roleplay'].includes(raw.visibility)||['fiction','roleplay'].includes(raw.reality)||['private','sensitive','fiction','roleplay','private_media'].some(k=>raw[k]===true))return hold();
 const c={slot:raw.slot,kind:raw.kind,payload:raw.payload,source_refs:[r.source_id],reason:'Explicit historical note; copied without semantic rewriting; machine validation only'};
 const p={...c,scope:'offline',idempotency_key:'validation'};
 if(!checkProposalShape(p).ok||d9Errors(p).length)return hold();
 return {source_id:r.source_id,status:'classified',candidates:[c],classification_route:'local_structured_note'};
}
