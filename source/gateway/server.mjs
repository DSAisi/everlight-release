import {openRecallOutbox} from './recall-outbox-h6x.mjs';
import {focusCue} from '../core/focus-w3h6h.mjs';
import {recallRequestContent} from '../core/recall-request-content-w3h6p.mjs';
import {createNaturalMemoryHost,inspectNaturalResponse} from '../adapters/natural-memory-d14e1.mjs';
import {contextWarnings} from '../core/context-budget-d14c2.mjs';
import {createAwarenessHost} from '../universal/awareness-host.mjs';
import {validateRecall} from '../protocol/recall-boundary.mjs';
import http from 'node:http';
import {createHash,timingSafeEqual} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable,Transform} from 'node:stream';
import {classifyUser} from './classify.mjs';
import {captureIdentity} from './capture-policy.mjs';
import {replyCapture} from './reply-capture.mjs';
import {EverlightHostAdapter} from '../adapters/host-neutral.mjs';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function createGateway({adapter,scope,key,upstream,upstreamKey,models,fetchImpl=fetch,onReceipt=()=>{},capture=false,allowedOrigins=[],capturePurpose='unknown',degradeOnRecallFailure=false,awarenessHost=null,draftGuard=null,noticeHost=null,rawEvidencePolicy=null,naturalMemory=false,associationRecall=false,strategyHost=null,recallOutboxPath=null}){
 if(!adapter||!scope||key?.length<24||!key||!upstreamKey||!Array.isArray(models)||!models.length)throw Error('invalid gateway configuration');
 if(!['unknown','conversation','background'].includes(capturePurpose))throw Error('invalid capture purpose');
 if(strategyHost||draftGuard||noticeHost)throw Error("Internal cognition adapters are not shipped in this edition");
 const target=new URL(upstream);if(!['https:','http:'].includes(target.protocol)||target.username||target.password||target.search||target.hash)throw Error('invalid upstream');
 const endpoint=target.href.replace(/\/$/,'')+'/chat/completions';
 const natural=naturalMemory&&capture&&capturePurpose==='conversation'&&!draftGuard?createNaturalMemoryHost({adapter,scope,resolveCurrentSource:ctx=>ctx}):null;
 const associationEnabled=associationRecall===true&&capture&&capturePurpose==='conversation'&&!draftGuard;
 const associationTool={type:'function',function:{name:'recall_association',description:'可选：首轮记忆不足、思考中自然联想到具体人物、事件、承诺或任务时，用一个具体线索补查。不要重复首轮问题、不要为闲聊强行调用。',parameters:{type:'object',properties:{cue:{type:'string',description:'具体缺失的记忆线索（最多160字符）'}},required:['cue'],additionalProperties:false}}};
 const recallOutbox=recallOutboxPath?openRecallOutbox({dbPath:recallOutboxPath,scope,adapter}):null;
 const flushRecall=()=>recallOutbox?.drain().catch(()=>onReceipt({transport_receipt_state:"retry_failed"}));
 const timer=recallOutbox?setInterval(flushRecall,5000):null;timer?.unref();if(recallOutbox)flushRecall();
 const server=http.createServer(async(req,res)=>{
 const reply=(status,data)=>{res.writeHead(status,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(data))};
 const fail=(status,message)=>reply(status,{error:{message,type:'everlight_gateway_error'}});
 try{
 const origin=req.headers.origin;
 if(origin){if(!allowedOrigins.includes(origin))return fail(403,'Origin not allowed');res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');res.setHeader('Access-Control-Expose-Headers','X-Everlight-Recall-State');if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}}
 const a=Buffer.from(req.headers.authorization||''),b=Buffer.from('Bearer '+key);if(a.length!==b.length||!timingSafeEqual(a,b))return fail(401,'Unauthorized');
 if(req.method==='GET'&&new URL(req.url,'http://localhost').pathname==='/v1/models')return reply(200,{object:'list',data:models.map(id=>({id,object:'model',owned_by:'configured-upstream'}))});
 if(req.method!=='POST'||new URL(req.url,'http://localhost').pathname!=='/v1/chat/completions')return fail(404,'Unsupported endpoint');
 let chunks=[],size=0;for await(const chunk of req){size+=chunk.length;if(size>2*1024*1024)return fail(413,'Request too large');chunks.push(chunk);}
 let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return fail(400,'Invalid JSON')}
 if(!input||typeof input!=='object'||!models.includes(input.model)||!Array.isArray(input.messages)||!input.messages.length||input.messages.length>2000||input.messages.some(m=>!m||typeof m!=='object'||Array.isArray(m)||typeof m.role!=='string'))return fail(400,'Invalid model or messages');
 const last=input.messages.at(-1);
 if(!['user','tool'].includes(last?.role))return fail(422,'Unsupported final message role');
 const user=last.role==='user'?last:input.messages.findLast(m=>m?.role==='user');
 if(!user)return fail(422,'User context required');
 const text=typeof user.content==='string'?user.content:Array.isArray(user.content)?user.content.filter(p=>p?.type==='text'&&typeof p.text==='string').map(p=>p.text).join('\n'):'';
 const hasImage=Array.isArray(user.content)&&user.content.some(p=>p?.type==='image_url'&&typeof p.image_url?.url==='string');
 const query=text.trim()|| (hasImage?'[用户发送图片，内容尚未识别]':'');
 if(!query)return fail(422,'User text or image required');
 const identity=captureIdentity(scope,input.messages,capturePurpose);
 const shouldCapture=capture&&capturePurpose!=='background';
 // Only one directly preceding, plain-text turn; the core must verify both persisted sources.
 let continuation=null;
 if(process.env.EVERLIGHT_D14E6C_CONTINUATION==='1'&&capturePurpose==='conversation'&&last.role==='user'&&typeof user.content==='string'&&/^(?:继续(?:继续)?|接着做|继续吧|continue|go on)[。！!\s]*$/i.test(query)){
  const prev=input.messages.at(-2),anchor=input.messages.at(-3);
  if(prev?.role==='assistant'&&typeof prev.content==='string'&&prev.content.trim()&&!prev.tool_calls&&anchor?.role==='user'&&typeof anchor.content==='string'){
   const prior=captureIdentity(scope,input.messages.slice(0,-2),capturePurpose);
   continuation={prior_request_source_id:'gateway:'+prior.id,prior_reply_source_id:'gateway-reply:'+sha([prior.id,input.model,0,prev.content])};
  }
 }

 // Derive links from the same persisted gateway identity; do not trust IDs supplied in prompts.
 const continuityLive=typeof user.content==='string'&&capturePurpose==='conversation'&&process.env.EVERLIGHT_H6_CONTINUITY==='1';
 let continuityContext=null;
 if(continuityLive&&last.role==='user'&&/^(?:还有|再|大概|约)?(?:[1-9]|1[0-2]|一|二|两|三|四|五|六|七|八|九|十|十一|十二)(?:个)?小时(?:左右)?[。！!]?$/u.test(query)&&(input.n===undefined||input.n===1)){
  const prev=input.messages.at(-2),anchor=input.messages.at(-3);
  if(prev?.role==='assistant'&&typeof prev.content==='string'&&!prev.tool_calls&&anchor?.role==='user'&&typeof anchor.content==='string'){
   const prior=captureIdentity(scope,input.messages.slice(0,-2),capturePurpose);
   continuityContext={request_source_id:'gateway:'+prior.id,reply_source_id:'gateway-reply:'+sha([prior.id,input.model,0,prev.content])};
  }
 }
 // Reconstruct only contiguous user/assistant pairs from the actual incoming history.
 // Persist the immediate predecessor on each captured pronoun request, so a later
 // multi-hop recall cannot splice unrelated, individually valid historical pairs.
 const focusLinks=[];
 if(shouldCapture&&capturePurpose==='conversation'&&last.role==='user'&&typeof user.content==='string'&&focusCue(query)&&(input.n===undefined||input.n===1)){
  for(let end=input.messages.length;end>=3&&focusLinks.length<8;end-=2){
   const prev=input.messages[end-2],anchor=input.messages[end-3];
   if(prev?.role!=='assistant'||typeof prev.content!=='string'||!prev.content.trim()||prev.tool_calls||prev.function_call||anchor?.role!=='user'||typeof anchor.content!=='string')break;
   const prior=captureIdentity(scope,input.messages.slice(0,end-2),capturePurpose);
   focusLinks.push({prior:'gateway:'+prior.id,reply:'gateway-reply:'+sha([prior.id,input.model,0,prev.content])});
   if(!focusCue(anchor.content))break;
  }
 }
 let boundSource=null;
 if(shouldCapture&&last.role==='user'){const id='gateway:'+identity.id;const source={scope,actor:'gateway-client',kind:'client_request',source_ref:id,source_id:id,body:{text:query,attribution:identity.attribution,purpose:identity.purpose,...(focusLinks.length?{focus_predecessor:focusLinks[0]}:{}),...(continuityLive?{continuity_live:true,...(continuityContext?{continuity_context:continuityContext}:{})}:{})}};const captured=await adapter.request('POST','/api/v8/host/capture-and-route',{source,event:classifyUser({scope,id,text:query,purpose:identity.purpose,plainText:typeof user.content==='string'}),process:true});if(captured?.source?.id===id)boundSource={id,scope};}
 const focusContext=boundSource&&focusLinks.length?{current:boundSource.id,...focusLinks[0],...(focusLinks.length>1?{chain:focusLinks}:{})}:null;
 let run,body,awareness=null,notice=null,recallState='verified',naturalRegistration=null,associationRegistration=false,secondaryRun=null,strategies=[];
 const strategyQuery=strategyHost&&capturePurpose==='conversation'&&last.role==='user'&&typeof user.content==='string'&&query.length<=50000?query:null;
 const recheckStrategies=async()=>{if(strategies.length&&JSON.stringify(strategies)!==JSON.stringify(await strategyHost.select(strategyQuery,input.model)))throw Error('learning strategy changed before transmission');};
 const recordStrategies=async(response,wire)=>{if(strategies.length&&response.ok)try{await strategyHost.receipt(strategies,input.model,wire,response.status);}catch{onReceipt({strategy_receipt_state:'failed'});}};
 const canUseInternal=boundSource&&last.role==='user'&&typeof user.content==='string'&&input.stream!==true&&(input.n===undefined||input.n===1)&&!['tools','tool_choice','functions','function_call','response_format','modalities','audio','parallel_tool_calls'].some(k=>Object.hasOwn(input,k));
 const naturalPending=natural&&canUseInternal?natural.discover():Promise.resolve(null);
 associationRegistration=!!(associationEnabled&&canUseInternal);
 const noticePending=noticeHost&&capturePurpose==='conversation'&&last.role==='user'?Promise.resolve().then(()=>noticeHost.prepare(query)).catch(()=>null):Promise.resolve(null);
 try{const allowRaw=typeof rawEvidencePolicy==='function'&&capturePurpose==='conversation'&&last.role==='user'&&typeof user.content==='string'&&await rawEvidencePolicy({scope,query,messages:input.messages})===true;run=await adapter.recall(scope,query,8,{rawEvidence:allowRaw,focusContext});validateRecall(run);
 const memory=recallRequestContent(run);if(Buffer.byteLength(memory)>24000)throw Error('memory budget exceeded');
 let messages=[{role:'system',content:memory},...contextWarnings(run),...input.messages];
 if(awarenessHost&&shouldCapture&&capturePurpose==='conversation'&&last.role==='user'){try{awareness=await awarenessHost.prepare(messages);if(awareness)messages=awareness.messages;}catch{onReceipt({awareness_state:'inbox_unavailable'});}}
 notice=await noticePending;if(notice?.content)messages=[...messages.slice(0,1),{role:'system',content:notice.content},...messages.slice(1)];
 naturalRegistration=await naturalPending;if(naturalRegistration)messages=[...messages.slice(0,1),{role:'system',content:naturalRegistration.instruction},...messages.slice(1)];
 if(associationRegistration)messages.splice(1,0,{role:'system',content:'如首轮记忆已经足够，不必继续检索。仅当思考中出现具体缺失线索，可自主调用 recall_association 一次；没有结果不代表记忆不存在。'});
 if(strategyQuery){try{strategies=await strategyHost.select(strategyQuery,input.model);if(!Array.isArray(strategies))throw Error('invalid strategies');}catch{strategies=[];onReceipt({strategy_state:'unavailable'});}if(strategies.length)messages.splice(1,0,{role:'system',content:JSON.stringify(strategies)});}
 body=JSON.stringify({...input,messages,...((naturalRegistration||associationRegistration)?{tools:[...(naturalRegistration?[naturalRegistration.tool]:[]),...(associationRegistration?[associationTool]:[])],tool_choice:'auto'}:{})});
 const receipt=await adapter.snapshotReadback(scope,run.run_id,JSON.parse(body).messages);if(receipt?.verified!==true)throw Error('snapshot verification failed');await recheckStrategies();
 }catch(e){if(!degradeOnRecallFailure)throw e;recallState='degraded';awareness=null;notice=null;naturalRegistration=null;associationRegistration=false;strategies=[];
 body=JSON.stringify({...input,messages:[{role:'system',content:'长明本轮记忆检索或核验失败。没有可信的外部记忆注入。仅依据当前对话回答，不得声称已查到历史记忆或已核验当前任务状态。涉及历史状态的操作应暂缓核验。'},...input.messages],tools:undefined,tool_choice:undefined,functions:undefined,function_call:undefined});}
 const recordTransport=async(response,wire,transportRun=run)=>{if(recallState!=='verified'||!transportRun?.run_id||typeof adapter.recallTransport!=='function')return;try{const b={run_id:transportRun.run_id,request_hash:sha(JSON.parse(wire).messages),body_hash:createHash('sha256').update(wire).digest('hex'),upstream_status:response.status};if(recallOutbox){recallOutbox.enqueue(b);await recallOutbox.drain();}else await adapter.recallTransport(scope,b.run_id,b.request_hash,b.body_hash,b.upstream_status);}catch{onReceipt({run_id:run.run_id,transport_receipt_state:'failed'});}};
 let response=await fetchImpl(endpoint,{method:'POST',headers:{authorization:'Bearer '+upstreamKey,'content-type':'application/json'},body,redirect:'error',signal:AbortSignal.timeout(120000)});
 await recordTransport(response,body);
 await recordStrategies(response,body);
 if((naturalRegistration||associationRegistration)&&response.ok){const allowedNames=[...(naturalRegistration?['remember']:[]),...(associationRegistration?['recall_association']:[])];const parsed=await inspectNaturalResponse(response,1048576,allowedNames);if(parsed.call){
  const firstBody=body;onReceipt({run_id:run.run_id,recall_state:recallState,body_hash:createHash('sha256').update(firstBody).digest('hex'),upstream_status:response.status,provider_delivery_verified:false,natural_memory_stage:'tool_request'});
  const next=JSON.parse(firstBody);delete next.tools;delete next.tool_choice;
  let result;
  if(parsed.call.function.name==='remember'){result=await naturalRegistration.execute(parsed.args,boundSource);onReceipt({natural_memory_state:result.state,canonicalMemoryChanged:false});}
  else {
   const args=parsed.args,cue=typeof args?.cue==='string'?args.cue.normalize('NFKC').trim():'';
   if(!args||Array.isArray(args)||Object.keys(args).length!==1||!cue||cue.length>160||cue.toLowerCase()===query.normalize('NFKC').trim().toLowerCase()||/\p{Cc}/u.test(cue))result={state:'invalid_or_repeated_cue'};
   else try{const candidate=await adapter.recall(scope,cue,3,{retrievalHint:'skip_remote_vector',associationParent:run.run_id});validateRecall(candidate);
    const known=new Set(run.selected.map(r=>r.id));const newCount=candidate.selected.filter(r=>!known.has(r.id)).length;const content=recallRequestContent(candidate);
    if(newCount&&candidate.selected.length<=3&&!candidate.degraded&&Buffer.byteLength(content)<=6000&&Buffer.byteLength(next.messages[0].content)+Buffer.byteLength(content)<=24000){secondaryRun=candidate;next.messages.splice(1,0,{role:'system',content});result={state:'selected_for_verified_context',new_count:newCount};}else result={state:'no_additional_context'};
   }catch{result={state:'unavailable'};}
   onReceipt({association_state:result.state,association_run_id:secondaryRun?.run_id??null});
  }
  next.messages.push({role:'assistant',content:null,tool_calls:[parsed.call]},{role:'tool',tool_call_id:parsed.call.id,content:JSON.stringify(result)});
  // Both runs must verify the same actual message array, including current source/revision evidence.
  const verified=await adapter.snapshotReadback(scope,run.run_id,next.messages);if(verified?.verified!==true)throw Error('second snapshot verification failed');
  if(secondaryRun){const v=await adapter.snapshotReadback(scope,secondaryRun.run_id,next.messages,1);if(v?.verified!==true)throw Error('association snapshot verification failed');}
  await recheckStrategies();body=JSON.stringify(next);
  response=await fetchImpl(endpoint,{method:'POST',headers:{authorization:'Bearer '+upstreamKey,'content-type':'application/json'},body,redirect:'error',signal:AbortSignal.timeout(120000)});
  await recordTransport(response,body);if(secondaryRun)await recordTransport(response,body,secondaryRun);
 await recordStrategies(response,body);
  if(response.ok){const final=await inspectNaturalResponse(response,1048576,allowedNames);if(final.call)throw Error('repeated internal tool call');response=final.response;}
 }else response=parsed.response;}
 if(draftGuard&&response.ok){let decision;try{decision=await draftGuard.inspect(response)}catch(e){if(!response.bodyUsed)await response.body?.cancel().catch(()=>{});throw e}if(decision.blocked){onReceipt({guard_state:'blocked',rule_ids:decision.hits.map(h=>h.id)});return fail(409,'Everlight blocked a known erroneous draft; regenerate with corrected context.');}response=decision.response;onReceipt({guard_state:decision.checked?'checked':'inactive'});}
 const noticeReceipt=notice&&response.ok?Promise.resolve().then(()=>noticeHost.confirm(notice,JSON.parse(body).messages)).then(r=>onReceipt({d14_notice_state:r?.host_attested?'host_attested':'unverified'})).catch(()=>onReceipt({d14_notice_state:'receipt_failed'})):Promise.resolve();
 let awarenessDelivered=false;if(awareness&&response.ok){try{const r=await awarenessHost.confirm(awareness,JSON.parse(body).messages);awarenessDelivered=r.host_attested===true;onReceipt({awareness_state:awarenessDelivered?'host_attested':'receipt_unverified'});}catch{onReceipt({awareness_state:'receipt_failed'});}}
 onReceipt({run_id:run?.run_id??null,recall_state:recallState,body_hash:createHash('sha256').update(body).digest('hex'),upstream_status:response.status,provider_delivery_verified:false});
 res.writeHead(response.status,{'content-type':response.headers.get('content-type')||'application/json','cache-control':'no-store','x-everlight-recall-state':recallState});if(response.body){
 const observer=shouldCapture&&response.ok?replyCapture(response.headers.get('content-type')||''):null;
 const tap=new Transform({transform(chunk,enc,cb){observer?.push(chunk);cb(null,chunk)},flush(cb){(async()=>{if(!observer)return;for(const choice of observer.finish()){const id='gateway-reply:'+sha([identity.id,input.model,choice.index,choice.text,...(awarenessDelivered?[awareness.request_ref]:[])]);try{const result=await adapter.request('POST','/api/v8/host/capture-and-route',{source:{scope,actor:'gateway-upstream',kind:'client_response',source_ref:id,source_id:id,body:{text:choice.text,attribution:'unverified_generated_response',purpose:identity.purpose,...(process.env.EVERLIGHT_D14E6B_TASK_CONTEXT==='1'&&boundSource&&last.role==='user'&&typeof user.content==='string'&&capturePurpose==='conversation'&&recallState==='verified'&&!awarenessDelivered&&(input.n===undefined||input.n===1)?{context_kind:'gateway_request_reply_v1',request_source_id:boundSource.id,...(continuation||{})}:{}),...(boundSource&&last.role==='user'&&typeof user.content==='string'&&capturePurpose==='conversation'&&recallState==='verified'&&!awarenessDelivered&&(input.n===undefined||input.n===1)?{focus_reply_to:boundSource.id}:{}),...(continuityLive&&boundSource&&last.role==='user'&&recallState==='verified'&&!awarenessDelivered&&(input.n===undefined||input.n===1)?{continuity_reply_to:boundSource.id}:{}),...(awarenessDelivered?{awareness_request_ref:awareness.request_ref}:{})}},event:{scope,event_id:id,source_id:id,origin:'host_verified',signal:'unclassified_client_response'},process:false});onReceipt({event_id:id,capture_state:result?.inbox?.state||'unknown',canonicalMemoryChanged:false});}catch{onReceipt({event_id:id,capture_state:'failed',canonicalMemoryChanged:false});}}})().then(()=>cb(),cb)}});
 await pipeline(Readable.fromWeb(response.body),tap,res);
 }else res.end();
 await noticeReceipt;
 }catch(e){if(!res.headersSent)fail(503,'Everlight or upstream unavailable');else res.destroy();}
 });
 server.on('close',()=>{clearInterval(timer);if(recallOutbox){try{recallOutbox.close();}catch{ /* in-flight drain retains durable pending row */ }}});
 return server;
}
if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href){const e=process.env;const adapter=new EverlightHostAdapter({baseUrl:e.EVERLIGHT_CORE_URL||'http://127.0.0.1:8790',token:e.EVERLIGHT_CORE_TOKEN,hostToken:e.EVERLIGHT_SHARED_HOST_TOKEN});createGateway({adapter,recallOutboxPath:e.EVERLIGHT_CORE_DB?e.EVERLIGHT_CORE_DB+'.recall-outbox-h6x.sqlite':null,scope:e.EVERLIGHT_BOUND_SCOPE||'personal',key:e.EVERLIGHT_GATEWAY_KEY,upstream:e.EVERLIGHT_UPSTREAM_URL,upstreamKey:e.EVERLIGHT_UPSTREAM_KEY,models:(e.EVERLIGHT_MODELS||'').split(',').filter(Boolean),capture:e.EVERLIGHT_GATEWAY_CAPTURE==='1',naturalMemory:e.EVERLIGHT_D14E1_NATURAL_GATEWAY==='1',associationRecall:e.EVERLIGHT_J12_ASSOCIATION_GATEWAY==='1',capturePurpose:e.EVERLIGHT_GATEWAY_PURPOSE||'unknown',degradeOnRecallFailure:e.EVERLIGHT_GATEWAY_DEGRADE==='1',awarenessHost:e.EVERLIGHT_AWARENESS_GATEWAY_D13==='1'?createAwarenessHost({url:e.EVERLIGHT_NOTIFY_URL||'http://127.0.0.1:8794',aiToken:e.EVERLIGHT_NOTIFY_AI_TOKEN,receiptToken:e.EVERLIGHT_NOTIFY_RECEIPT_TOKEN}):null,draftGuard:null,noticeHost:null,strategyHost:null,allowedOrigins:(e.EVERLIGHT_GATEWAY_ORIGINS||'').split(',').map(x=>x.trim()).filter(Boolean),onReceipt:r=>console.log(JSON.stringify(r))}).listen(Number(e.EVERLIGHT_GATEWAY_PORT||8792),'127.0.0.1');}
