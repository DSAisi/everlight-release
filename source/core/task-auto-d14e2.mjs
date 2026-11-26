import {flag} from '../automation/settings-w3h6.mjs';
import {historicalSource} from './quality-w1.mjs';
import * as context from './task-context-d14e6b.mjs';
import {createHash} from 'node:crypto';
import * as association from './task-association-d14e6a.mjs';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const check=(ok,msg)=>{if(!ok)throw Object.assign(Error('E2 task report: '+msg),{status:422});};
export const enabled=()=>flag('EVERLIGHT_D14E2_TASK_AUTO');
const states={progress:'in_progress',block:'blocked',complete:'done'};
// No global task list or identifiers sent to classifier; only titles already present in the source.
export function candidates(c,scope,data){
 if(!enabled()||data.role!=='assistant'||data.followup||historicalSource(data.src))return [];
 const owner=process.env.EVERLIGHT_AUTO_MEMORY_D11_AI;
 if(!owner)return [];
 const rows=association.enabled()?association.candidates(c,scope,data,owner):c.db.prepare(`SELECT id,revision,json_extract(payload,'$.summary') title FROM memories WHERE scope=? AND slot='S03' AND kind='goal' AND state='current' AND json_extract(payload,'$.owner')=? AND length(json_extract(payload,'$.summary'))>=4 AND instr(?,json_extract(payload,'$.summary'))>0 AND NOT EXISTS(SELECT 1 FROM json_each(memories.sources) j WHERE NOT EXISTS(SELECT 1 FROM sources s WHERE s.scope=memories.scope AND s.id=j.value AND s.revoked=0)) LIMIT 21`).all(scope,owner,data.text);
 if(rows.length>20)return []; // ambiguity rather than silently choosing a task
 return rows.filter(r=>rows.filter(x=>x.title===r.title).length===1).map(r=>({r,t:c.taskBoard({scope,memory_id:r.id,limit:1})[0]})).filter(({r,t})=>!context.enabled()||Number.isFinite(context.effectiveTime(data.src))&&context.currentReport(data.text)&&context.effectiveTime(data.src)>=Date.parse(t?.created_at)&&(!t?.events.length||context.effectiveTime(data.src)>=context.effectiveTime(c.getSource(t.events.at(-1).source_id,scope)))).filter(({r,t})=>r.match_kind!=='request_context'||(Number.isFinite(context.effectiveTime(c.getSource(r.parent_source_id,scope)))&&context.effectiveTime(c.getSource(r.parent_source_id,scope))>=Date.parse(t?.created_at)&&(!t?.events.length||context.effectiveTime(c.getSource(r.parent_source_id,scope))>=context.effectiveTime(c.getSource(t.events.at(-1).source_id,scope))))).filter(({r,t})=>t&&['todo','in_progress','blocked'].includes(t.state)&&data.src.at>=t.created_at&&(!t.events.length||data.src.at>=(c.getSource(t.events.at(-1).source_id,scope)?.at||t.events.at(-1).at))).slice(0,6).map(({r,t})=>({key:hash([scope,r.id,r.revision,r.title,t.events.at(-1)?.id||null,...(association.enabled()?[r.match_kind,r.association_sources]:[])]),title:r.title,id:r.id,revision:r.revision,state:t.state,...(association.enabled()?{match_kind:r.match_kind,association_sources:r.association_sources}:{})}));
}
export function applyReports(c,row,data,reports){
 check(Array.isArray(reports)&&reports.length<=6,'invalid reports');if(!reports.length)return [];
 check(enabled()&&data.role==='assistant'&&!data.followup,'not eligible');
 const available=candidates(c,row.scope,data),seen=new Set(),out=[];
 for(const report of reports){
  check(report&&typeof report==='object'&&!Array.isArray(report)&&Object.keys(report).length===3&&Object.keys(report).every(k=>['key','action','quote'].includes(k))&&Object.hasOwn(states,report.action),'invalid report shape');
  const task=available.find(x=>x.key===report.key);check(task&&!seen.has(task.id),'unknown, stale or duplicate task');seen.add(task.id);
  check(!['reviewed_alias','request_context'].includes(task.match_kind)||report.action!=='complete','alias or request context cannot establish whole-task completion');
  const quote=report.quote;check(typeof quote==='string'&&quote.length<=800&&(task.match_kind==='request_context'?context.hasReferent(quote)&&context.currentReport(quote):association.enabled()?association.matches(quote,task.title):quote.includes(task.title))&&data.text.includes(quote)&&/(我|本人|\bI\b)/i.test(quote),'literal first person report with exact title required');
  // Conservative disqualifiers; classifier is still responsible for interpreting actual vs planned/quoted events.
  check(context.currentReport(quote),'historical report cannot update current task');
  check(!/假设|如果|假如|打算|计划(?:要|去|先)|将要|明天|还没|尚未完成|未完成|不能完成|\bwill\b|\bwould\b/i.test(quote)||report.action==='block'&&/还没|尚未完成|未完成|不能完成/.test(quote),'not a clear current report');
  const markers={progress:/已|正在|开始|完成了|\bstarted\b|\bworking\b/i,block:/阻塞|卡住|失败|无法|不能|缺少|\bblocked\b|\bfailed\b/i,complete:/已完成|已经完成|完成了|已交付|\bcompleted\b|\bfinished\b/i};check(markers[report.action].test(quote),'missing action evidence');
  if(report.action==='complete'){const i=quote.lastIndexOf(task.title);check(i>=0&&/^[\s。！!，,；;]*$/.test(quote.slice(i+task.title.length)),'completion must describe the entire named task, not a partial milestone');}
  const event=c.taskEvent({scope:row.scope,memory_id:task.id,expected_revision:task.revision,action:report.action,state:states[report.action],actor:'ai',source_id:data.src.id,detail:'AI 自述（尚未独立核验）：'+quote,idempotency_key:'e2-report:'+hash([row.scope,row.event_id,task.id,task.revision])},true);
  if(task.match_kind==='request_context')for(const source of task.association_sources)c.db.prepare('INSERT OR IGNORE INTO task_context_sources_d14e6b VALUES(?,?,?)').run(row.scope,event.id,source);
  out.push({id:event.id,state:event.state});
 }
 return out;
}
