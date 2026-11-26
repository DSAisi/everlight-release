import {reserveSpend,settleSpend} from './spend-beta14d.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest('hex');
export const embeddingIdentity=config=>{const e=config.embedding;const url=e.type==='offline-vectors'?'file:///offline-vectors':new URL(process.env[e.urlEnv]||'').href;return hash(JSON.stringify([config.scope??'personal',url,e.model,e.dimensions,e.revision??'1']));};
async function acquire(file){for(let i=0;i<1200;i++){try{return await fs.open(file,'wx',0o600)}catch(e){if(e.code!=='EEXIST')throw e;await new Promise(r=>setTimeout(r,50));}}throw Error('Embedding cache is locked; retry after confirming no active writer');}
export async function embeddingVectors(texts,config){
 const e=config.embedding;if(!e||e.type==='lexical')return [];
 const unique=[...new Set(texts)];if(unique.length!==texts.length){const values=await embeddingVectors(unique,config);const by=new Map(unique.map((t,i)=>[t,values[i]]));return texts.map(t=>by.get(t));}
 if(!['openai-compatible','offline-vectors'].includes(e.type))throw Error('Unknown embedding provider');
 if(e.type==='openai-compatible'&&config.allowExternalProcessing!==true&&!(config.allowEmbeddingProcessing===true&&(config.historicalVectorIndex===true||config.transport?.type==='local-notes'&&config.vectorClassification===true)))throw Error('Embedding requires explicit external processing authorization');
 const url=e.type==='offline-vectors'?new URL('file:///offline-vectors'):new URL(process.env[e.urlEnv]||'');if(e.type!=='offline-vectors'&&(url.username||url.password||url.search||url.hash))throw Error('Invalid embedding URL credentials or query');if(e.type!=='offline-vectors'&&url.protocol!=='https:'&&!(url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname)))throw Error('Embedding requires HTTPS or loopback');
 const model=e.model, dim=e.dimensions, batch=e.batchSize??10, limit=e.maxInputBytes??10000000;
 if(!model||!Number.isInteger(dim)||dim<1||dim>4096||!Number.isInteger(batch)||batch<1||batch>32||!Number.isSafeInteger(limit)||limit<1)throw Error('Invalid embedding configuration');
 const dir=path.join(config.embeddingCacheDir??path.join(config.workDir,'embedding-cache'),embeddingIdentity(config));await fs.mkdir(dir,{recursive:true,mode:0o700});
 const normalize=v=>{if(!Array.isArray(v)||v.length!==dim||!v.every(Number.isFinite))throw Error('Invalid embedding vector');const n=Math.hypot(...v);if(!n||!Number.isFinite(n))throw Error('Invalid vector norm');return Float32Array.from(v,x=>x/n)};
 const vectors=[], missing=[];
 if(e.type==='offline-vectors'){
  const bundle=JSON.parse(await fs.readFile(e.vectorFile,'utf8'));
  if(bundle.model!==model||bundle.dimensions!==dim||bundle.revision!==(e.revision??'1')||!Array.isArray(bundle.entries))throw Error('Offline vector metadata mismatch');
  const entries=new Map();for(const row of bundle.entries){if(typeof row.text_sha256!=='string'||! /^[a-f0-9]{64}$/.test(row.text_sha256)||entries.has(row.text_sha256))throw Error('Invalid or duplicate offline vector hash');entries.set(row.text_sha256,normalize(row.embedding))}
  for(const text of texts){const v=entries.get(hash(text));if(!v)throw Error('Offline vector coverage mismatch');vectors.push(v)}
 }else{
 const lock=await acquire(path.join(dir,'provider.lock'));try{
 for(let i=0;i<texts.length;i++){const file=path.join(dir,hash(texts[i])+'.json');try{vectors[i]=normalize(JSON.parse(await fs.readFile(file,'utf8')))}catch(err){if(err.code!=='ENOENT')throw err;missing.push({i,file,text:texts[i]})}}
 const ledger=path.join(dir,'request-bytes.log');let used=0;try{used=(await fs.readFile(ledger,'utf8')).trim().split('\n').filter(Boolean).reduce((a,x)=>{const n=Number(x);if(!Number.isSafeInteger(n)||n<0)throw Error('Invalid embedding ledger');return a+n},0)}catch(err){if(err.code!=='ENOENT')throw err}
 for(let k=0;k<missing.length;k+=batch){const part=missing.slice(k,k+batch), bytes=part.reduce((a,x)=>a+Buffer.byteLength(x.text),0);if(used+bytes>limit)throw Object.assign(Error('Embedding request byte budget exhausted'),{budget:true});const spendId=reserveSpend(config,'embedding',bytes);const fd=await fs.open(ledger,'a',0o600);try{await fd.writeFile(bytes+'\n');await fd.sync()}finally{await fd.close()}used+=bytes;
 const key=process.env[e.apiKeyEnv];const r=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(60000),headers:{'content-type':'application/json',...(key?{authorization:`Bearer ${key}`}:{})},body:JSON.stringify({model,input:part.map(x=>x.text),dimensions:dim,encoding_format:'float'})});if(!r.ok)throw Error('Embedding HTTP '+r.status);const body=await r.json();settleSpend(config,spendId,body.usage);const data=body.data;if(!Array.isArray(data)||data.length!==part.length||new Set(data.map(x=>x.index)).size!==part.length)throw Error('Embedding response coverage mismatch');for(const x of data){if(!Number.isInteger(x.index)||!part[x.index])throw Error('Invalid embedding index');const p=part[x.index];vectors[p.i]=normalize(x.embedding);const tmp=p.file+'.'+randomUUID();await fs.writeFile(tmp,JSON.stringify(x.embedding),{mode:0o600});await fs.rename(tmp,p.file)}}
 }finally{await lock.close();await fs.unlink(path.join(dir,'provider.lock'));}
 }
 return vectors;
}
export async function embeddingHints(candidates,config){
 const e=config.embedding;if(!e||e.type==='lexical')return [];const dim=e.dimensions;const vectors=await embeddingVectors(candidates.map(c=>JSON.stringify([c.kind,c.payload])),config);
 // Bounded approximate retrieval using deterministic random hyperplane buckets; never merge identities.
 const buckets=new Map(), signatures=[];for(let i=0;i<vectors.length;i++){const v=vectors[i],keys=[];for(let t=0;t<8;t++){let sig=0;for(let b=0;b<12;b++){let sum=0;for(let j=0;j<dim;j++){let x=Math.imul(j+1,0x9e3779b1)^Math.imul(t*12+b+1,0x85ebca6b);x=Math.imul(x^(x>>>16),0x7feb352d);sum+=v[j]*(x&1?1:-1)}if(sum>=0)sig|=1<<b}const key=t+':'+sig;keys.push(key);if(!buckets.has(key))buckets.set(key,[]);const p=buckets.get(key);if(p.length<257)p.push(i)}signatures.push(keys)}
 const hints=[];for(let i=0;i<vectors.length;i++){const pool=new Set();for(const key of signatures[i]){const p=buckets.get(key);if(p.length<=256)for(const j of p)if(j>i)pool.add(j)}const ranked=[];for(const j of pool){let score=0;for(let k=0;k<dim;k++)score+=vectors[i][k]*vectors[j][k];ranked.push({j,score})}ranked.sort((a,b)=>b.score-a.score||a.j-b.j);for(const {j,score} of ranked.slice(0,5))hints.push({candidate_ids:[candidates[i].candidate_id,candidates[j].candidate_id],source_refs:[...new Set([...candidates[i].source_refs,...candidates[j].source_refs])],score,method:'embedding_approximate',state:'unverified_hint',identity_confirmed:false,current_state:null})}return hints;
}
