import {proposeCanonical} from './write-compiler-w3h6e.mjs';
import {historicalSource} from './quality-w1.mjs';
import {flag} from '../automation/settings-w3h6.mjs';
import {createHash} from 'node:crypto';
import {contract,errors,VERSION as D9} from '../protocol/write-contract-d9.mjs';
import {VERSION as D7} from '../protocol/write-template-d7.mjs';
import {validateTemporal} from './temporal.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
const txt=x=>typeof x==='string'&&!!x.trim()&&x.length<=8000;
const own=(o,k)=>Object.hasOwn(o,k);
const reject=(msg,status=422)=>{throw Object.assign(Error(msg),{status});};
const privatePattern=/密码|口令|密钥|身份证|银行卡|私密|性爱|裸照|角色扮演|假装|剧情|假如|虚构|住址|病历|password|api.?key|secret|credit.?card|role.?play|pretend|fiction|hypothetical|private|medical/i;
const kinds={事实:'fact',偏好:'preference',情绪:'affect',反思:'reflection',经验:'reflection',任务:'goal',经历:'episode',方法:'procedure',代码:'code',资料:'document'};
const categories={日常:'daily',工作:'work',学习:'learning',共同计划:'shared_plan',自我任务:'self_task',承诺:'commitment',共同经历:'shared_experience',里程碑:'milestone',冲突:'conflict',修复:'repair',人物:'person',项目:'project',环境:'environment',事件:'event',知识:'knowledge',配置:'configuration',沟通:'communication',习惯:'habit',审美:'aesthetic',互动:'interaction',食物:'food',边界:'boundary',开心:'joy',悲伤:'sadness',愤怒:'anger',害怕:'fear',惊讶:'surprise',平静:'calm',混合:'mixed',其他:'other',教训:'lesson',自我反思:'self_reflection',关系:'relationship',方法:'method',错误:'error',操作:'operation',排障:'troubleshooting',流程:'workflow',实现:'implementation',修复缺陷:'bugfix',测试:'test',参考:'reference',研究:'research',合同:'contract',笔记:'note'};
const supported=['fact','preference','affect','reflection','goal','episode','procedure','code','document'];
const details={fact:[],preference:[],affect:['context'],reflection:['claim','observation','next_action'],goal:['summary','acceptance','due_at'],episode:['summary','participants','happened_at','outcome'],procedure:['problem','solution','environment'],code:['problem','solution','environment'],document:['path','version','summary']};
export const enabled=()=>process.env.EVERLIGHT_D14E0_EASY_WRITE==='1'&&process.env.EVERLIGHT_STRICT_WRITE_D9==='1'&&!!process.env.EVERLIGHT_BOUND_SCOPE;
export function capabilities(){return {version:'everlight.easy-write.e0',enabled:enabled(),tool:{name:'remember',description:'可选记录意图，不用填写数据库字段。普通聊天由宿主自动捕获；只提供真实原话或有依据的语义信息。不知道就留空，不假造。',parameters:{type:'object',properties:{kind:{type:'string',enum:supported},quote:{type:'string',description:'可省略，默认当前真实来源全文；指定时必须是原文片段'},category:{type:'string',description:'可使用中文类别；不确定可省略，进入待分类'},details:{type:'object',description:'仅必要的语义信息（如任务验收条件、事件参与者、反思观察），不填写 ID、权限、版本号'}},additionalProperties:false}},kinds:supported.map(kind=>({kind,categories:contract(kind).categories.filter(x=>x!=='custom'),semantic_fields:details[kind]})),special:['relationship','identity','media','night','S01','S02','S10'],requires_host_binding:true,canonical_commit:false};}
function date(value){if(typeof value!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?(?:Z|[+-]\d\d:\d\d)$/.test(value)||!Number.isFinite(Date.parse(value)))return null;const [y,m,d]=value.slice(0,10).split('-').map(Number);if(m<1||m>12||d<1||d>new Date(Date.UTC(y,m,0)).getUTCDate())return null;return new Date(value).toISOString();}
function setup(c){c.db.exec(`CREATE TABLE IF NOT EXISTS easy_write_e0(scope TEXT NOT NULL, id TEXT NOT NULL, source_id TEXT NOT NULL, state TEXT NOT NULL, reasons TEXT NOT NULL, proposal_id TEXT, at TEXT NOT NULL, PRIMARY KEY(scope,id)); CREATE INDEX IF NOT EXISTS ix_easy_e0_state ON easy_write_e0(scope,state,at);`);}
export function submitEasy(c,{scope,source_id,intent={}}){
 if(!enabled()||scope!==process.env.EVERLIGHT_BOUND_SCOPE)reject('easy write disabled or scope not authorized',403);
 if(!txt(source_id)||!plain(intent)||Object.keys(intent).some(k=>!['kind','category','quote','details'].includes(k)))reject('invalid intent fields');
 if(JSON.stringify(intent).length>16000)reject('intent too large');
 const src=c.getSource(source_id,scope);if(!src)reject('source unavailable',404);let body;try{body=JSON.parse(src.body);}catch{reject('source unavailable',422);}
 // All ordinary data must originate from a trusted captured conversation. No import/private/fiction bypass.
 if(!plain(body)||body.purpose!=='conversation'||body.private===true||body.sensitive===true||body.fiction===true||body.auto_memory_allowed===false||!txt(body.text)||privatePattern.test(body.text)||!['client_request','client_response'].includes(src.kind)||!['gateway-client','gateway-upstream'].includes(src.actor)||((src.kind==='client_request')!==(src.actor==='gateway-client')))reject('source not eligible for ordinary memory',403);
 const user=src.kind==='client_request';const subject=process.env[user?'EVERLIGHT_AUTO_MEMORY_D11_USER':'EVERLIGHT_AUTO_MEMORY_D11_AI'];if(!txt(subject))reject('host subject label not configured',503);
 const quote=intent.quote===undefined?body.text:intent.quote;if(!txt(quote)||!body.text.includes(quote))reject('quote must be exact source text');
 const k=typeof intent.kind==='string'?(kinds[intent.kind.trim()]||intent.kind.trim().toLowerCase()):null;
 const rawcat=typeof intent.category==='string'?intent.category.trim():null;const cat=rawcat?(categories[rawcat]||rawcat.toLowerCase()):null;
 const d=intent.details??{};if(!plain(d)||Object.values(d).some(v=>v!==null&&!(typeof v==='string'&&!privatePattern.test(v))&&!(Array.isArray(v)&&v.length<=100&&v.every(x=>typeof x==='string'&&!privatePattern.test(x)))))reject('invalid or excluded details');
 const id='easy-e0:'+hash([scope,source_id,k,cat,quote,Object.keys(d).sort().map(key=>[key,d[key]])]);
 const held=(reasons)=>{setup(c);c.db.prepare('INSERT OR IGNORE INTO easy_write_e0 VALUES(?,?,?,?,?,?,?)').run(scope,id,source_id,'held',JSON.stringify(reasons),null,new Date().toISOString());return {id,state:'held',reasons,source_retained:true,canonicalMemoryChanged:false};};
 if(!k){ // Reuse the existing automatic classification inbox, not another model task.
   if(!flag('EVERLIGHT_AUTO_MEMORY_D11')||!flag('EVERLIGHT_CLASSIFIER_OPT_IN'))return held(['automatic_classifier_not_configured']);
   const existing=c.db.prepare(`SELECT event_id,state FROM write_inbox WHERE scope=? AND source_id=? AND json_extract(event,'$.signal') IN ('unclassified_client_request','unclassified_client_response','explicit_preference') ORDER BY created_at LIMIT 1`).get(scope,source_id);
   const r=existing||c.ingestWriteEvent({scope,event_id:source_id,source_id,origin:'host_verified',signal:user?'unclassified_client_request':'unclassified_client_response'});
   return {state:'classification_inbox',event_id:r.event_id,inbox_state:r.state,source_retained:true,canonicalMemoryChanged:false};
 }
 if(!supported.includes(k))return held(['specialized_route_required']);
 const spec=contract(k);if(!cat||cat==='custom'||!spec.categories.includes(cat))return held(['semantic_category_required']);
 if(Object.keys(d).some(key=>!details[k].includes(key)))return held(['unsupported_semantic_field']);
 const p={template_version:D7,contract_version:D9,category:cat};
 // Metadata and evidence strength are assigned by code. Actual occurrence/validity is unknown unless separately evidenced.
 const attribution=user?'当事人原话（宿主捕获，待审核）':'AI生成原话（宿主捕获，待审核）';
 if(k==='fact'||k==='preference'){
   if(!user)return held(['assistant_claim_not_fact']);
   if(k==='preference'&&!/(我|本人|\bI\b|\bmy\b)/i.test(quote))return held(['explicit_first_person_preference_required']);
   Object.assign(p,{statement:quote,subject,attribution,evidence_status:'reported',temporal:{key:'easy:'+hash([k,subject,quote.normalize('NFC').replace(/\s+/g,' ').trim()]),event_at:null,valid_from:null,valid_until:null}});
 }else if(k==='affect'){
   if(!/(我|本人|\bI\b|\bmy\b)/i.test(quote))return held(['explicit_first_person_expression_required']);
   Object.assign(p,{expression:quote,subject,attribution,observed_at:src.at,evidence_status:'reported',context:d.context??null});
 }else if(k==='reflection')Object.assign(p,{claim:d.claim??quote,observation:d.observation,verified_level:'guess',next_action:d.next_action??null});
 else if(k==='goal'){
   // Only actual trusted host acceptance evidence, never model-provided accepted flags.
   if(user||body.task_accepted!==true)return held(['trusted_task_acceptance_required']);
   if(historicalSource(src))return held(['historical_task_requires_current_evidence']);
   if(d.due_at!=null&&!date(d.due_at))return held(['explicit_due_time_or_timezone_required']);
   Object.assign(p,{summary:d.summary??quote,owner:subject,intent:quote,state:'todo',acceptance:d.acceptance,priority:'normal',due_at:d.due_at==null?null:date(d.due_at),report_interval_minutes:30});
 }else if(k==='episode'){
   if(body.episode_observed!==true)return held(['trusted_episode_evidence_required']);
   if(d.happened_at!=null&&!date(d.happened_at))return held(['explicit_event_time_or_timezone_required']);
   Object.assign(p,{summary:d.summary??quote,participants:d.participants,happened_at:d.happened_at==null?null:date(d.happened_at),outcome:d.outcome??null});if(p.happened_at===null)p.time_unknown_reason='真实事件时间未提供';
 }else if(k==='procedure'||k==='code')Object.assign(p,{problem:d.problem,solution:d.solution??quote,environment:d.environment,verification:'untested',verification_detail:null});
 else if(k==='document'){
   if(body.document_ref!==d.path||body.document_version!==d.version||!txt(d.path)||!txt(d.version))return held(['trusted_document_reference_required']);
   Object.assign(p,{path:d.path,version:d.version,summary:d.summary??quote,access_status:'referenced'});
 }
 const proposal={scope,slot:spec.slot,kind:k,payload:p,source_refs:[source_id],reason:'Easy write: source-grounded candidate; independent review required',idempotency_key:id};
 const issues=errors(proposal);if(p.temporal&&!validateTemporal(p.temporal))issues.push('invalid temporal');if(issues.length)return held(issues.map(x=>x.replace(/^invalid payload\./,'semantic:').replace(/^missing payload\./,'semantic:')));
 // Strict contract stays in force. Candidate and audit state are committed atomically.
 setup(c);return c.tx(()=>{if(!c.getSource(source_id,scope))reject('source unavailable',404);const r=proposeCanonical(c,proposal,true);c.db.prepare('INSERT INTO easy_write_e0 VALUES(?,?,?,?,?,?,?) ON CONFLICT(scope,id) DO UPDATE SET state=excluded.state,reasons=excluded.reasons,proposal_id=excluded.proposal_id,at=excluded.at').run(scope,id,source_id,'proposed','[]',r.id,new Date().toISOString());return {id,state:'proposed',proposal_id:r.id,proposal_state:r.state,idempotent:!!r.idempotent,requires_review:true,canonicalMemoryChanged:false};});
}
export function easyStatus(c,scope){if(!enabled()||scope!==process.env.EVERLIGHT_BOUND_SCOPE)reject('not authorized',403);setup(c);return {items:c.db.prepare('SELECT e.id,e.source_id,e.state,e.reasons,e.proposal_id,e.at FROM easy_write_e0 e JOIN sources s ON s.scope=e.scope AND s.id=e.source_id AND s.revoked=0 WHERE e.scope=? ORDER BY e.at DESC LIMIT 100').all(scope).map(x=>({...x,reasons:JSON.parse(x.reasons)})),limit:100};}
