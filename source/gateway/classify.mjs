// Conservative candidate classifier; no inference of consent, identity or real-world facts.
export function classifyUser({scope,id,text,purpose,plainText}) {
 const base={scope,event_id:id,source_id:id,origin:'host_verified',signal:'unclassified_client_request'};
 if(purpose!=='conversation'||!plainText||typeof text!=='string')return base;
 // Deliberately narrow, single-sentence self-report. Review remains mandatory.
 if(/^我(?:很)?(?:喜欢|偏爱|不喜欢)[\p{Script=Han}a-zA-Z0-9 ]{1,40}[。！!]?$/u.test(text)&&! /假如|假装|扮演|角色|剧情|私密|性爱|密码|地址|病|身份证/.test(text))return {...base,signal:'explicit_preference',payload:{statement:text,subject:'gateway-client',attribution:'configured_conversation_self_report_unverified'},reason:'Literal first-person preference candidate; context and identity require review'};
 return base;
}
