// Trusted host adapter, not a model-facing database API. Model arguments never choose a source.
export const naturalTool=Object.freeze({type:'function',function:{name:'remember',description:'可选：希望记住本轮已经真实捕获的内容时调用。无需填写分类、格式、ID或任何参数。普通聊天自动记录候选，不必重复调用。',parameters:{type:'object',properties:{},additionalProperties:false}}});
export const naturalInstruction='正常聊天和工作，不用写记忆表格。需要主动记住本轮内容时，可调用 remember()；记录候选不等于已入库。';
export function createNaturalMemoryHost({adapter,scope,resolveCurrentSource,clock=Date.now,ttlMs=30000,discoveryMs=300}={}){
 if(typeof adapter?.request!=='function'||typeof scope!=='string'||!scope||typeof resolveCurrentSource!=='function')throw Error('trusted host binding required');
 let cached=null,pending=null,expires=0;
 async function available(){if(clock()<expires)return cached;if(pending)return pending;pending=(async()=>{let timer;try{const caps=await Promise.race([adapter.request('GET','/api/v8/write/easy-capabilities'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('discovery timeout')),discoveryMs)})]);cached=caps?.enabled===true&&caps.version==='everlight.easy-write.e0'&&caps.requires_host_binding===true;}catch{cached=false;}finally{clearTimeout(timer);expires=clock()+ttlMs;pending=null;}return cached;})();return pending;}
 async function execute(args,context){
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).length)return {state:'invalid_arguments',message:'无需参数。原话仍按宿主自动捕获流程处理。',canonicalMemoryChanged:false};
  if(!await available())return {state:'unavailable',message:'记忆入口暂不可用，不能声称已记录。',canonicalMemoryChanged:false};
  const source=await resolveCurrentSource(context);if(!source||source.scope!==scope||typeof source.id!=='string'||!source.id)return {state:'unavailable',message:'本轮没有可验证来源，暂不能记忆。',canonicalMemoryChanged:false};
  try{const r=await adapter.request('POST','/api/v8/write/easy',{scope,source_id:source.id,intent:{}});if(r.state==='classification_inbox')return {state:r.state,message:'已交给自动分类，尚未确认入库。',canonicalMemoryChanged:false};if(r.state==='held')return {state:'held',message:'来源已保留，记忆暂缓处理，尚未入库。',canonicalMemoryChanged:false};return {state:'unverified',message:'结果未核实，不能声称已入库。',canonicalMemoryChanged:false};}catch{return {state:'unavailable',message:'记忆请求未核实，不能声称已入库。',canonicalMemoryChanged:false};}
 }
 return {available,execute,async discover(){return await available()?{tool:structuredClone(naturalTool),instruction:naturalInstruction,execute}:null;}};
}
// Only a complete single internal tool request is accepted. Never execute client-supplied tool calls.
export async function inspectNaturalResponse(response,maxBytes=1048576,allowedNames=['remember']){
 if(!response.ok)return {response};if(!response.headers.get('content-type')?.includes('application/json'))throw Error('internal memory tool requires JSON');
 const reader=response.body?.getReader();if(!reader)throw Error('missing response');let n=0;const chunks=[];try{while(true){const {done,value}=await reader.read();if(done)break;n+=value.byteLength;if(n>maxBytes)throw Error('internal response too large');chunks.push(Buffer.from(value));}}catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
 const bytes=Buffer.concat(chunks),data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));const rebuilt=new Response(bytes,{status:response.status,headers:{'content-type':'application/json'}});
 if(!Array.isArray(data.choices)||data.choices.length!==1)throw Error('unsupported internal response');const choice=data.choices[0],m=choice.message;
 if(!m||m.role!=='assistant'||m.function_call)throw Error('invalid internal response');if(!m.tool_calls){if(choice.finish_reason==='tool_calls')throw Error('missing tool call');return {response:rebuilt};}
 const c=m.tool_calls;if(choice.finish_reason!=='tool_calls'||!Array.isArray(c)||c.length!==1||c[0].type!=='function'||!allowedNames.includes(c[0].function?.name)||typeof c[0].id!=='string'||!c[0].id||c[0].id.length>256||typeof c[0].function.arguments!=='string'||c[0].function.arguments.length>8192||m.content!=null&&m.content!=='')throw Error('unsupported internal tool call');
 let args;try{args=JSON.parse(c[0].function.arguments);}catch{args=null;}return {call:{id:c[0].id,type:'function',function:{name:c[0].function.name,arguments:c[0].function.arguments}},args};
}
