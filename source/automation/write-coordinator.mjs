import {enabled as d9Enabled,contract as d9Contract,errors as d9Errors} from '../protocol/write-contract-d9.mjs';
import {template,strictErrors} from '../protocol/write-template-d7.mjs';
/** Portable, pure decision layer: emits reminders/candidates, never silently commits. */
import {checkProposalShape} from '../protocol/portable-v1.mjs';
const has=(v)=>typeof v==='string'&&v.trim().length>0;
const rules=Object.freeze({
 explicit_preference:{slot:'S05',kind:'preference',fields:['statement','subject','attribution']},
 explicit_fact:{slot:'S05',kind:'fact',fields:['statement','subject','attribution']},
 accepted_task:{slot:'S03',kind:'goal',fields:['summary','owner','intent','state']},
 witnessed_episode:{slot:'S04',kind:'episode',fields:['summary','participants']},
 verified_procedure:{slot:'S06',kind:'procedure',fields:['problem','solution','environment']},
 evidenced_relationship:{slot:'S07',kind:'relationship',fields:['subject','relation','object']},
 attributed_emotion:{slot:'S08',kind:'affect',fields:['expression','attribution','observed_at']},
 authorized_identity:{slot:'S09',kind:'identity',fields:['statement','subject','basis']},
 tested_reflection:{slot:'S11',kind:'reflection',fields:['claim','observation','verified_level']},
 indexed_document:{slot:'S12',kind:'document',fields:['path','version']},
 consumed_media:{slot:'S12',kind:'media',fields:['path','version','media_type']}
});
export const REMINDER_RULES=rules;
/** `evidence` must originate from host receipts, not from model self-report. */
export function assessWriteOpportunity(event){
 const reasons=[];if(!event||!has(event.scope)||!has(event.event_id)||!has(event.source_id))reasons.push('missing_host_event_evidence');
 const rule=rules[event?.signal];if(!rule)reasons.push('unknown_signal');
 if(event?.sensitive===true&&!event?.consent?.authorized)reasons.push('private_consent_missing');
 if(event?.signal==='consumed_media'&&!(event?.evidence?.media_consumed===true&&has(event?.evidence?.model_request_id)))reasons.push('vision_consumption_unverified');
 if(event?.signal==='verified_procedure'&&event?.evidence?.tested!==true)reasons.push('procedure_not_tested');
 if(event?.signal==='accepted_task'&&event?.evidence?.accepted!==true)reasons.push('task_not_accepted');
 if(event?.signal==='authorized_identity'&&event?.evidence?.identity_authorized!==true)reasons.push('identity_not_authorized');
 if(rule)for(const field of rule.fields)if(!has(event?.payload?.[field])&&!(Array.isArray(event?.payload?.[field])&&event.payload[field].length))reasons.push('missing_payload.'+field);
 if(rule&&event?.payload?.template_version!==undefined)reasons.push(...strictErrors({scope:event.scope,slot:rule.slot,kind:rule.kind,payload:event.payload,source_refs:[event.source_id],reason:event.reason||'host event',idempotency_key:event.event_id}));
 if(rule&&(d9Enabled()||event?.payload?.contract_version!==undefined))reasons.push(...d9Errors({scope:event.scope,slot:rule.slot,kind:rule.kind,payload:event.payload,source_refs:[event.source_id],reason:event.reason||'host event',idempotency_key:event.event_id}));
 const allowed=reasons.length===0;
 return {action:allowed?'suggest_proposal':'hold',slot:rule?.slot??null,kind:rule?.kind??null,reasons,template:rule?(d9Enabled()||event?.payload?.contract_version!==undefined?d9Contract(rule.kind):template(rule.kind)):null,requires_review:true,auto_commit:false};
}
/** Converts a vetted event into a proposal; never performs network calls or approvals. */
export function buildProposal(event){const decision=assessWriteOpportunity(event);if(decision.action!=='suggest_proposal')throw new Error('write opportunity blocked: '+decision.reasons.join(','));
 const p={scope:event.scope,slot:decision.slot,kind:decision.kind,payload:event.payload,source_refs:[event.source_id],reason:event.reason||'Host-observed event requires review',idempotency_key:`${event.scope}:${event.event_id}:${decision.slot}:${decision.kind}`};
 const checked=checkProposalShape(p);if(!checked.ok)throw new Error(checked.errors.join('; '));return p;
}
/** Prompts are advisory; never claim that model has already written a memory. */
export function reminderForTurn({events=[],scope,capabilities={}}){
 const items=events.filter(e=>e.scope===scope).map(e=>({event_id:e.event_id,...assessWriteOpportunity(e)}));
 const pending=items.filter(x=>x.action==='suggest_proposal');const held=items.filter(x=>x.action==='hold');
 return {scope,reminder:pending.length?`本轮有 ${pending.length} 项有来源的待写入候选。先按分库模板生成 proposal；不要自称已经入库；等待审核及 commit 回执。`:'本轮无已核实的新增写入候选，不要为了填库而编造记忆。',pending,held,host_hooks:{capture:!!capabilities.capture,pre_model:!!capabilities.pre_model,model_dispatch:!!capabilities.model_dispatch,media_consumed:!!capabilities.media_consumed},never_infer_delivery:true};
}
