import {enabled as d9Enabled,contract as d9Contract,errors as d9Errors} from './write-contract-d9.mjs';
import {template,strictErrors} from './write-template-d7.mjs';
import {SLOT_RULES, REQUIRED_PAYLOAD, checkProposalShape} from './portable-v1.mjs';

/** Advisory-only. Signals are supplied by a host extractor, never treated as proven facts. */
export const SIGNAL_ROUTES=Object.freeze({
 explicit_goal:{slot:'S03',kind:'goal',prompt:'是否形成了明确任务、责任人、完成条件与状态？随口询问不是承诺。'},
 experienced_event:{slot:'S04',kind:'episode',prompt:'是否有实际发生的经历、参与者、时间和可追溯原话？'},
 explicit_fact:{slot:'S05',kind:'fact',prompt:'事实由谁陈述？请区分直接陈述、第三方转述与推断。'},
 explicit_preference:{slot:'S05',kind:'preference',prompt:'是否直接表达了持续偏好？临时选择不得提升为长期偏好。'},
 verified_procedure:{slot:'S06',kind:'procedure',prompt:'方法在何种环境验证？未验证不可标为成功。'},
 relationship_statement:{slot:'S07',kind:'relationship',prompt:'关系来自哪一位当事人的原话？是否只是猜测？'},
 emotion_expression:{slot:'S08',kind:'affect',prompt:'只记录当事人表达或明确观察；推断必须标注推断。'},
 identity_statement:{slot:'S09',kind:'identity',prompt:'是否属于持久身份且经授权？临时扮演不可转为永久身份。'},
 reflective_insight:{slot:'S11',kind:'reflection',prompt:'写清观察与验证级别；猜想不当作已证实结论。'},
 document_reference:{slot:'S12',kind:'document',prompt:'文档位置、版本、来源是否可追溯？'},
 consumed_media:{slot:'S12',kind:'media',prompt:'必须有媒体消费的宿主证据；仅收到附件不能算已读。'}
});
export function guidance({scope,source_id,signals=[],privacy='normal',consent=false}={}){
 if(typeof scope!=='string'||!scope.trim()||typeof source_id!=='string'||!source_id.trim())throw Error('scope and source_id required');
 if(!Array.isArray(signals)||signals.length>32)throw Error('signals must be array <=32');
 const privateInput=privacy!=='normal';
 const blocked=privateInput&&!consent;
 const prompts=[];
 for(const signal of [...new Set(signals)]){
  if(typeof signal!=='string')throw Error('signal must be string');
  const route=SIGNAL_ROUTES[signal];if(!route)continue;
  prompts.push({signal,slot:route.slot,kind:route.kind,required_payload:REQUIRED_PAYLOAD[route.kind],instruction:route.prompt+'；按返回的版本化模板填写，无法证实就暂缓；不要伪造缺失字段。',template:d9Enabled()?d9Contract(route.kind):template(route.kind),source_refs:[source_id],state:'advisory_only'});
 }
 return {scope,source_id,blocked,privacy,reminders:blocked?[]:prompts,skipped:signals.filter(s=>!SIGNAL_ROUTES[s]),rules:['No raw source, no proposal','No consent, no sensitive capture','A reminder is not a proposal','A proposal is not an approved memory','Approved is not committed','Selected is not injected','Never fabricate host execution receipts'],next_step:blocked?'obtain_explicit_consent_outside_model':'extract_candidate_then_validate_then_propose'};
}
export function inspectCandidate(candidate){const shape=checkProposalShape(candidate);if(d9Enabled()||candidate?.payload?.contract_version!==undefined){shape.errors=d9Errors(candidate);shape.ok=shape.errors.length===0;}else if(candidate?.payload?.template_version!==undefined){shape.errors=strictErrors(candidate);shape.ok=shape.errors.length===0;}return {...shape,route:SLOT_RULES[candidate?.slot]||null,required_payload:REQUIRED_PAYLOAD[candidate?.kind]||[],next_step:shape.ok?(d9Enabled()||candidate?.payload?.contract_version!==undefined?'POST /api/v8/write/strict-proposal':'POST /api/v8/proposal'):'fix_candidate_before_submission'};}
export const HOST_HOOKS=Object.freeze(['capture_source','extract_signals','suggest_memory','validate_proposal','authorized_review','commit_memory','pre_model_recall','dispatch_observation','media_consumed_receipt','revoke_propagation']);
