import {proposeCanonical} from './write-compiler-w3h6e.mjs';
import {flag} from '../automation/settings-w3h6.mjs';
import {historicalSource} from './quality-w1.mjs';
import {currentReport} from './task-context-d14e6b.mjs';
import {createHash} from 'node:crypto';
import {contract,VERSION as D9} from '../protocol/write-contract-d9.mjs';
import {VERSION as D7} from '../protocol/write-template-d7.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const check=(ok,msg)=>{if(!ok)throw Object.assign(Error('E2 candidate: '+msg),{status:422});};
const text=(s,n)=>typeof s==='string'&&s.trim()===s&&s.length>=2&&s.length<=n;
const normalized=s=>s.normalize('NFC').replace(/\s+/g,' ').trim();
export const taskEnabled=()=>flag('EVERLIGHT_D14E2_TASK_AUTO');
export const reflectionEnabled=()=>flag('EVERLIGHT_D14E2_REFLECTION_AUTO');
export const enabled=()=>taskEnabled()||reflectionEnabled();
export const features=()=>({task_intent:taskEnabled(),reflection:reflectionEnabled()});
function date(value,quote){if(value===null)return null;check(text(value,40)&&quote.includes(value)&&/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value)),'literal explicit time zone required');const [y,m,d]=value.slice(0,10).split('-').map(Number);check(m>=1&&m<=12&&d>=1&&d<=new Date(Date.UTC(y,m,0)).getUTCDate(),'invalid calendar date');return new Date(value).toISOString();}
function exactTask(c,scope,owner,title){return !!c.db.prepare(`SELECT 1 FROM memories m WHERE scope=? AND kind='goal' AND state='current' AND json_extract(payload,'$.owner')=? AND json_extract(payload,'$.summary')=? AND NOT EXISTS(SELECT 1 FROM json_each(m.sources) j WHERE NOT EXISTS(SELECT 1 FROM sources s WHERE s.scope=m.scope AND s.id=j.value AND s.revoked=0)) LIMIT 1`).get(scope,owner,title)||!!c.db.prepare(`SELECT 1 FROM proposals p WHERE scope=? AND kind='goal' AND state IN ('pending','approved_pending_commit') AND json_extract(payload,'$.owner')=? AND json_extract(payload,'$.summary')=? AND NOT EXISTS(SELECT 1 FROM json_each(p.sources) j WHERE NOT EXISTS(SELECT 1 FROM sources s WHERE s.scope=p.scope AND s.id=j.value AND s.revoked=0)) LIMIT 1`).get(scope,owner,title);}
export function applyCandidates(c,row,data,items){
 check(Array.isArray(items)&&items.length<=4,'invalid list');if(!items.length)return [];
 check(enabled()&&data.role==='assistant'&&!data.followup,'not eligible');
 const owner=process.env.EVERLIGHT_AUTO_MEMORY_D11_AI;check(text(owner,120)||typeof owner==='string'&&owner.length===1,'missing AI label');
 const out=[],seen=new Set();
 for(const [i,x] of items.entries()){
  check(x&&typeof x==='object'&&!Array.isArray(x)&&['goal','reflection'].includes(x.kind),'invalid kind');
  const spec=contract(x.kind);check(spec.categories.includes(x.category)&&x.category!=='custom','known category required');
  const exact=(v,n)=>text(v,n)&&data.text.includes(v);
  let payload={template_version:D7,contract_version:D9,category:x.category},fingerprint;
  if(x.kind==='goal'){
   check(taskEnabled()&&Object.keys(x).length===6&&Object.keys(x).every(k=>['kind','category','quote','title','acceptance','due_at'].includes(k)),'invalid goal shape');
   check(exact(x.quote,800)&&text(x.title,120)&&x.title.length>=4&&text(x.acceptance,300)&&x.quote.includes(x.title)&&x.quote.includes(x.acceptance)&&!x.title.includes(x.acceptance)&&!x.acceptance.includes(x.title),'literal task and separate acceptance criterion required');
   check(/我(?:会|来|负责|答应|承诺|接受|接下|决定|要做)|\bI (?:will|accept|commit|agree|promise)\b/i.test(x.quote)&&!/(如果|假如|假设|可能|考虑|不承诺|不会|不接受|不答应|\bwould\b|\bmight\b)/i.test(x.quote),'explicit accepted intent required');
   check(!historicalSource(data.src)&&currentReport(x.quote),'historical intent requires current reconciliation, not a new todo');
   const due_at=date(x.due_at,x.quote);
   check(due_at!==null||!/(明天|后天|今晚|今天|下周|下个月|每天|每周|小时后|分钟后|\d{1,2}点|\d{1,2}:\d{2}|\d{1,2}月\d{1,2}日|\btomorrow\b|\btonight\b|\bnext week\b|\bevery day\b)/i.test(x.quote),'unresolved time or recurring intent must use existing awareness flow');
   fingerprint=hash(['e2-goal',row.scope,owner,normalized(x.title)]);check(!seen.has(fingerprint),'duplicate in source');seen.add(fingerprint);
   if(exactTask(c,row.scope,owner,x.title)){out.push({kind:x.kind,state:'existing_task_or_candidate'});continue;}
   Object.assign(payload,{summary:x.title,owner,intent:x.quote,state:'todo',acceptance:x.acceptance,priority:'normal',due_at,report_interval_minutes:30});
  }else{
   check(reflectionEnabled()&&Object.keys(x).length===4&&Object.keys(x).every(k=>['kind','category','claim','observation'].includes(k)),'invalid reflection shape');
   check(exact(x.claim,800)&&exact(x.observation,800)&&x.claim!==x.observation&&/(我|本人|\bI\b)/i.test(x.claim),'distinct literal observation and first-person reflection required');
   fingerprint=hash(['e2-reflection',row.scope,owner,normalized(x.claim),normalized(x.observation)]);check(!seen.has(fingerprint),'duplicate in source');seen.add(fingerprint);
   const prior=c.db.prepare("SELECT i.proposal_id FROM d11_items i JOIN proposals p ON p.scope=i.scope AND p.id=i.proposal_id WHERE i.scope=? AND i.fingerprint=? AND p.state IN ('pending','approved_pending_commit','committed') ORDER BY p.created_at DESC LIMIT 1").get(row.scope,fingerprint);if(prior){const p=c.proposalDetail({scope:row.scope,id:prior.proposal_id});if(p.source_valid&&(p.state!=='committed'||p.committed_record?.state==='current')){out.push({kind:x.kind,state:'exact_repeat',proposal_id:prior.proposal_id});continue;}}
   Object.assign(payload,{claim:x.claim,observation:x.observation,verified_level:'guess',next_action:null});
  }
  const p=proposeCanonical(c,{scope:row.scope,slot:spec.slot,kind:x.kind,payload,source_refs:[data.src.id],reason:x.kind==='goal'?'E2 explicit AI task intent candidate; existing governance required; unknown due time remains null':'E2 literal AI reflection candidate; observation is self-reported, not independently verified',idempotency_key:'e2-candidate:'+hash([row.scope,row.event_id,i,fingerprint])},true);
  c.db.prepare('INSERT INTO d11_items VALUES(?,?,?,?,?,?)').run(row.scope,row.event_id,100+i,fingerprint,p.id,'proposed');out.push({kind:x.kind,state:'proposed',proposal_id:p.id});
 }
 return out;
}
