/* Optional canonical candidate bridge; disabled unless explicitly authorized by deployment.
   It does not invent source_indices or interpret 'accepted' as canonical insertion. */
import {bad,trimmed,parse,now,audit} from './storage.mjs';
export async function submitApprovedCandidate(db,reviewId,mapping){
 const origin=process.env.EVERLIGHT_LIFECYCLE_ORIGIN||'';
 if(process.env.EVERLIGHT_LIFECYCLE_WRITES!=='1'||!origin)throw bad(503,'规范认知写入未启用；需先核对真实长明 V6 宿主接口并独立授权');
 let url;try{url=new URL(origin)}catch{throw bad(503,'规范写入服务地址错误')}
 if(!['127.0.0.1','localhost','::1'].includes(url.hostname))throw bad(403,'规范写入适配器只允许连接本机可信服务');
 const row=db.prepare('SELECT record FROM ui_reviews WHERE id=?').get(reviewId);if(!row)throw bad(404,'审核候选不存在');
 const review=parse(row.record);if(review.status!=='approved_pending_canonical')throw bad(409,'只有经过人类审核的候选才能提交规范写入');
 for(const e of review.sourceRefs||[]){if(!db.prepare('SELECT 1 FROM ui_source_events WHERE id=? AND deleted=0').get(e))throw bad(409,'来源已撤回，提交已阻断')}
 if(!mapping||typeof mapping!=='object')throw bad(422,'缺少规范写入映射');
 if(typeof mapping.kind!=='string'||!mapping.kind.trim()||!Array.isArray(mapping.source_indices)||!mapping.source_indices.length||mapping.source_indices.some(x=>!Number.isSafeInteger(x)||x<0)||!mapping.payload||typeof mapping.payload!=='object'||!trimmed(mapping.reason,1000))throw bad(422,'需要真实 source_indices、kind、payload、reason；禁止从记忆摘要猜造证据下标');
 const endpoint=new URL('/api/v6/lifecycle/submit',url),token=process.env.EVERLIGHT_LIFECYCLE_TOKEN||'';
 if(token.length<16)throw bad(503,'规范写入服务授权令牌不存在');
 let response;try{response=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+token},body:JSON.stringify(mapping),signal:AbortSignal.timeout(7000)})}catch{throw bad(502,'规范写入服务请求失败')}
 const data=await response.json().catch(()=>null);
 if(!response.ok||!data){audit(db,'host','canonical.submit',reviewId,'failed',{httpStatus:response.status});throw bad(502,'规范候选提交失败，请查看可信宿主服务日志')}
 review.status='submitted_to_canonical_review';review.submittedAt=now();review.canonicalSubmission=data;
 db.prepare('UPDATE ui_reviews SET record=? WHERE id=?').run(JSON.stringify(review),reviewId);
 audit(db,'host','canonical.submit',reviewId,'submitted',{upstreamStatus:response.status});
 return {submitted:true,canonicalMemoryChanged:false,upstream:data,review};
}
