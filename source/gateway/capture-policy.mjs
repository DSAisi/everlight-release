import {createHash} from 'node:crypto';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
// Only server configuration establishes purpose. Client prompts cannot grant it.
export function captureIdentity(scope, messages, purpose='unknown') {
 if(!['unknown','conversation','background'].includes(purpose))throw Error('invalid capture purpose');
 const turns=messages.filter(m=>m?.role==='user'||m?.role==='assistant').map(m=>[m.role,m.content,m.tool_calls??null]);
 // Ignore changing system prompts and generation parameters. Preserve repeated turns in a full history.
 return {id:hash([scope,purpose,turns]),purpose,attribution:purpose==='conversation'?'configured_conversation_unverified': 'unverified_client_request'};
}
