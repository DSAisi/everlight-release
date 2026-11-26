// Release metadata only. Never download, extract, execute, or write user data.
export const LOCAL_RELEASE=Object.freeze({version:'0.1.0-beta.14',build:'RC6-J12-Beta14',channel:'beta'});
function parseVersion(s){
 if(typeof s!=='string'||s.length>96)return null;
 const m=/^v?(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/.exec(s);
 if(!m)return null;const pre=m[4]?.split('.')||[];
 if(pre.some(x=>/^\d+$/.test(x)&&x.length>1&&x[0]==='0'))return null;
 return {version:s.replace(/^v/,''),main:m.slice(1,4).map(Number),pre};
}
export function compareVersions(a,b){const x=parseVersion(a),y=parseVersion(b);if(!x||!y)throw Error('invalid version');
 for(let i=0;i<3;i++)if(x.main[i]!==y.main[i])return Math.sign(x.main[i]-y.main[i]);
 if(!x.pre.length||!y.pre.length)return Math.sign(y.pre.length-x.pre.length);
 for(let i=0;i<Math.max(x.pre.length,y.pre.length);i++){const p=x.pre[i],q=y.pre[i];if(p===undefined)return -1;if(q===undefined)return 1;if(p===q)continue;const pn=/^\d+$/.test(p),qn=/^\d+$/.test(q);if(pn&&qn)return BigInt(p)>BigInt(q)?1:-1;if(pn!==qn)return pn?-1:1;return p>q?1:-1;}return 0;
}
export function createUpdateChecker({repo='',channel='beta',auto=false,fetcher=globalThis.fetch,clock=Date.now,local=LOCAL_RELEASE}={}){
 const validRepo=/^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9_.-]{1,100}$/.test(repo)&&!repo.endsWith('/.')&&!repo.endsWith('/..');
 const configured=validRepo&&['stable','beta'].includes(channel)&&!!parseVersion(local.version);
 const state={status:configured?'not_checked':repo?'invalid_config':'not_configured',checkedAt:null,latest:null,error:null};
 let pending=null,lastAttempt=null;
 const view=()=>({...state,local:{...local},repository:configured?repo:null,channel,auto:configured&&auto,configured,installEnabled:false,signatureVerified:false,compatibility:'unknown',stale:state.status==='error'||(state.checkedAt!==null&&clock()-Date.parse(state.checkedAt)>24*3600*1000)});
 async function run(){
  try{
   const response=await fetcher(`https://api.github.com/repos/${repo}/releases?per_page=100`,{method:'GET',redirect:'error',credentials:'omit',headers:{Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Everlight-release-check'},signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error(response.status===429||response.status===403?'rate_limited_or_denied':`http_${response.status}`);
   const reader=response.body?.getReader();if(!reader)throw Error('invalid_response');let bytes=0;const chunks=[];
   try{for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>2_000_000)throw Error('response_too_large');chunks.push(Buffer.from(value));}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
   const rows=JSON.parse(Buffer.concat(chunks).toString('utf8'));if(!Array.isArray(rows))throw Error('invalid_response');
   // Pagination is deliberately bounded; never assert globally latest with incomplete listing.
   if(rows.length>=100||/rel="next"/.test(response.headers.get('link')||''))throw Error('release_list_incomplete');
   const candidates=rows.filter(r=>r&&r.draft===false&&typeof r.prerelease==='boolean'&&parseVersion(r.tag_name)&&Boolean(parseVersion(r.tag_name).pre.length)===r.prerelease&&(channel==='beta'||!r.prerelease));
   candidates.sort((a,b)=>compareVersions(b.tag_name,a.tag_name));const top=candidates[0];
   state.latest=top?{version:parseVersion(top.tag_name).version,tag:top.tag_name,notes:typeof top.body==='string'?top.body.slice(0,6000):'',publishedAt:typeof top.published_at==='string'?top.published_at.slice(0,40):null,url:`https://github.com/${repo}/releases/tag/${encodeURIComponent(top.tag_name)}`} :null;
   state.status=!top?'no_release':compareVersions(top.tag_name,local.version)>0?'update_available':compareVersions(top.tag_name,local.version)===0?'up_to_date':'local_newer';state.checkedAt=new Date(clock()).toISOString();state.error=null;
  }catch(e){state.status='error';state.error=/^(rate_limited_or_denied|http_\d{3}|invalid_response|response_too_large|release_list_incomplete)$/.test(e.message)?e.message:'network_or_parse_error';}
  return view();
 }
 function check(){if(!configured)return Promise.resolve(view());if(pending)return pending;if(lastAttempt!==null&&clock()-lastAttempt<60000)return Promise.resolve(view());lastAttempt=clock();pending=run().finally(()=>{pending=null});return pending;}
 function start(){if(!configured||!auto)return null;void check();const timer=setInterval(()=>void check(),6*3600*1000);timer.unref();return timer;}
 return {view,check,start};
}
