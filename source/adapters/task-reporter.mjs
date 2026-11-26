/** Portable host adapter: report observed task state, never fake completion or verification. */
export async function reportTask({baseUrl,token,scope='personal',task,action,state,actor='ai',detail='',evidence,requestId}){
 if(!evidence?.source_ref||!evidence?.body)throw Error('real event evidence required');
 const post=async(path,body)=>{const r=await fetch(baseUrl+path,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)});const j=await r.json();if(!r.ok)throw Error(j.error);return j};
 const source=await post('/api/v8/source',{scope,actor,kind:'task_execution',source_ref:evidence.source_ref,body:{detail,evidence:evidence.body,requestId}});
 return post('/api/v8/tasks/event',{scope,memory_id:task.id,expected_revision:task.revision,action,state,actor,source_id:source.id,detail,idempotency_key:requestId||evidence.source_ref});
}
export async function queueTaskReminder({baseUrl,token,scope='personal',taskId,text,requestId}){
 const r=await fetch(baseUrl+'/api/v8/shared/actions',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({scope,kind:'task_nudge',actor:'human',target:taskId,body:text,idempotency_key:requestId})});const j=await r.json();if(!r.ok)throw Error(j.error);return j;
}
