// Separate machine admission, not an AI/human review. Only new historical records.
export function historicalAdmissionErrors(core,p,now=Date.now()){
 const b=JSON.parse(p.payload), refs=JSON.parse(p.sources), errors=[];
 const past=v=>typeof v==='string'&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v))&&Date.parse(v)<=now;
 if(p.scope!=='personal'||p.target!==null||p.expected_revision!==null)errors.push('new personal historical records only');
 if(!['episode','procedure','code','affect','fact','preference','reflection','document'].includes(p.kind))errors.push('kind requires regular review');
 if(p.kind==='episode'&&!past(b.happened_at))errors.push('past event date required');
 if(p.kind==='affect'&&(!past(b.observed_at)||b.evidence_status==='inferred'))errors.push('explicit historical affect required');
 if(['fact','preference'].includes(p.kind)&&(!past(b.temporal?.event_at)||!past(b.temporal?.valid_until)||b.evidence_status==='inferred'))errors.push('expired historical fact only');
 if(['procedure','code'].includes(p.kind)&&b.verification!=='untested')errors.push('verification claims require regular review');
 const texts=[],actors=new Set(),structured=[];
 for(const ref of refs){const s=core.getSource(ref,p.scope);if(!s||s.kind!=='historical_import'){errors.push('historical source required');continue;}const x=JSON.parse(s.body);if(x.historical!==true||x.imported!==true||x.continuity_live!==false||x.origin!=='historical'||typeof x.text!=='string'||!past(x.happened_at)){errors.push('dated archived source required');continue;}
 const raw=x.raw; if(raw?.format==='everlight.historical-note.v1'&&raw.kind===p.kind&&raw.slot===p.slot)structured.push(raw.payload); if([x,raw].some(o=>o&&typeof o==='object'&&(o.private===true||o.sensitive===true||o.fiction===true||o.roleplay===true||o.private_media===true||['private','sensitive','fiction','roleplay'].includes(o.visibility)||['private','sensitive'].includes(o.privacy)||['fiction','roleplay','imagined'].includes(o.context_kind)||['fiction','roleplay'].includes(o.reality))))errors.push('excluded source');texts.push(x.text);actors.add(s.actor);}
 const evidence=texts.join('\n');
 const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
 if(['reflection','document'].includes(p.kind)){if(!structured.some(x=>JSON.stringify(canonical(x))===JSON.stringify(canonical(b))))errors.push('explicit unchanged structured historical note required');if(p.kind==='reflection'&&b.verified_level!=='guess')errors.push('historical reflection must remain unverified');if(p.kind==='document'&&!['received','referenced'].includes(b.access_status))errors.push('document reading not verified');}
 const hasDate=v=>{if(!past(v))return false;const [y,m,d]=v.slice(0,10).split('-');return evidence.includes(v.slice(0,10))||evidence.includes(`${y}年${Number(m)}月${Number(d)}日`);};
 if(p.kind==='episode'&&(!hasDate(b.happened_at)||!Array.isArray(b.participants)||b.participants.some(x=>!actors.has(x)&&!evidence.includes(x))))errors.push('event date or participant not explicitly supported');
 if(p.kind==='affect'&&(!actors.has(b.subject)&&!evidence.includes(b.subject)))errors.push('affect subject unsupported');
 if(['fact','preference'].includes(p.kind)&&(!hasDate(b.temporal?.event_at)||!hasDate(b.temporal?.valid_until)))errors.push('fact historical dates not explicit');
 // Conservative verbatim check, not a claim of semantic truth. Unclear cases remain archived/pending.
 if(/也许|可能|假如|如果|假设|虚构|角色扮演|计划|打算|尚未完成|没有完成|未完成|perhaps|maybe|hypothetical|roleplay/i.test(evidence))errors.push('ambiguous source');
 const fields={episode:['summary','outcome'],procedure:['problem','solution','environment'],code:['problem','solution','environment'],affect:['expression'],fact:['statement'],preference:['statement'],reflection:['claim','observation','next_action'],document:['path','version','summary']}[p.kind]||[];
 for(const k of fields){const v=b[k];if(v!=null&&(typeof v!=='string'||!v.trim()||!evidence.includes(v.trim())))errors.push('non-verbatim '+k);}
 if(core.jointStatus({scope:p.scope,id:p.id}).decisions.some(d=>d.decision==='reject'))errors.push('prior rejection');
 return [...new Set(errors)];
}
