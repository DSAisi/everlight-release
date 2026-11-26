import {dreamReplay} from './dream-progression-beta13.mjs';
import {inviteDream,dreamInvitationStatus,dreamRevision} from './dream-sync-beta10.mjs';
import {dreamOpportunity,dreamImprovement} from './dream-host-beta09.mjs';
import {inviteProfile} from '../contracts/invite-profile-beta08.mjs';
import {workContact} from './work-contact-j10.mjs';
import {defaultContextBudgetBytes,readContextBudget} from './context-budget-d14c2.mjs';
import {installLiveRevision,liveRevision} from './live-revision-w3h6f.mjs';
import {panelMainline} from './panel-mainline-w3h4.mjs';
import {qualityAudit} from './quality-w1.mjs';
import {createConnectHandler} from './connect-e12.mjs';
import {recordEngineEvent} from './engine-events-d14e5c.mjs';
import {recordHostMemory} from './host-memory-d14e5b.mjs';
import {recordActivity,activityPage} from './activity-d14e4c.mjs';
import {recordToolEvidence,readToolEvidence} from './tool-evidence-d14e4b.mjs';
import {captureTool,toolStatus} from './tool-lifecycle-d14e4.mjs';
import {capabilities as easyCapabilities,submitEasy,easyStatus} from './easy-write-d14e0.mjs';
import {installSourceIndex,searchSources,expandSource} from './source-index-d14c2b.mjs';
import {startSourceIndex} from './source-index-worker-d14c2b.mjs';
import {startIndexMaintenance} from './index-maintenance-d14c.mjs';
import {notificationFeed,notificationEvents} from './notification-feed-d12.mjs';
import {apiContracts,assertApi} from '../protocol/write-api-d9.mjs';
import {contracts as d9Contracts,systemContracts,moduleContracts,assertContract as assertD9,enabled as d9Enabled} from '../protocol/write-contract-d9.mjs';
import {template, RULES, assertTemplate} from '../protocol/write-template-d7.mjs';
import {options as exportOptions,serveArchive} from './portable-export.mjs';
import {remoteRetrieval} from './remote-retrieval.mjs';
import {remoteMode,retrievalInventory,recallWithPolicy} from './retrieval-policy-j7.mjs';
import {loadRetrievalProviders} from './plugin-loader.mjs';
import http from 'node:http';import crypto from 'node:crypto';import path from 'node:path';import {fileURLToPath} from 'node:url';import {EverlightCore} from './engine.mjs';import {guidance,inspectCandidate,HOST_HOOKS} from '../protocol/write-guidance.mjs';
import {readFileSync} from 'node:fs';
const aiPlaybook=JSON.parse(readFileSync(new URL('../contracts/AI_WRITE_PLAYBOOK.json',import.meta.url),'utf8'));
const apiContract=JSON.parse(readFileSync(new URL('../contracts/API_INVENTORY.json',import.meta.url),'utf8'));
const here=path.dirname(fileURLToPath(import.meta.url));
const token=process.env.EVERLIGHT_CORE_TOKEN||'';
if(token.length<24){console.error('EVERLIGHT_CORE_TOKEN must be at least 24 characters');process.exit(2)}
const hostToken=process.env.EVERLIGHT_SHARED_HOST_TOKEN||'';
const vitalsToken=process.env.EVERLIGHT_VITALS_TOKEN||'';
const vitalsSecret=req=>/^[a-f0-9]{64}$/i.test(vitalsToken)&&![token,hostToken,process.env.EVERLIGHT_AI_DECISION_TOKEN,process.env.EVERLIGHT_HUMAN_DECISION_TOKEN,process.env.EVERLIGHT_GOVERNANCE_ADMIN_TOKEN].includes(vitalsToken)&&equal(req.headers['x-everlight-vitals-token']||'',vitalsToken)?vitalsToken:undefined;
// Optional single-tenant deployment guard. This is NOT multi-user authentication.
const boundScope=process.env.EVERLIGHT_BOUND_SCOPE||'';
const coreDbPath=process.env.EVERLIGHT_CORE_DB||path.join(here,'..','private-data','core.sqlite');
const rawScope=process.env.EVERLIGHT_D14C2B_RAW==='1'&&boundScope?boundScope:null;
const core=new EverlightCore(coreDbPath,{retrievalProviders:await loadRetrievalProviders(),contextBudget:readContextBudget(process.env.EVERLIGHT_D14C2_CONTEXT_BYTES)||defaultContextBudgetBytes,rawRecallScope:process.env.EVERLIGHT_D14C3_AUTO_RAW==='1'?rawScope:null});
if(rawScope){installSourceIndex(core.db,rawScope);startSourceIndex(coreDbPath,rawScope);}
const connect=createConnectHandler(core.db,process.env,core);
installLiveRevision(core.db);
const remote=remoteRetrieval();
const retrievalRemoteMode=remoteMode();
if(core.indexedRecall)startIndexMaintenance(coreDbPath);
const respond=(res,code,body)=>{res.writeHead(code,{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});res.end(JSON.stringify(body))};
const equal=(a,b)=>{const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&crypto.timingSafeEqual(x,y)};
const actions={
 'GET /api/v8/ui/live-revision':(_,q)=>liveRevision(core.db,q.get('scope')),
 'GET /api/v8/ui/mainline':(_,q)=>q.get('name')==='retrieval'?{scope:q.get('scope'),read_at:new Date().toISOString(),...retrievalInventory(core,{remoteConfigured:!!remote,mode:retrievalRemoteMode})}:panelMainline(core,q.get('scope'),q.get('name')),
 'POST /api/v8/host/engine-event':b=>recordEngineEvent(core,b),
 'POST /api/v8/host/memory-observation':b=>recordHostMemory(core,b),
 'POST /api/v8/host/activity-event':b=>recordActivity(core,b),
 'GET /api/v8/ui/activities':(_,q)=>activityPage(core,{scope:q.get('scope'),limit:Number(q.get('limit')??20),offset:Number(q.get('offset')??0)}),
 'POST /api/v8/host/tool-evidence':b=>recordToolEvidence(core,b),
 'GET /api/v8/host/tool-evidence':(_,q)=>readToolEvidence(core,{scope:q.get('scope'),run_id:q.get('run_id')}),
 'POST /api/v8/host/tool-event':b=>captureTool(core,b),
 'GET /api/v8/host/tool-status':(_,q)=>toolStatus(core,{scope:q.get('scope'),run_id:q.get('run_id')}),
 'POST /api/v8/vector/page':b=>core.vectorPage(b),
 'POST /api/v8/vector/ack':b=>core.vectorAck(b),
 'GET /api/v8/contract':()=>apiContract,
 'GET /api/v8/ui/quality':(_,q)=>qualityAudit(core,q.get('scope')||'personal',{limit:Number(q.get('limit')||50),offset:Number(q.get('offset')||0)}),
 'GET /api/v8/write/easy-capabilities':()=>easyCapabilities(),
 'GET /api/v8/write/easy-status':(_,q)=>easyStatus(core,q.get('scope')),
 'POST /api/v8/write/easy':b=>submitEasy(core,b),
 'GET /api/v8/write/playbook':()=>({...aiPlaybook,d7_templates:Object.keys(RULES).map(template),d9_templates:d9Contracts(),strict_mode:d9Enabled(),strict_route:'POST /api/v8/write/strict-proposal'}),
 'GET /api/v8/write/templates':()=>({templates:Object.keys(RULES).map(template),system_only:['S01','S02','S10'],legacy_route_compatible:true}),
 'POST /api/v8/write/reminders/tick':b=>core.runWriteTemplateReminders(b),
 'GET /api/v8/write/contracts':()=>({version:'everlight.write.d9',strict_mode:d9Enabled(),templates:d9Contracts(),system:systemContracts,modules:moduleContracts,api:apiContracts}),
 'POST /api/v8/write/strict-proposal':b=>{assertD9(b);return core.propose(b)},
 'POST /api/v8/write/templated-proposal':b=>{assertTemplate(b);return core.propose(b)},
 'POST /api/v8/guidance':b=>guidance(b),
 'POST /api/v8/proposal/validate':b=>inspectCandidate(b),
 'GET /api/v8/host/hooks':()=>({hooks:HOST_HOOKS,production_approved:false}),
 'POST /api/v8/source':b=>core.source(b),
 'POST /api/v8/media/summary':b=>core.capturePhotoSummary(b),
 'POST /api/v8/shared/actions':b=>core.createSharedAction(b),
 'GET /api/v8/shared/actions':(_,q)=>({items:core.sharedActions({scope:q.get('scope')||'personal',state:q.get('state')||undefined})}),
 'POST /api/v8/shared/ack':b=>core.acknowledgeSharedAction(b),
 'POST /api/v8/shared/delivery':b=>core.proveActionDelivery(b),
 'POST /api/v8/shared/resolve':b=>core.resolveSharedAction(b),
 'GET /api/v8/shared/results':(_,q)=>({items:core.actionResults({scope:q.get('scope'),action_id:q.get('action_id')})}),
 'POST /api/v8/write/classification-page':b=>core.classificationPage(b),
 'POST /api/v8/write/classify':b=>core.classifyCaptured(b),
 'POST /api/v8/write/events':b=>core.ingestWriteEvent(b),
 'POST /api/v8/host/capture-and-route':b=>core.captureAndRoute(b),
 'POST /api/v8/write/drain':b=>core.drainWriteInbox(b),
 'GET /api/v8/write/inbox':(_,q)=>({items:core.writeInbox({scope:q.get('scope'),state:q.get('state')||undefined,limit:q.get('limit')||50})}),
 'POST /api/v8/write/process':b=>core.processWriteEvent(b),
 'POST /api/v8/proposal':b=>core.propose(b),
 'GET /api/v8/proposals/page':(_,q)=>core.proposalsPage({scope:q.get('scope')||'personal',state:q.get('state')||'pending',limit:q.get('limit')===null?25:Number(q.get('limit')),offset:q.get('offset')===null?0:Number(q.get('offset'))}),
 'GET /api/v8/proposals/detail':(_,q)=>core.proposalDetail({scope:q.get('scope')||'personal',id:q.get('id')}),
 'GET /api/v8/governance':(_,q)=>core.governance(q.get('scope')||'personal'),
 'POST /api/v8/governance':b=>core.setGovernance(b),
 'GET /api/v8/joint/status':(_,q)=>core.jointStatus({scope:q.get('scope')||'personal',id:q.get('id')}),
 'POST /api/v8/joint/ai':b=>b.auto_commit===true?core.decideAndCommit(b,'ai'):core.jointDecision(b,'ai'),
 'POST /api/v8/joint/human':b=>b.auto_commit===true?core.decideAndCommit(b,'human'):core.jointDecision(b,'human'),
 'POST /api/v8/review/scoped':b=>core.reviewScoped(b),
 'POST /api/v8/review/reminders':b=>core.reviewReminders(b),
 'POST /api/v8/commit/recover':b=>core.recoverCommits(b),
 'POST /api/v8/commit/scoped':b=>core.commitScoped(b),
 'POST /api/v8/review':()=>{const e=new Error('Use scoped trusted review');e.status=410;throw e},
 'POST /api/v8/commit':()=>{const e=new Error('Use scoped trusted commit');e.status=410;throw e},
 'POST /api/v8/revoke':b=>core.revoke(b),
 'POST /api/v8/recall':async b=>{if(typeof b.scope!=='string'||!b.scope.trim()||typeof b.query!=='string'||!b.query.trim())return core.recall(b);return recallWithPolicy(core,b,remote,retrievalRemoteMode);},
 'POST /api/v8/s01/search':b=>searchSources(core.db,b,rawScope),
 'POST /api/v8/s01/expand':b=>expandSource(core.db,b,rawScope),
 'POST /api/v8/recall/readback':b=>core.verifyActualRequest(b),
 'POST /api/v8/recall/transport':b=>core.recordRecallTransport(b),
 'POST /api/v8/dream/candidate-decision':b=>core.dreamCandidateDecision(b),
 'POST /api/v8/tasks/evidence':b=>core.taskEvidence(b),
 'POST /api/v8/dream/resume':b=>core.dreamResume(b),
 'POST /api/v8/dream/invite':b=>inviteDream(core,b),
 'GET /api/v8/dream/invitations':(_,q)=>dreamInvitationStatus(core,q.get('scope')),
 'POST /api/v8/dream/replay':b=>dreamReplay(core,b),
 'POST /api/v8/dream/revision':b=>dreamRevision(core,b),
 'POST /api/v8/dream/opportunity':b=>dreamOpportunity(core,b),
 'POST /api/v8/dream/improvement':b=>dreamImprovement(core,b),
 'POST /api/v8/dream/start':b=>core.dreamStart(b.scope,b.idempotency_key,b.metadata,b.source_ids),
 'POST /api/v8/dream/advance':b=>{if(typeof b.scope!=='string'||!b.scope.trim())throw Object.assign(new Error('Scope required'),{status:403});return core.dreamAdvance(b.id,b.scope,b.expected_stage)},
 'POST /api/v8/crsi/propose':b=>core.crsiPropose(b),
 'POST /api/v8/crsi/evaluate':b=>core.crsiEvaluate(b),
 'POST /api/v8/tasks/event':b=>core.taskEvent(b),
 'POST /api/v8/tasks/reporting':b=>core.setTaskReporting(b),
 'GET /api/v8/tasks/reporting':(_,q)=>({items:core.taskReporting({scope:q.get('scope')||'personal'})}),
 'POST /api/v8/tasks/reporting/tick':b=>core.runTaskReporting(b),
 'GET /api/v8/tasks/board':(_,q)=>({items:core.taskBoard({scope:q.get('scope')||'personal',limit:q.get('limit')||100,offset:Math.max(0,Math.min(1000000,Number(q.get('offset'))||0)),memory_id:q.get('memory_id')||null})}),
 'GET /api/v8/shared/view':(_,q)=>core.sharedView({scope:q.get('scope')||'personal',slot:q.get('slot')||undefined,limit:q.get('limit')||50}),
 'GET /api/v8/health/chains':(_,q)=>core.chainHealth({scope:q.get('scope')||'personal',stale_minutes:q.get('stale_minutes')||30}),
 'POST /api/v8/health/notify':b=>core.notifyChainHealth(b),
 'POST /api/v8/relations/name/propose':b=>core.relationNameProposal(b),
 'POST /api/v8/relations/name/review':b=>core.relationNameDecision({...b,reviewer:'human'}),
 'POST /api/v8/relations/person':b=>core.relationPerson(b),
 'POST /api/v8/relations/alias/propose':b=>core.relationAliasProposal(b),
 'POST /api/v8/relations/alias/review':b=>core.relationAliasDecision({...b,reviewer:'human'}),
 'POST /api/v8/relations/resolve':b=>core.relationResolve(b),
 'POST /api/v8/relations/trigger-recall':b=>core.personTriggeredRecall(b),
 'POST /api/v8/relations/work-contact':b=>{if(!boundScope)throw Object.assign(new Error('Bound work scope required'),{status:403});return workContact(core,b);},
 'GET /api/v8/relations/graph':(_,q)=>core.relationGraph({scope:q.get('scope')||'personal'}),
 'GET /api/v8/ui/person-memories':(_,q)=>core.personMemories({scope:q.get('scope')||'personal',person_id:q.get('person_id'),limit:q.get('limit')===null?20:Number(q.get('limit')),offset:q.get('offset')===null?0:Number(q.get('offset'))}),
 'GET /api/v8/ledgers/detail':(_,q)=>core.ledgerDetail({scope:q.get('scope')||'personal',slot:q.get('slot'),id:q.get('id')}),
 'GET /api/v8/ui/source-memories':(_,q)=>core.sourceMemoryLinks({scope:q.get('scope')||'personal',id:q.get('id'),limit:Number(q.get('limit')||25),offset:Number(q.get('offset')||0)}),
 'GET /api/v8/ui/identity':(_,q)=>core.dashboardIdentity({scope:q.get('scope')||'personal',subject:q.get('subject')||undefined}),
 'GET /api/v8/ledgers/page':(_,q)=>core.pageLedger({scope:q.get('scope')||'personal',slot:q.get('slot'),limit:q.get('limit')===null?50:Number(q.get('limit')),cursor:q.get('cursor')||undefined}),
 'GET /api/v8/status':(_,q)=>core.status(q.get('scope')||'personal'),
 'GET /api/v8/ui/module':(_,q,req)=>core.dashboardModule({scope:q.get('scope')||'personal',name:q.get('name'),limit:q.has('limit')?Number(q.get('limit')):20,offset:q.has('offset')?Number(q.get('offset')):0,secret:vitalsSecret(req)}),
 'POST /api/v8/ui/observations':(b,q,req)=>core.dashboardObservation(b,vitalsSecret(req)),
 'GET /api/v8/ui/tasks':(_,q)=>core.dashboardTasks({scope:q.get('scope')||'personal',limit:q.has('limit')?Number(q.get('limit')):20,offset:q.has('offset')?Number(q.get('offset')):0,category:q.get('category')}),
 'GET /api/v8/ui/dreams':(_,q)=>core.dashboardDreams({scope:q.get('scope')||'personal',limit:q.has('limit')?Number(q.get('limit')):20,offset:q.has('offset')?Number(q.get('offset')):0,category:q.get('category')}),
 'GET /api/v8/ui/annotations':(_,q)=>core.annotationHistory({scope:q.get('scope')||'personal',slot:q.get('slot'),id:q.get('id'),limit:Number(q.get('limit')||100),offset:Number(q.get('offset')||0)}),
 'POST /api/v8/ui/annotations':b=>core.annotateRecord(b),
 'POST /api/v8/ui/fact-revision':b=>core.proposeFactRevision(b),
 'GET /api/v8/ui/records':(_,q)=>core.dashboardRecords({scope:q.get('scope')||'personal',slot:q.get('slot')||undefined,query:q.get('q')||'',recent:q.get('recent')==='1',limit:q.has('limit')?Number(q.get('limit')):25,offset:q.has('offset')?Number(q.get('offset')):0}),
 'GET /api/v8/memories/detail':(_,q)=>core.memoryDetail({scope:q.get('scope')||'personal',slot:q.get('slot'),id:q.get('id'),revision:q.has('revision')?Number(q.get('revision')):undefined,display:q.get('display')==='1'}),
 'GET /api/v8/memories/page':(_,q)=>core.pageMemories({scope:q.get('scope')||'personal',slot:q.get('slot')||undefined,limit:q.get('limit')===null?50:Number(q.get('limit')),cursor:q.get('cursor')||undefined,includeHistory:q.get('history')==='1'}),
 'GET /api/v8/memories':(_,q)=>({rows:core.list({scope:q.get('scope')||'personal',slot:q.get('slot')||undefined,includeHistory:q.get('history')==='1'})})
};
const server=http.createServer(async(req,res)=>{try{if(req.method==='GET'&&req.url==='/relations-ui'){res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store','content-security-policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self'"});res.end(readFileSync(new URL('./relations-ui.html',import.meta.url)));return;}if(connect(req,new URL(req.url,'http://127.0.0.1'),(code,body)=>respond(res,code,body)))return;if(!equal((req.headers.authorization||'').replace(/^Bearer /i,''),token))return respond(res,401,{error:'Unauthorized'});const url=new URL(req.url,'http://127.0.0.1');const key=req.method+' '+url.pathname;const fn=actions[key];if(inviteProfile(process.env)&&((url.pathname==='/api/v8/ui/mainline'&&['affect','motivation'].includes(url.searchParams.get('name')))||(url.pathname==='/api/v8/ui/module'&&url.searchParams.get('name')==='growth')||['/api/v8/host/affect-dynamics','/api/v8/host/cognitive-advice','/api/v8/host/cognitive-state','/api/v8/host/affect-state','/api/v8/host/self-state','/api/v8/host/engine-reflection','/api/v8/host/engine-reflection-coverage'].includes(url.pathname)))return respond(res,404,{error:'Internal cognition not available in invite edition'});if(boundScope && url.searchParams.has('scope') && url.searchParams.get('scope')!==boundScope)return respond(res,403,{error:'Scope is not authorized'});
// In single-tenant mode, never silently fall back to `personal`: force the bound scope.
// ID-only actions cannot be trusted to be scoped by their request body, so require an explicit scope.
const idOnlyMutations=new Set();
if(boundScope && idOnlyMutations.has(key))return respond(res,403,{error:'ID-only mutation is unavailable in bound-scope mode'});
if(boundScope && req.method==='GET' && !url.searchParams.has('scope'))url.searchParams.set('scope',boundScope);
if(['GET /api/v8/notifications/actions','GET /api/v8/notifications/events'].includes(key)){if(!boundScope||hostToken.length<24||!equal(req.headers['x-everlight-host-token']||'',hostToken))return respond(res,403,{error:'Bound scope and trusted host credential required'});return respond(res,200,key.endsWith('/actions')?notificationFeed(core,url.searchParams):notificationEvents(core,url.searchParams));}
if(key==='GET /api/v8/export/portable'){if(hostToken.length<24||!equal(req.headers['x-everlight-host-token']||'',hostToken))return respond(res,403,{error:'Trusted export credential required'});return await serveArchive(res,coreDbPath,exportOptions(url.searchParams));}
if(['GET /api/v8/host/affect-dynamics','POST /api/v8/host/cognitive-advice','POST /api/v8/host/cognitive-state','GET /api/v8/host/affect-state','GET /api/v8/host/self-state','POST /api/v8/host/engine-reflection','GET /api/v8/host/engine-reflection-coverage','POST /api/v8/host/engine-event','POST /api/v8/host/memory-observation','POST /api/v8/host/activity-event','POST /api/v8/host/tool-event','GET /api/v8/host/tool-status','POST /api/v8/host/tool-evidence','GET /api/v8/host/tool-evidence'].includes(key)){const e4=process.env.EVERLIGHT_D14E4_TOOL_TOKEN||'';if(process.env.EVERLIGHT_D14E4_TOOL_CAPTURE!=='1'||!boundScope||hostToken.length<24||e4.length<32||[token,hostToken,process.env.EVERLIGHT_AI_DECISION_TOKEN,process.env.EVERLIGHT_HUMAN_DECISION_TOKEN,process.env.EVERLIGHT_GOVERNANCE_ADMIN_TOKEN,vitalsToken].includes(e4)||!equal(req.headers['x-everlight-host-token']||'',hostToken)||!equal(req.headers['x-everlight-tool-token']||'',e4))return respond(res,403,{error:'E4 dedicated trusted host authorization required'});}
// All stateful POST routes require a trusted host. Only pure validation/guidance are exempt.
const purePostRoutes=new Set(['POST /api/v8/guidance','POST /api/v8/proposal/validate']);
if(req.method==='POST' && !purePostRoutes.has(key) && (hostToken.length<24 || !equal(req.headers['x-everlight-host-token']||'',hostToken)))return respond(res,403,{error:'Trusted host credential required'});
if(key==='POST /api/v8/governance'){const admin=process.env.EVERLIGHT_GOVERNANCE_ADMIN_TOKEN||'';if(admin.length<24||[token,hostToken,process.env.EVERLIGHT_AI_DECISION_TOKEN,process.env.EVERLIGHT_HUMAN_DECISION_TOKEN].includes(admin)||!equal(req.headers['x-everlight-governance-token']||'',admin))return respond(res,403,{error:'Governance administrator required'});}
if(['POST /api/v8/joint/ai','POST /api/v8/joint/human','POST /api/v8/relations/name/review','POST /api/v8/relations/alias/review'].includes(key)){
const ai=process.env.EVERLIGHT_AI_DECISION_TOKEN||'',human=process.env.EVERLIGHT_HUMAN_DECISION_TOKEN||'';const expected=key.endsWith('/ai')?ai:human;
if(ai.length<24||human.length<24||new Set([ai,human,token,hostToken]).size!==4||!equal(req.headers['x-everlight-decision-token']||'',expected))return respond(res,403,{error:'Independent decision credential required'});
}if(!fn)return respond(res,404,{error:'Not found'});let b={};if(req.method==='POST'){if(!(req.headers['content-type']||'').startsWith('application/json'))return respond(res,415,{error:'JSON required'});let chunks=[],n=0;for await(const chunk of req){n+=chunk.length;if(n>1024*1024)return respond(res,413,{error:'Too large'});chunks.push(chunk)}b=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');if(boundScope && (!b || typeof b!=='object' || Array.isArray(b)))return respond(res,403,{error:'Scoped JSON object required'});
if(boundScope && 'scope' in b && b.scope!==boundScope)return respond(res,403,{error:'Scope is not authorized'});
if(boundScope && !('scope' in b))b.scope=boundScope;if(d9Enabled()){assertApi(key,b);if(boundScope&&key==='POST /api/v8/host/capture-and-route'&&(b.source?.scope!==boundScope||b.event?.scope!==boundScope))return respond(res,403,{error:'Nested scope is not authorized'});}}return respond(res,200,await fn(b,url.searchParams,req))}catch(e){respond(res,e.status||500,{error:e.status?e.message:'Internal error',code:e.status||500})}});
server.listen(Number(process.env.EVERLIGHT_CORE_PORT||8790),'127.0.0.1',()=>console.log('Everlight v8 isolated core on localhost'));
