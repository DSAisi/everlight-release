import {setTimeout as sleep} from 'node:timers/promises';
export async function syncPage({core,send,scope,consumer}){
 const page=await core('page',{scope,consumer});let expected=page.offset;
 for(const row of page.rows){await send(row);await core('ack',{scope,consumer,expected,seq:row.seq});expected=row.seq;}
 return page.rows.length;
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1]){
 const e=process.env,scope=e.EVERLIGHT_BOUND_SCOPE,consumer=e.EVERLIGHT_VECTOR_CONSUMER;
 if(e.EVERLIGHT_VECTOR_INDEX_OPT_IN!=='1'||!scope||!consumer||!e.EVERLIGHT_VECTOR_URL||!e.EVERLIGHT_VECTOR_TOKEN||e.EVERLIGHT_VECTOR_TOKEN.length<24)throw Error('explicit index configuration required');
 const url=new URL(e.EVERLIGHT_VECTOR_URL);if(url.username||url.password||url.search||url.hash||!(url.protocol==='https:'||url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)))throw Error('invalid vector endpoint');
 const post=async(url,body,headers)=>{const r=await fetch(url,{method:'POST',redirect:'error',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('sync HTTP failure');return r.json()};
 const core=(op,b)=>post(new URL('/api/v8/vector/'+op,e.EVERLIGHT_CORE_URL||'http://127.0.0.1:8790'),b,{authorization:'Bearer '+e.EVERLIGHT_CORE_TOKEN,'x-everlight-host-token':e.EVERLIGHT_SHARED_HOST_TOKEN});
 const send=async row=>{const r=await post(new URL('/index/event',url),{...row,consumer},{authorization:'Bearer '+e.EVERLIGHT_VECTOR_TOKEN});if(r.applied_seq!==row.seq)throw Error('index acknowledgement mismatch')};
 let delay=1000;while(true){try{await syncPage({core,send,scope,consumer});delay=1000}catch{console.error('vector synchronization failed; retrying');delay=Math.min(delay*2,60000)}await sleep(delay)}
}
