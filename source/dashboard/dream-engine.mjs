/* Evidence-only deterministic dream engine. No generative speculation or canonical writes. */
import {now,newId,transaction,audit,getDream,putDream,putProposal,bad} from './storage.mjs';
const stages=['入队','冻结','分析','整理','独立核验','提交','重放','学习'];
const targetSlot=(field)=>({preference:'S05 事实与偏好',task_status:'S03 工作',relationship:'S07 关系',emotion_interpretation:'S08 情绪',identity:'S09 身份与自我',method:'S06 方法'})[field]||'S11 反思';

export function processDream(db,id){
 return transaction(db,()=>{
   const job=getDream(db,id);if(!job)throw bad(404,'找不到这场梦');
   if(!['queued','retry'].includes(job.status))throw bad(409,'这场梦不在可执行状态');
   const events=db.prepare('SELECT * FROM ui_source_events WHERE scope=? AND deleted=0 ORDER BY inserted_at, id').all(job.scope);
   const watermark=events.length?events[events.length-1].inserted_at:null;
   job.evidenceScope=events.map(x=>x.id).slice(-30).join('，')||null;
   job.sourceCount=events.length;
   job.policyVersion='dream-evidence-only-v1';
   job.snapshot={watermark,sourceIds:events.map(e=>e.id),permissionScope:job.scope,policyVersion:job.policyVersion};
   job.stageHistory=[...stages.slice(0,4).map((name,index)=>({name,index,at:now(),result:'checked'}))];
   // Only a pair of independently source-referenced, host-submitted statements for the same key.
   const grouped=new Map();
   for(const e of events){if(!e.subject||!e.field||!e.value||!e.source_ref)continue;
     const k=e.subject+'\u0000'+e.field;const a=grouped.get(k)||[];a.push(e);grouped.set(k,a);
   }
   const proposals=[];
   for(const seq of grouped.values()){
     if(seq.length<2)continue;
     const pair=seq.slice(-2),[old,latest]=pair;
     if(old.value===latest.value||old.source_ref===latest.source_ref)continue;
     // Cannot choose latest by ingestion order when factual effective time is ambiguous.
     const timestampOk=old.effective_at&&latest.effective_at&&Date.parse(old.effective_at)<Date.parse(latest.effective_at);
     const p={id:newId('prop'),jobId:id,title:`${latest.subject} · ${latest.field} 的记录出现变化`,suggestion:timestampOk?`原记录「${old.value}」，较晚有效记录「${latest.value}」。请人工检查是否是时间变化或纠错。`:`「${old.value}」与「${latest.value}」互相不同，发生顺序或有效期尚待核对。`,sourceRefs:[old.id,latest.id],counterEvidence:old.id,targetSlot:targetSlot(latest.field),status:'pending',sourceValues:[old.value,latest.value],evidenceTimeReliable:!!timestampOk, canonicalMemoryChanged:false,at:now()};
     proposals.push(p);putProposal(db,p);
   }
   job.updatedAt=now();job.stageHistory.push({name:'独立核验',index:4,at:now(),result:proposals.length?'requires_human_review':'no_conflict'});
   if(proposals.length){job.status='reviewing';job.stageIndex=4;job.summary=`核对 ${events.length} 条有来源事件，发现 ${proposals.length} 组信息变化，等待人类审查。`;job.verification='仅发现候选，未修改任何规范记忆';}
   else{job.status='verified';job.stageIndex=7;job.summary=`核对 ${events.length} 条有来源事件，没有找到满足规则的可核对冲突。`;job.verification='无修改结果；未对规范记忆执行写入';job.stageHistory.push({name:'提交/重放/学习',index:7,at:now(),result:'skipped_no_write'});}
   putDream(db,job);audit(db,'dream-worker','dream.process',id,'ok',{evidenceCount:events.length,proposalCount:proposals.length});
   return getDream(db,id);
 });
}
