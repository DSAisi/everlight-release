import {continuityMessage} from '../core/continuity-w3h6b.mjs';
import {contextWarnings} from '../core/context-budget-d14c2.mjs';
import {validateRecall} from '../protocol/recall-boundary.mjs';
import {rawMessage} from '../core/raw-recall-d14c3.mjs';
import {createHash} from 'node:crypto';
// Host-owned boundary. Never expose raw transport to model tools.
export function createMandatoryTurn({adapter,scope,transport,rawEvidence=false}){
 if(!adapter||!scope||typeof transport!=='function')throw Error('host configuration required');
 return async function run({event,query,messages}){
  if(!event||event.scope!==scope||typeof query!=='string'||!query.trim()||!Array.isArray(messages))throw Error('invalid turn');
  const original=structuredClone(messages);
  let run,body,hash;
  try{
   await adapter.capture(event);
   run=await adapter.recall(scope,query,8,{rawEvidence:rawEvidence===true&&event.body?.privacy==='normal'&&event.body?.context_kind==='actual'&&event.body?.s01_index_consent===true});
   validateRecall(run);
   const content=rawMessage(run.selected,run.raw_evidence)+continuityMessage(run.continuity);
   const actual=[{role:'system',content},...contextWarnings(run),...original];
   body=JSON.stringify({messages:actual});
   hash=createHash('sha256').update(body).digest('hex');
   const receipt=await adapter.snapshotReadback(scope,run.run_id,JSON.parse(body).messages);
   if(receipt.verified!==true)throw Error('readback failed');
  }catch(e){return {state:'blocked_before_transport',error:String(e.message),upstream_submitted:false};}
  try{const response=await transport(body);return {state:'transport_returned',run_id:run.run_id,body_hash:hash,response,provider_delivery_verified:false};}
  catch(e){return {state:'transport_failed_or_unknown',run_id:run.run_id,body_hash:hash,error:String(e.message),provider_delivery_verified:false};}
 };
}
