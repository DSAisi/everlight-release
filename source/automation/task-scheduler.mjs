import {runContinuity} from '../core/continuity-w3h6b.mjs';
import {flag} from '../automation/settings-w3h6.mjs';
import {repairRepeatEvidence} from '../core/auto-memory-d11.mjs';
import {queueQualityReview} from '../core/quality-w1.mjs';
/** Optional local isolated scheduler. Must be explicitly launched by operator. */
import {EverlightCore} from '../core/engine.mjs';
import path from 'node:path';
const scope=process.env.EVERLIGHT_SCOPE;
const file=process.env.EVERLIGHT_CORE_DB;
if(!scope||!file){console.error('Set EVERLIGHT_SCOPE and EVERLIGHT_CORE_DB explicitly');process.exit(2)}
const interval=Number(process.env.EVERLIGHT_SCHEDULER_POLL_MS||30000);
if(!Number.isInteger(interval)||interval<5000){console.error('Poll interval must be >= 5000ms');process.exit(2)}
const core=new EverlightCore(path.resolve(file));let active=false,lastQuality=0;
function tick(){if(active)return;active=true;try{if(process.env.EVERLIGHT_H6_CONTINUITY==='1')runContinuity(core,scope);const result=flag('EVERLIGHT_TASK_REPORTING_OPT_IN')?core.runTaskReporting({scope}):{processed:0};if(flag('EVERLIGHT_W1_QUALITY_NUDGE')&&Date.now()-lastQuality>=300000){const recovered=repairRepeatEvidence(core,scope);if(recovered.repaired)console.log(JSON.stringify({event:"repeat_evidence_repaired",count:recovered.repaired}));const q=queueQualityReview(core,scope);lastQuality=Date.now();if(q.status==='queued')console.log(JSON.stringify({event:'quality_nudge_queued',...q}));}const write=flag('EVERLIGHT_TASK_REPORTING_OPT_IN')?core.runWriteTemplateReminders({scope}):{processed:0};if(write.processed)console.log(JSON.stringify({event:'write_template_nudges_queued',...write}));if(result.processed)console.log(JSON.stringify({event:'reporting_nudges_queued',...result}))}catch(e){console.error('scheduler error:',e.message)}finally{active=false}}
function stop(){clearInterval(timer);core.close();process.exit(0)}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
tick();const timer=setInterval(tick,interval);
