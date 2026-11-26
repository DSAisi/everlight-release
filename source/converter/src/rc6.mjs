import {openExport} from './review.mjs';
import {readInput,sha256,atomicWrite} from './core.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
export async function submitTrial(config,{url,token,hostToken,confirmed=false}={}){
 if(!confirmed||!/^http:\/\/127\.0\.0\.1:\d+$/.test(url)||!token||!hostToken||!/^trial[-_]/.test(config.scope))throw Error('Explicit isolated trial confirmation, loopback endpoint, trial scope and credentials required');
 const e=await openExport(config.workDir), source=path.join(e.dir,'normalized.jsonl');
 if(sha256(await fs.readFile(source))!==e.manifest.source_sha256)throw Error('Source integrity mismatch');
 const post=async(route,body)=>{const r=await fetch(url+'/api/v8/'+route,{method:'POST',redirect:'error',headers:{authorization:'Bearer '+token,'x-everlight-host-token':hostToken,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(route+' HTTP '+r.status);return r.json()};
 const records=new Map();for await(const r of readInput(source,'jsonl'))records.set(r.source_id,r);
 const receipts=[];const dir=path.join(config.workDir,'reviews',e.generation);const ledger=path.join(config.workDir,'trial-'+e.generation+'.jsonl');
 for(const c of e.candidates){let review;try{review=JSON.parse(await fs.readFile(path.join(dir,c.candidate_id+'.json'),'utf8'))}catch(err){if(err.code==='ENOENT')continue;throw err}if(review.decision!=='accept'||review.generation!==e.generation||review.candidate_id!==c.candidate_id)continue;
 const refs=[];for(const ref of c.source_refs){const r=records.get(ref);if(!r)throw Error('Missing source');const id=sha256(JSON.stringify([config.scope,ref]));const result=await post('source',{scope:config.scope,actor:r.actor,kind:'raw_event',source_ref:ref,source_id:id,body:r});if(result.id!==id)throw Error('Unexpected source receipt');refs.push(result.id)}
 const p={scope:config.scope,slot:c.slot,kind:c.kind,payload:c.payload,source_refs:refs,reason:c.reasons.join('\n'),idempotency_key:sha256(JSON.stringify([config.scope,c.candidate_id]))};const valid=await post('proposal/validate',p);if(!valid.ok)throw Error('RC6 validation rejected '+c.candidate_id);const result=await post('proposal',p);if(!result.id)throw Error('Missing proposal receipt');const receipt={candidate_id:c.candidate_id,proposal_id:result.id,state:result.state,production_approved:false};await fs.appendFile(ledger,JSON.stringify(receipt)+'\n');receipts.push(receipt);
 }return {submitted:receipts.length,production_approved:false,ledger};
}
