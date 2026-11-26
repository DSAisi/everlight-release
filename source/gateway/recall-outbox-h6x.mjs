import {openStrategyOutbox} from './receipt-outbox.mjs';
// Only hashes and HTTP status are persisted. Never retry the model request.
export function openRecallOutbox({dbPath,scope,adapter,clock=Date.now}){
 const q=openStrategyOutbox({dbPath,scope,clock,send:async b=>{
  const r=await adapter.recallTransport(scope,b.run_id,b.request_hash,b.body_hash,b.upstream_status);
  if(r?.recorded!==true)throw Error('recall receipt not acknowledged');return true;
 }});
 return {enqueue(b){if(!b.run_id||!(/^[a-f0-9]{64}$/).test(b.request_hash)||!(/^[a-f0-9]{64}$/).test(b.body_hash)||!Number.isInteger(b.upstream_status)||b.upstream_status<100||b.upstream_status>599)throw Error('invalid recall receipt');q.enqueue({ref:b.run_id+':'+b.body_hash,run_id:b.run_id,request_hash:b.request_hash,body_hash:b.body_hash,upstream_status:b.upstream_status});},drain:q.drain,count:q.count,close:q.close};
}
