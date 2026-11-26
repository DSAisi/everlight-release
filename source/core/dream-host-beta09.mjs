import {createHash} from 'node:crypto';
import {DREAM_CATEGORIES} from '../protocol/write-template-d7.mjs';
const fail=(message,status=422)=>{throw Object.assign(Error(message),{status});};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export const DREAM_GUIDANCE=Object.freeze({review:'复盘实际事件与未核对信息',consolidation:'整理重复与关联记忆，保留原证据',emotion:'整理明确的历史情绪表达，不推断或改变当前情绪',relationship:'核对人物及共同经历，不猜测身份或关系',conflict:'对照矛盾证据与有效时间，不能确认则暂缓',self_reflection:'从真实行为和反馈提出待验证的改进',association:'从已有证据形成待验证联想，不虚构事实',imagined:'仅虚构创作，绝不能当作真实记忆或改进证据',custom:'AI 自定目标，仍遵循证据及权限约束'});
export const DREAM_INVITATION='现在是宿主提供的空闲整理机会，不是强制任务。请根据当前记忆需要自行选择是否做梦、分类和目的，或推迟；优先精准召回相关证据，勿读取无关或未授权的记忆。修订前使用具体线索调用 recall 保存旧版本 run_id；可自主继续检索、补查证据并启动新的明确证据快照。可提交有证据的记忆修订候选，再按现有独立审核与版本提交机制更新正式记忆；提交后以同一线索再次 recall，调用 dream/replay 核查新版本是否进入召回；只记录真实结果。虚构内容不进入真实记忆。可选：'+Object.entries(DREAM_GUIDANCE).map(([k,v])=>k+' '+v).join('；');
export function eligibleDreamSource(core,scope,id){const s=core.getSource(id,scope);if(!s)return false;let b;try{b=JSON.parse(s.body)}catch{return false;}return !!b&&typeof b==='object'&&!Array.isArray(b)&&(!b.privacy||b.privacy==='normal')&&(!b.context_kind||b.context_kind==='actual')&&!['private','sensitive','fiction','private_consent','night'].some(k=>b[k])&&!['night','private','media','photo','dream_fiction'].includes(s.kind);}
export function dreamOpportunity(core,{scope,idle,enabled}){
 if(typeof scope!=='string'||!scope.trim()||typeof idle!=='boolean'||typeof enabled!=='boolean')fail('explicit scope, idle state and authorization required');
 const base={categories:DREAM_CATEGORIES,guidance:DREAM_GUIDANCE,forced:false,model_delivery_verified:false};
 if(!enabled||!idle)return {...base,state:enabled?'busy':'disabled'};
 return core.tx(()=>{const active=core.db.prepare("SELECT id FROM dreams WHERE scope=? AND state!='completed' LIMIT 1").get(scope);if(active)return {...base,state:'existing_job',job_id:active.id};
 const prior=core.db.prepare("SELECT id,state,created_at FROM shared_actions WHERE scope=? AND kind='dream_request' ORDER BY created_at DESC LIMIT 1").get(scope);
 if(prior&&['queued','acknowledged'].includes(prior.state))return {...base,state:'pending',action_id:prior.id};
 if(prior&&Date.now()-Date.parse(prior.created_at)<86400000)return {...base,state:'cooldown'};
 if(!core.db.prepare("SELECT 1 FROM sources WHERE scope=? AND revoked=0 AND json_valid(body) AND json_type(body)='object' AND kind NOT IN ('night','private','media','photo','dream_fiction') AND COALESCE(json_extract(body,'$.privacy'),'normal')='normal' AND COALESCE(json_extract(body,'$.context_kind'),'actual')='actual' AND NOT (COALESCE(json_extract(body,'$.private'),0) OR COALESCE(json_extract(body,'$.sensitive'),0) OR COALESCE(json_extract(body,'$.fiction'),0) OR COALESCE(json_extract(body,'$.private_consent'),0) OR COALESCE(json_extract(body,'$.night'),0)) LIMIT 1").get(scope))return {...base,state:'no_evidence'};
 const r=core.createSharedAction({scope,kind:'dream_request',actor:'host',body:DREAM_INVITATION,idempotency_key:'dream-opportunity:'+hash([scope,Math.floor(Date.now()/86400000)])},true);return {...base,state:r.state==='queued'?'queued':r.state,action_id:r.id};});
}
export function dreamImprovement(core,{scope,id,source_refs,observation,claim,next_action,idempotency_key}){
 const text=(s,max)=>typeof s==='string'&&s.trim()&&s.length<=max;
 if(![scope,id,idempotency_key].every(s=>text(s,256))||![observation,claim,next_action].every(s=>text(s,2000))||!Array.isArray(source_refs)||source_refs.length<1||source_refs.length>12||new Set(source_refs).size!==source_refs.length||!source_refs.every(s=>text(s,256)))fail('invalid dream improvement');
 return core.tx(()=>{const r=core.db.prepare('SELECT * FROM dreams WHERE scope=? AND id=?').get(scope,id);if(!r)fail('dream missing',404);const snapshot=JSON.parse(r.snapshot);if(r.state!=='completed'||!snapshot.category||snapshot.category==='imagined')fail('completed evidence dream required',409);
 if(!source_refs.every(s=>snapshot.source_ids.includes(s)&&eligibleDreamSource(core,scope,s)))fail('source outside frozen authorized evidence');
 const proposal=core.propose({scope,slot:'S11',kind:'reflection',payload:{template_version:'everlight.write.d7',contract_version:'everlight.write.d9',category:'lesson',claim,observation,verified_level:'guess',next_action},source_refs,reason:'梦境 '+id+'：待独立核验的改进假设',idempotency_key:'dream-improvement:'+hash([scope,id,idempotency_key])},true);
 if(!core.db.prepare("SELECT 1 FROM receipts WHERE scope=? AND subject=? AND op='dream.improvement'").get(scope,proposal.id))core.receipt('dream.improvement',scope,proposal.id,'ok',{job_id:id});
 return {...proposal,canonicalMemoryChanged:false,behavioral_learning_verified:false};});
}
