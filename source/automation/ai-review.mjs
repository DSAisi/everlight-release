import {setTimeout as sleep} from 'node:timers/promises';
/** The host supplies its own companion callback. No classifier or default approval. */
export async function reviewPage({channel,decide,offset=0,state='pending',retry,scope}){
 if(typeof decide!=='function')throw Error('companion callback required');
 if(retry&&!scope)throw Error('retry scope required');
 const page=await channel.page(state,offset);const results=[];
 for(const {id} of page.rows){
  let claimed=false,digest;
  try{
   const status=await channel.status(id);
   if(status.decisions.some(d=>d.role==='ai'&&d.digest===status.digest)){results.push({id,state:'already_decided'});continue;}
   digest=status.digest;
   if(retry){claimed=retry.claim(scope,id,digest);if(!claimed){results.push({id,state:'backoff'});continue;}}
   const detail=await channel.detail(id);
   if(!detail.source_valid||!['pending','approved_pending_commit'].includes(detail.state)){results.push({id,state:'unavailable'});continue;}
   const decision=await decide({candidate:detail,policy:status.policy,digest:status.digest});
   if(decision?.decision==='defer'){results.push({id,state:'deferred'});continue;}
   if(!['approve','reject'].includes(decision?.decision)||typeof decision.reason!=='string'||!decision.reason.trim()||decision.reason.length>2000)throw Error('invalid companion decision');
   const result=await channel.decide({id,digest:status.digest,decision:decision.decision,reason:decision.reason});
   results.push({id,state:'decided',auto_commit:result.auto_commit});
  }catch{results.push({id,state:'failed'});}finally{if(claimed)retry.finish(scope,id,digest,results.at(-1)?.state);}
 }
 return {results,next_offset:page.has_more?offset+page.rows.length:0};
}
export async function runAiReview(config,{signal,intervalMs=30000,onCycle=()=>{}}={}){
 if(!Number.isFinite(intervalMs)||intervalMs<1000)throw Error('invalid interval');
 let offset=0,state='pending';
 while(!signal?.aborted){
  try{const result=await reviewPage({...config,offset,state});offset=result.next_offset;if(!offset)state=state==='pending'?'approved_pending_commit':'pending';onCycle(result);}catch{onCycle({error:'review scan failed'});}
  try{await sleep(intervalMs,undefined,{signal});}catch{break;}
 }
}
