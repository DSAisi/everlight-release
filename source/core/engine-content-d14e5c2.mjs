import {applyCandidates,reflectionEnabled} from './auto-candidates-d14e2.mjs';
export const enabled=()=>process.env.EVERLIGHT_D14E5C2_CONTENT==='1'&&reflectionEnabled();
// Same D11 transaction and existing E2 compiler. No second classifier, no invented observation.
// Only unambiguously delimited, separately quoted observation and reflection are eligible.
export function reflectionFromAwareness(c,row,data,awareness,existing){
 if(!enabled()||data.role!=='assistant'||data.followup||existing.some(x=>x.kind==='reflection')||!Array.isArray(awareness))return [];
 const src=JSON.parse(data.src.body);if(src.auto_memory_allowed!==true||src.private===true||src.sensitive===true||src.fiction===true)return [];
 const lines=data.text.split(/\r?\n/);const claims=lines.filter(x=>/^反思[：:]\s*/.test(x)).map(x=>x.replace(/^反思[：:]\s*/, '').trim());const obs=lines.filter(x=>/^观察[：:]\s*/.test(x)).map(x=>x.replace(/^观察[：:]\s*/, '').trim());
 if(claims.length!==1||obs.length!==1)return [];const [claim]=claims,[observation]=obs;
 if(claim.length<2||observation.length<2||claim.length>300||observation.length>800||claim===observation||!/(我|本人|\bI\b)/i.test(claim)||!awareness.some(a=>a.kind==='reflection'&&a.quote===claim))return [];
 // E2 ordinal range 100..103: if other E2 candidates already exist, avoid a collision; no duplicate creation.
 if(existing.length)return [];
 return applyCandidates(c,row,data,[{kind:'reflection',category:'self_reflection',claim,observation}]);
}
