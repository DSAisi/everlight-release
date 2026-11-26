/** Host tool registration. Do not expose adapter, tokens, scope or source IDs to model. */
export async function connectEasyWriter({adapter,scope,resolveCurrentSource}){
 if(!adapter||typeof adapter.request!=='function'||typeof scope!=='string'||!scope||typeof resolveCurrentSource!=='function')throw Error('trusted host binding required');
 const caps=await adapter.request('GET','/api/v8/write/easy-capabilities');if(!caps.enabled||caps.version!=='everlight.easy-write.e0')throw Error('easy writer not available');
 return {tool:{type:'function',function:caps.tool},instruction:'普通聊天自然进行，宿主自动捕获。仅需要主动保留一项内容时调用 remember；不写数据库格式，不编造信息。候选不是已入库。',async execute(args,turnContext){
  if(!args||typeof args!=='object'||Array.isArray(args)||Object.keys(args).some(k=>!['kind','category','quote','details'].includes(k)))throw Error('unsupported model arguments');
  const source=await resolveCurrentSource(turnContext);if(!source||source.scope!==scope||typeof source.id!=='string'||!source.id)throw Error('real current source required');
  return adapter.request('POST','/api/v8/write/easy',{scope,source_id:source.id,intent:args});
 }};
}
