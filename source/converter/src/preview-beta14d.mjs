import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {prepare,classificationPrompt} from './core.mjs';
import {localNoteItem,noteFormat} from './structured-notes-beta14b.mjs';
import {heldSource} from './import-privacy-beta14d.mjs';
import {estimateMicros,pricing} from './spend-beta14d.mjs';
export async function previewImport(config,{mode='hybrid'}={}){
 if(!['raw','local','hybrid'].includes(mode))throw Error('Unknown import preview mode');
 const p=pricing(config),dir=await fs.mkdtemp(path.join(os.tmpdir(),'everlight-preview-'));
 try{const cfg={...config,workDir:dir,structuredNotes:mode!=='raw',strictCore:true,calibrationRecords:100,transport:{...config.transport,type:mode==='hybrid'?'openai-compatible':mode==='local'?'local-notes':'mock'}};const plan=await prepare(cfg);let chunks=0,modelChunks=0,modelRecords=0,localRecords=0,held=0,estInput=0,estOutput=0,embeddingBytes=0;const embed=cfg.embedding?.type==='openai-compatible';
 for(const file of (await fs.readdir(path.join(dir,'chunks'))).sort()){
  const c=JSON.parse(await fs.readFile(path.join(dir,'chunks',file),'utf8'));chunks++;const skip=new Set();for(const m of c.messages.filter(m=>c.primary_source_ids.includes(m.source_id))){if(heldSource(m)){held++;skip.add(m.source_id);continue;}if(embed&&cfg.historicalVectorIndex===true)embeddingBytes+=Buffer.byteLength(m.text);if(mode!=='raw'&&localNoteItem(m)){localRecords++;skip.add(m.source_id);continue;}if(embed&&mode!=='raw'&&cfg.vectorClassification===true&&cfg.historicalVectorIndex!==true)embeddingBytes+=Buffer.byteLength(m.text);}
  if(mode!=='hybrid')continue;const remaining=c.primary_source_ids.filter(id=>!skip.has(id));if(!remaining.length)continue;modelChunks++;modelRecords+=remaining.length;const reduced={...c,primary_source_ids:remaining,messages:c.messages.filter(m=>!heldSource(m)&&!skip.has(m.source_id)&&m.raw?.format!==noteFormat)};estInput+=Buffer.byteLength(classificationPrompt(reduced,cfg))+1024;estOutput+=cfg.transport.maxOutputTokens??8192;
 }
 const llm=estimateMicros(cfg,'llm',estInput,estOutput),emb=estimateMicros(cfg,'embedding',embeddingBytes);return {mode,records:plan.count,chunks,explicit_note_records:localRecords,held_private_or_fiction:held,model_records:modelRecords,classification_requests_first_pass:modelChunks,classification_input_reservation_estimate:estInput,classification_output_token_limit_total:estOutput,source_embedding_bytes_estimate:embeddingBytes,currency:p?.currency??null,classification_reservation_cost_estimate:llm===null?null:llm/1e6,source_embedding_cost_estimate:emb===null?null:emb/1e6,configured_cap:p?.maxCost??null,network_requests:0,database_writes:0,limitations:['Input uses UTF-8 bytes plus framing, not actual billed tokens.','Estimates exclude retry, strict review, vector prototype hints, candidate embeddings and judgment calls; enabled runtime calls are separately budgeted.','Cache reuse may reduce spending. Provider pricing, reasoning tokens and actual usage can differ. No invoice guarantee.']};
 }finally{await fs.rm(dir,{recursive:true,force:true});}
}
