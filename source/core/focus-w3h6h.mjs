import {personRecallLane} from './relations.mjs';
import {historicalSource} from './quality-w1.mjs';
const pronoun=/^(?:那(?:么|现在)?[，, ]*)?(?:他|她|这个人|那个人)(?:最近|以前|当时|现在|还|有|的|怎么样|怎样|呢|是谁|怎么|做|说|和|跟|发生|过得|在哪里|去哪|记得|认识)/u;
export const focusCue=q=>typeof q==='string'&&q.length<=300&&pronoun.test(q.trim())&&!/假如|假设|虚构|角色扮演|密码|密钥|私密|不要提|别提/u.test(q);
export function installFocus(db){db.exec('CREATE TABLE IF NOT EXISTS focus_runs_w3h6h(run_id TEXT PRIMARY KEY,scope TEXT NOT NULL,context TEXT NOT NULL,person_id TEXT NOT NULL)');}
function trusted(c,scope,id,kind){if(typeof id!=='string'||!id.startsWith('gateway'+(kind==='client_response'?'-reply':'')+':'))return null;const s=c.getSource(id,scope);if(!s||s.kind!==kind||s.actor!==(kind==='client_request'?'gateway-client':'gateway-upstream')||s.source_ref!==id||historicalSource(s))return null;try{const b=JSON.parse(s.body),w=c.db.prepare('SELECT event FROM write_inbox WHERE scope=? AND event_id=? AND source_id=?').get(scope,id,id);if(!w||JSON.parse(w.event).origin!=='host_verified'||JSON.parse(w.event).sensitive===true||b.purpose!=='conversation'||b.private===true||b.sensitive===true||b.fiction===true||b.awareness_request_ref||typeof b.text!=='string'||!b.text.trim())return null;return {s,b};}catch{return null}}
export function resolveFocus(c,scope,query,context,limit=8){
 if(process.env.EVERLIGHT_W2_PERSON_RECALL!=='1'||!focusCue(query)||!context||typeof context!=='object')return null;
 const {current,prior,reply}=context;
 const links=context.chain===undefined?[{prior,reply}]:context.chain;
 if(!Array.isArray(links)||!links.length||links.length>8||links.some(x=>!x||typeof x.prior!=='string'||typeof x.reply!=='string')||links[0].prior!==prior||links[0].reply!==reply)return null;
 const all=[current,...links.flatMap(x=>[x.prior,x.reply])];if(new Set(all).size!==all.length)return null;
 const q=trusted(c,scope,current,'client_request');if(!q||q.b.text!==query)return null;
 const currentTime=Date.parse(q.s.at),clock=Date.now();if(!Number.isFinite(currentTime)||clock-currentTime>30*60000||currentTime>clock)return null;
 if(personRecallLane(c,scope,query,limit).reason!=='no_known_person_mention')return null;
 const matches=(x,y)=>x?.prior===y.prior&&x?.reply===y.reply;
 let next=q,upper=currentTime;const replies=[];
 for(let i=0;i<links.length;i++){
  const link=links[i],p=trusted(c,scope,link.prior,'client_request'),r=trusted(c,scope,link.reply,'client_response');
  if(!p||!r||r.b.focus_reply_to!==link.prior)return null;
  // Legacy one-hop contexts remain valid; every multi-hop edge needs stored linkage.
  if((links.length>1||next.b.focus_predecessor)&&!matches(next.b.focus_predecessor,link))return null;
  const pt=Date.parse(p.s.at),rt=Date.parse(r.s.at);
  if(!Number.isFinite(pt)||!Number.isFinite(rt)||pt>rt||rt>upper||currentTime-pt>30*60000)return null;
  replies.push(r);
  const lane=personRecallLane(c,scope,p.b.text,limit,query);
  if(lane.reason==='stable_person_id'){
   for(const item of replies){const rl=personRecallLane(c,scope,item.b.text,limit);if(rl.reason==='ambiguous_or_multiple_mentions'||(rl.person_id&&rl.person_id!==lane.person_id))return null;}
   const used=links.slice(0,i+1).map(x=>({prior:x.prior,reply:x.reply}));
   return {...lane,reason:'verified_previous_person_focus',context:{current,prior,reply,...(used.length>1?{chain:used}:{})}};
  }
  if(lane.reason!=='no_known_person_mention'||!focusCue(p.b.text))return null;
  next=p;upper=pt;
 }
 return null;
}
export function saveFocus(c,scope,run,focus){if(focus)c.db.prepare('INSERT INTO focus_runs_w3h6h VALUES(?,?,?,?)').run(run,scope,JSON.stringify(focus.context),focus.person_id);}
export function verifyFocus(c,scope,run,query){const f=c.db.prepare('SELECT * FROM focus_runs_w3h6h WHERE scope=? AND run_id=?').get(scope,run);return !f||resolveFocus(c,scope,query,JSON.parse(f.context))?.person_id===f.person_id;}
