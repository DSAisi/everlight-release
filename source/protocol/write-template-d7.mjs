import {checkProposalShape,REQUIRED_PAYLOAD,SLOT_RULES} from './portable-v1.mjs';
export const VERSION='everlight.write.d7';
export const TASK_CATEGORIES=['daily','work','learning','shared_plan','self_task','commitment','custom'];
export const DREAM_CATEGORIES=['review','consolidation','emotion','relationship','conflict','self_reflection','association','imagined','custom'];
export const CIRCLES=['family','partner','friend','colleague','acquaintance','other','custom'];
const text=x=>typeof x==='string'&&!!x.trim()&&x.length<=8000;
const date=x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(x)&&Number.isFinite(Date.parse(x));
const plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
const strings=x=>Array.isArray(x)&&x.length>0&&x.every(text);
export const RULES={
 goal:{extra:['category','acceptance','priority','due_at','report_interval_minutes'],rule:'明确接受的任务才写；仅新任务待办，进展、阻塞、完成用 tasks/event；完成不能自证。'},
 episode:{extra:['happened_at','time_unknown_reason'],rule:'真实经历；参与者必须有来源；未知时间填 null 并解释，禁止用入库时间冒充。'},
 fact:{extra:['temporal','evidence_status'],rule:'区分直接陈述、转述、推断；历史事实使用有效期，不得假定当前。'},
 preference:{extra:['temporal','evidence_status'],rule:'持续偏好与临时选择分开；不得推断。'},
 procedure:{extra:['verification'],rule:'注明实际环境及验证情况；未测试不能称成功。'},
 code:{extra:['verification'],rule:'记录环境及验证情况；禁止编造测试结果或密钥。'},
 relationship:{extra:['circle','boundary','object_person_id'],rule:'经审核的当事人关系，圈子、边界有来源；不能依据昵称自动合并人物。'},
 affect:{extra:['evidence_status'],rule:'记录表达者、观察时间；推测不等于真实情绪。'},
 identity:{extra:['evidence_status'],rule:'授权身份，禁止将临时扮演写为持久身份。'},
 reflection:{extra:[],rule:'区分猜测、单次验证与可重复验证。'},
 document:{extra:[],rule:'真实路径、版本和来源；不宣称未阅读文件已读。'},
 media:{extra:[],rule:'使用宿主消费凭据，不能把附件收到当作 AI 已读。'}
};
export function template(kind){if(!Object.hasOwn(RULES,kind))return null;const r=RULES[kind];return {version:VERSION,slot:Object.keys(SLOT_RULES).find(s=>SLOT_RULES[s].kind.includes(kind)),kind,required:['template_version',...REQUIRED_PAYLOAD[kind],...r.extra.filter(x=>x!=='time_unknown_reason')],rules:r.rule,fields:kind==='goal'?{category:TASK_CATEGORIES,priority:['low','normal','high'],due_at:'ISO8601 with zone or null',report_interval_minutes:'integer 5..10080; default UI 30',state:['todo'],category_label:'required for custom'}:kind==='relationship'?{circle:CIRCLES,boundary:'explicit evidence-backed text or null (unknown)',object_person_id:'confirmed person id',subject_person_id:'confirmed same-scope person id or null; preserve original subject/object labels',category_label:'required for custom'}:kind==='episode'?{participants:'nonempty string array',happened_at:'ISO8601 with zone or null',time_unknown_reason:'required when null'}: ['fact','preference','affect','identity'].includes(kind)?{evidence_status:['direct','reported','inferred'],temporal:'fact/preference: {key,event_at,valid_from,valid_until}; unknown null'}:['procedure','code'].includes(kind)?{verification:['untested','tested_once','repeatable']}:{} };}
export function strictErrors(p){const k=p?.kind,b=p?.payload;if(!Object.hasOwn(RULES,k))return ['unknown or system-only kind'];const result=checkProposalShape(p),errors=[...result.errors];if(!plain(b)||!Object.hasOwn(RULES,k))return errors;const check=(ok,key)=>{if(!ok)errors.push('invalid payload.'+key)};check(b.template_version===VERSION,'template_version');for(const key of REQUIRED_PAYLOAD[k])check(key==='participants'?strings(b[key]):text(b[key]),key);
 if(k==='goal'){check(TASK_CATEGORIES.includes(b.category),'category');check(b.category!=='custom'||text(b.category_label),'category_label');check(text(b.acceptance),'acceptance');check(['low','normal','high'].includes(b.priority),'priority');check(b.due_at===null||date(b.due_at),'due_at');check(Number.isInteger(b.report_interval_minutes)&&b.report_interval_minutes>=5&&b.report_interval_minutes<=10080,'report_interval_minutes');check(b.state==='todo','state');}
 if(k==='episode'){check(date(b.happened_at)||(b.happened_at===null&&text(b.time_unknown_reason)),'happened_at');}
 if(['fact','preference','affect','identity'].includes(k))check(['direct','reported','inferred'].includes(b.evidence_status),'evidence_status');
 if(['fact','preference'].includes(k)){check(plain(b.temporal)&&text(b.temporal.key)&&['event_at','valid_from','valid_until'].every(f=>Object.hasOwn(b.temporal,f)&&(b.temporal[f]===null||date(b.temporal[f]))),'temporal');}
 if(k==='affect')check(date(b.observed_at),'observed_at');
 if(['procedure','code'].includes(k))check(['untested','tested_once','repeatable'].includes(b.verification),'verification');
 if(k==='relationship'){check(CIRCLES.includes(b.circle),'circle');check(b.circle!=='custom'||text(b.category_label),'category_label');check(b.boundary===null||text(b.boundary),'boundary');check(text(b.object_person_id),'object_person_id');}
 if(k==='reflection')check(['guess','tested_once','repeatable'].includes(b.verified_level),'verified_level');
 return [...new Set(errors)];}
export function assertTemplate(p){const errors=strictErrors(p);if(errors.length)throw Object.assign(new Error('D7 template: '+errors.join('; ')),{status:422});}
export function dreamMetadata(b){if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['category','purpose','category_label'].includes(k))||!DREAM_CATEGORIES.includes(b.category)||!text(b.purpose)||b.purpose.length>2000||b.category==='custom'&&(!text(b.category_label)||b.category_label.length>60)||b.category!=='custom'&&b.category_label!=null&&b.category_label!=='')throw Object.assign(new Error('dream category and purpose required'),{status:422});return {category:b.category,purpose:b.purpose,category_label:b.category==='custom'?b.category_label:null};}
export const taskReportTemplate=(task,due)=>({template:VERSION,task_id:task.id,expected_revision:task.revision,category:task.category,due_at:due,report:{scope:'same scope',id:'reminder action id',actor:'ai',outcome:'reported | no_progress | blocked | completed | declined',source_id:'actual report source ID',detail:'what changed, evidence, blocker, next action, next check time; no progress explicitly',idempotency_key:'stable per report'},event:{memory_id:task.id,expected_revision:task.revision,action:'progress | block | complete | reopen',state:'matching state',source_id:'actual same-scope evidence ID',detail:'specific progress/evidence; no invented completion',actor:'ai',idempotency_key:'stable per event'},rules:'No progress: resolve reminder only. Acknowledgment is not progress; no self-verification; no fake receipts. Submit evidence and event before reporting completion.'});
