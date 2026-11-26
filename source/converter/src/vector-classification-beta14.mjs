import {heldSource} from './import-privacy-beta14d.mjs';
import {embeddingVectors} from './embedding.mjs';
// Ranking hints only; never use a similarity score as truth or a write authorization.
export const prototypes=Object.freeze([
 ['S03','任务、目标、承诺、尚待执行的工作','I promise to finish the migration tomorrow'],
 ['S04','已发生的事件、共同经历、完成的活动','Yesterday we completed the deployment'],
 ['S05','事实、偏好、习惯及其变化','I used to prefer tea but no longer do'],
 ['S06','技能、代码、方法、经验、操作步骤','How to diagnose and fix a database error'],
 ['S07','人物关系、称呼、共同关系和身份关联','We are coworkers; she is my friend'],
 ['S08','明确情绪表达、情绪发生的情境','I felt sad during yesterday’s conversation'],
 ['S09','自我描述、价值、角色、能力与边界','My personal values and self-description'],
 ['S11','反思、经验归纳、对错误的新理解','I learned why my previous decision failed'],
 ['S12','文件、资料、图片及媒体来源','A document with a title and version']
]);
export function rankPrototypeHints(vectors,protos=prototypes){
 const offset=protos.length*2;if(vectors.length<offset)throw Error('prototype coverage missing');const results=[];
 for(const v of vectors.slice(offset)){const scored=protos.map(([slot],i)=>{const dot=w=>v.reduce((a,x,j)=>a+x*w[j],0);return {slot,similarity:Math.max(dot(vectors[i*2]),dot(vectors[i*2+1]))}});scored.sort((a,b)=>b.similarity-a.similarity||a.slot.localeCompare(b.slot));results.push(scored.slice(0,3).map(x=>({...x,similarity:Number(x.similarity.toFixed(5))})));}return results;
}
export async function classificationHints(chunk,config){
 if(config.vectorClassification!==true)return [];
 if(!['openai-compatible','offline-vectors'].includes(config.embedding?.type))throw Error('Dense embedding required for classification hints');
 if(config.embedding.type==='openai-compatible'&&config.allowEmbeddingProcessing!==true)throw Error('Separate embedding authorization required');
 const primary=chunk.messages.filter(m=>chunk.primary_source_ids.includes(m.source_id)&&!heldSource(m));
 const texts=[...prototypes.flatMap(p=>p.slice(1)),...primary.map(m=>m.text)];
 const vectors=await embeddingVectors(texts,config);const ranked=rankPrototypeHints(vectors);
 return primary.map((m,i)=>({source_id:m.source_id,candidates:ranked[i]}));
}
