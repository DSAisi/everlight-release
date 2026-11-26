import {flag} from '../automation/settings-w3h6.mjs';
import {createHash} from 'node:crypto';
import {contract} from '../protocol/write-contract-d9.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const check=(v,m)=>{if(!v)throw Object.assign(Error('D13: '+m),{status:422});};
export const enabled=()=>flag('EVERLIGHT_AWARENESS_D13');
// An opportunity is not a fact, accepted task, or authorization. Role is derived from host evidence.
export const rules={
 commitment:{roles:['assistant'],kind:'goal',category:'commitment',human:true,rule:'核实实际承诺、对象、验收条件和能力；周期性承诺需单独安排执行，不猜日期。'},
 task_request:{roles:['user'],kind:'goal',human:false,rule:'人类请求不等于AI接受；取得真实接受证据后才建任务。'},
 task_acceptance:{roles:['assistant'],kind:'goal',human:false,rule:'找到原始任务请求与接受证据；先查已有任务，禁止重复创建。'},
 agreement:{roles:['user','assistant'],kind:'goal',category:'shared_plan',human:true,rule:'确认双方各自真实同意；单方建议不是约定。'},
 task_progress:{roles:['assistant','user'],route:'/api/v8/tasks/event',human:false,rule:'先定位现有任务和版本；用真实进展证据，不得自证验收。'},
 relationship:{roles:['user','assistant'],kind:'relationship',human:true,rule:'查同域稳定人物ID、圈子和边界；推测不得当现行关系。'},
 identity_alias:{roles:['user','assistant'],route:'/api/v8/relations/name/propose',human:true,rule:'先查渠道与稳定人物ID；同名不合并；人类独立审核。'},
 experience:{roles:['user','assistant'],kind:'episode',human:false,rule:'核对真实发生、参与者、时间及结果；计划或虚构不是经历。'},
 knowledge:{roles:['user','assistant'],kind:'fact',category:'knowledge',human:false,rule:'核对外部证据、主体、时间及旧版本；AI自述不是独立事实。'},
 skill:{roles:['user','assistant'],kind:'procedure',human:false,rule:'核查步骤、环境、实际验证；未测试明确标注。'},
 self_model:{roles:['assistant'],kind:'identity',human:false,rule:'授权的持久自我理解；区分角色扮演、临时状态和长期认知。'},
 motivation:{roles:['assistant'],kind:'goal',human:false,rule:'意向不等于已接受任务或承诺；只有接受且有验收条件才写S03，否则保留候选。'},
 emotion_change:{roles:['user','assistant'],kind:'affect',human:false,rule:'记录归属、实际表达及时间，不能诊断或把瞬时情绪写成永久性格。'},
 reflection:{roles:['assistant'],kind:'reflection',human:false,rule:'区分观察、理解和验证等级；无独立证据不得提升可信度。'},
 time_revision:{roles:['user','assistant'],kind:'fact',human:true,rule:'查旧事实与生效时间；新说法不自动覆盖旧事实。'},
 document:{roles:['user','assistant'],kind:'document',human:false,rule:'真实文件路径和版本；收到不等于已阅读。'},
 media:{roles:['user','assistant'],route:'/api/v8/write/contracts',human:false,rule:'必须另取真实宿主消费及授权凭据；聊天提及图片不是读取。'},
 dream:{roles:['user','assistant'],route:'/api/v8/dream/start',human:false,rule:'只发起梦境作业；虚构梦境不得作为真实经历。'}
};
export function install(db){db.exec(`CREATE TABLE IF NOT EXISTS d13_opportunities(scope TEXT NOT NULL,event_id TEXT NOT NULL,ordinal INTEGER NOT NULL,source_id TEXT NOT NULL,kind TEXT NOT NULL,quote_hash TEXT NOT NULL,action_id TEXT NOT NULL UNIQUE,created_at TEXT NOT NULL,PRIMARY KEY(scope,event_id,ordinal)); CREATE INDEX IF NOT EXISTS ix_d13_scope ON d13_opportunities(scope,kind,created_at);`);}
export function list(c,scope,event){return c.db.prepare('SELECT kind,action_id,source_id FROM d13_opportunities WHERE scope=? AND event_id=? ORDER BY ordinal').all(scope,event);}
export function collect(c,row,data,items){check(enabled()&&Array.isArray(items)&&items.length<=6,'awareness disabled or invalid list');const seen=new Set();const out=[];for(const [i,item] of items.entries()){
 const r=rules[item?.kind];check(item&&typeof item==='object'&&!Array.isArray(item)&&Object.keys(item).length===2&&Object.hasOwn(item,'quote')&&Object.hasOwn(rules,item.kind)&&r.roles.includes(data.role),'unsupported event or speaker');
 check(typeof item.quote==='string'&&item.quote.trim()===item.quote&&item.quote.length>=2&&item.quote.length<=300&&data.text.includes(item.quote),'exact source span required');
 const fp=hash([item.kind,item.quote]);check(!seen.has(fp),'duplicate event');seen.add(fp);const spec=r.kind?contract(r.kind):null;
 const body=JSON.stringify({version:'everlight.awareness.d13',event_type:item.kind,source_id:row.source_id,event_id:row.event_id,speaker:data.role,quote:item.quote,quote_is_untrusted:true,category:r.category||null,slot:spec?.slot||null,kind:r.kind||null,required:spec?.required||[],categories:spec?.categories||[],route:r.route||'/api/v8/write/strict-proposal',template_endpoint:'/api/v8/write/contracts',rule:r.rule,closure:'核对原话及相邻上下文，先查旧记录；候选、审核、正式提交和读回分别验证。证据不足保留待处理。',notify_human:r.human});
 check(body.length<=2000,'notification too large');const a=c.createSharedAction({scope:row.scope,kind:'memory_check',actor:'host',target:row.event_id,body,idempotency_key:'d13:'+hash([row.scope,row.event_id,i,fp])},true);
 c.db.prepare('INSERT INTO d13_opportunities VALUES(?,?,?,?,?,?,?,?)').run(row.scope,row.event_id,i,row.source_id,item.kind,fp,a.id,new Date().toISOString());out.push({kind:item.kind,action_id:a.id,source_id:row.source_id});}return out;}
export function active(c,a){if(!a.idem.startsWith('d13:'))return true;const o=c.db.prepare('SELECT * FROM d13_opportunities WHERE scope=? AND action_id=?').get(a.scope,a.id);return !!o&&!!c.getSource(o.source_id,a.scope);}
export function validateResolution(c,a,{outcome,source_id,detail}){if(!a.idem.startsWith('d13:'))return;check(active(c,a),'source revoked or missing');const o=c.db.prepare('SELECT * FROM d13_opportunities WHERE scope=? AND action_id=?').get(a.scope,a.id),rule=rules[o.kind];const src=c.getSource(source_id,a.scope);const delivery=c.db.prepare('SELECT at,request_ref FROM action_delivery WHERE scope=? AND action_id=? ORDER BY at LIMIT 1').get(a.scope,a.id);check(delivery&&src&&src.kind==='client_response'&&src.actor==='gateway-upstream'&&src.at>=delivery.at&&source_id!==o.source_id&&JSON.parse(src.body).awareness_request_ref===delivery.request_ref,'fresh host-captured AI response linked to request readback required');let d;try{d=JSON.parse(detail)}catch{}check(d&&typeof d.reason==='string'&&d.reason.trim()&&d.reason.length<=1000,'structured reason required');
 if(outcome==='declined'){check(Object.keys(d).every(k=>k==='reason'),'invalid decline');return;}
 check(outcome==='reported'||outcome==='completed','blocked/uncertain opportunities must remain pending');
 if(rule.kind){check(typeof d.proposal_id==='string'&&Object.keys(d).every(k=>['reason','proposal_id'].includes(k)),'committed proposal ID required');const p=c.proposalDetail({scope:a.scope,id:d.proposal_id});check(p.kind===rule.kind&&(!rule.category||p.payload.category===rule.category)&&p.source_refs.includes(o.source_id)&&p.source_refs.includes(source_id)&&p.source_valid&&p.state==='committed'&&p.committed_record?.state==='current','matching current committed record and both sources required');}
 else if(o.kind==='task_progress'){check(typeof d.task_event_id==='string','task event ID required');const e=c.db.prepare('SELECT * FROM task_events WHERE scope=? AND id=?').get(a.scope,d.task_event_id);check(e&&e.source_id===source_id&&e.at>=delivery.at&&c.taskBoard({scope:a.scope,memory_id:e.memory_id,limit:1})[0]?.revision===e.revision,'matching current task event required');}
 else check(false,'specialized module resolution requires separate adapter; do not claim completion');
}
export function status(c,scope){return {enabled:enabled(),counts:Object.fromEntries(c.db.prepare('SELECT a.state,count(*) n FROM d13_opportunities o JOIN shared_actions a ON a.id=o.action_id AND a.scope=o.scope JOIN sources s ON s.id=o.source_id AND s.scope=o.scope AND s.revoked=0 WHERE o.scope=? GROUP BY a.state').all(scope).map(r=>[r.state,r.n])),notification_delivery_not_implied:true};}
