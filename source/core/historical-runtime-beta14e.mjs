import {createHash} from 'node:crypto';
import {searchHistoricalVectors} from './historical-vector-beta14c.mjs';
// A server-owned, non-serializable channel: never accept embeddings or ranking from API callers.
export const historicalRuntime=Symbol('historical-runtime-beta14e');
export function runtimeEmbedding(env=process.env,fetchImpl=fetch){
 if(env.EVERLIGHT_HISTORICAL_SEMANTIC!=='1')return null;
 const scope=env.EVERLIGHT_BOUND_SCOPE,model=env.EVERLIGHT_HISTORICAL_EMBED_MODEL,revision=env.EVERLIGHT_HISTORICAL_EMBED_REVISION||'1',dimensions=Number(env.EVERLIGHT_HISTORICAL_EMBED_DIMENSIONS),min=Number(env.EVERLIGHT_HISTORICAL_EMBED_MIN_SCORE),margin=Number(env.EVERLIGHT_HISTORICAL_EMBED_MIN_MARGIN);
 const url=new URL(env.EVERLIGHT_HISTORICAL_EMBED_URL||'');const local=['127.0.0.1','localhost','[::1]'].includes(url.hostname);
 if(scope!=='personal'||env.EVERLIGHT_D14C2B_RAW!=='1'||env.EVERLIGHT_D14C3_AUTO_RAW!=='1'||!model||!Number.isInteger(dimensions)||dimensions<1||dimensions>4096||!Number.isFinite(min)||min<=0||min>1||!Number.isFinite(margin)||margin<=0||margin>1||url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||local&&url.protocol==='http:')||(!local&&env.EVERLIGHT_HISTORICAL_QUERY_EXTERNAL_OPT_IN!=='1'))throw Error('Invalid historical semantic runtime authorization/configuration');
 const provider=createHash('sha256').update(JSON.stringify([scope,url.href,model,dimensions,revision])).digest('hex');
 return async(body)=>{if(body.scope!==scope||body.raw_evidence!==true||body.association_parent||body.retrieval_hint==='skip_remote_vector'||typeof body.query!=='string'||!body.query.trim()||Buffer.byteLength(body.query)>2048)return null;
  try{const key=env.EVERLIGHT_HISTORICAL_EMBED_KEY;const res=await fetchImpl(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(3000),headers:{'content-type':'application/json',...(key?{authorization:'Bearer '+key}:{})},body:JSON.stringify({model,input:[body.query],dimensions,encoding_format:'float'})});if(!res.ok)throw Error('embedding HTTP');const j=await res.json();const v=j.data?.[0];if(j.data?.length!==1||v?.index!==0||!Array.isArray(v.embedding)||v.embedding.length!==dimensions||!v.embedding.every(Number.isFinite)||!v.embedding.some(x=>x!==0))throw Error('invalid query embedding');return {scope,provider,dimensions,embedding:v.embedding,min,margin,state:'ready'};}catch{return {state:'unavailable'};}
 };
}
export function historicalSemanticCandidate(db,scope,request,enabled){
 if(!request||request.state!=='ready'||request.scope!==scope||scope!==enabled)return {state:request?.state??'not_requested'};
 try{const r=searchHistoricalVectors(db,{scope,provider:request.provider,dimensions:request.dimensions,embedding:request.embedding,limit:2},enabled);const [a,b]=r.items;if(r.partial)return {state:'partial',scanned:r.scanned};if(!a||a.score<request.min||b&&a.score-b.score<request.margin)return {state:'ambiguous_or_low_support',scanned:r.scanned};return {state:'selected_candidate',hit:a,scanned:r.scanned};}catch{return {state:'unavailable'};}
}
