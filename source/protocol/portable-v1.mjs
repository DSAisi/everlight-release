/** Host-neutral Everlight protocol. No DSH imports or host-specific paths. */
export const PROTOCOL_VERSION='everlight.portable.v1';
export const SLOT_RULES=Object.freeze({
 S01:{writer:'host',kind:['raw_event'],write:'source',immutable:true},
 S02:{writer:'engine',kind:['run_receipt'],write:'internal',immutable:true},
 S03:{writer:'reviewed',kind:['goal'],write:'proposal_review_commit'},
 S04:{writer:'reviewed',kind:['episode'],write:'proposal_review_commit'},
 S05:{writer:'reviewed',kind:['fact','preference'],write:'proposal_review_commit'},
 S06:{writer:'reviewed',kind:['procedure','code'],write:'proposal_review_commit'},
 S07:{writer:'reviewed',kind:['relationship'],write:'proposal_review_commit'},
 S08:{writer:'reviewed',kind:['affect'],write:'proposal_review_commit'},
 S09:{writer:'authorized',kind:['identity'],write:'proposal_review_commit'},
 S10:{writer:'engine',kind:['recall_trace'],write:'internal',immutable:true},
 S11:{writer:'reviewed',kind:['reflection'],write:'proposal_review_commit'},
 S12:{writer:'reviewed',kind:['document','media'],write:'proposal_review_commit'}
});
export const REQUIRED_PAYLOAD=Object.freeze({
 goal:['summary','owner','intent','state'],episode:['summary','participants'],fact:['statement','subject','attribution'],preference:['statement','subject','attribution'],procedure:['problem','solution','environment'],code:['problem','solution','environment'],relationship:['subject','relation','object'],affect:['expression','attribution','observed_at'],identity:['statement','subject','basis'],reflection:['claim','observation','verified_level'],document:['path','version'],media:['path','version','media_type']
});
export const OPERATIONS=Object.freeze({guidance:'POST /api/v8/guidance',validate:'POST /api/v8/proposal/validate',hostHooks:'GET /api/v8/host/hooks',capture:'POST /api/v8/source',writeEvent:'POST /api/v8/write/events',writeInbox:'GET /api/v8/write/inbox',writeProcess:'POST /api/v8/write/process',propose:'POST /api/v8/proposal',review:'POST /api/v8/review/scoped',commit:'POST /api/v8/commit/scoped',revoke:'POST /api/v8/revoke',recall:'POST /api/v8/recall',readback:'POST /api/v8/recall/readback',dreamStart:'POST /api/v8/dream/start',dreamAdvance:'POST /api/v8/dream/advance',crsiPropose:'POST /api/v8/crsi/propose',crsiEvaluate:'POST /api/v8/crsi/evaluate',sharedView:'GET /api/v8/shared/view',status:'GET /api/v8/status',memories:'GET /api/v8/memories'});
export function checkProposalShape(p){const errors=[];const rule=SLOT_RULES[p?.slot];if(!rule)errors.push('unknown slot');else if(rule.write!=='proposal_review_commit')errors.push('system-only slot');else if(!rule.kind.includes(p.kind))errors.push('kind/slot mismatch');if(typeof p?.scope!=='string'||!p.scope.trim())errors.push('missing scope');if(typeof p?.reason!=='string'||!p.reason.trim())errors.push('missing reason');if(typeof p?.idempotency_key!=='string'||!p.idempotency_key.trim())errors.push('missing idempotency_key');if(!Array.isArray(p?.source_refs)||!p.source_refs.length||p.source_refs.some(x=>typeof x!=='string'||!x.trim()))errors.push('missing source_refs');if(!p?.payload||typeof p.payload!=='object'||Array.isArray(p.payload))errors.push('invalid payload');else for(const key of REQUIRED_PAYLOAD[p.kind]||[])if(!(typeof p.payload[key]==='string'&&p.payload[key].trim())&&!(Array.isArray(p.payload[key])&&p.payload[key].length))errors.push('missing payload.'+key);return {ok:errors.length===0,errors}}
