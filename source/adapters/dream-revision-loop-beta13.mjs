// Host-owned workflow. No credentials are exposed to the model, no fabricated votes.
// For an already analyzed evidence dream. Caller supplies real retrieval and
// independent review callbacks; pending decisions are reported, not bypassed.
export async function reviseAndReplay({dream,recall,review,request,query,limit=8}){
 if(!dream||typeof dream.revision!=='function'||typeof dream.replay!=='function'||typeof recall!=='function'||typeof review!=='function'||typeof query!=='string'||!query.trim()||!request?.id||!request.target_id||!Number.isInteger(request.expected_revision))throw Error('explicit revision workflow inputs required');
 const before=await recall({query,limit});
 if(!before?.run_id||!before.selected?.some(x=>x.id===request.target_id&&x.revision===request.expected_revision))return {state:'baseline_not_selected',behavioral_learning_verified:false};
 const proposal=await dream.revision(request);
 const decision=await review({proposal_id:proposal.id});
 if(decision?.state!=='committed')return {state:'awaiting_commit',proposal_id:proposal.id,before_run_id:before.run_id,behavioral_learning_verified:false};
 const after=await recall({query,limit});
 if(!after?.run_id)throw Error('post-commit recall missing');
 const result=await dream.replay({id:request.id,proposal_id:proposal.id,before_run_id:before.run_id,after_run_id:after.run_id});
 return {state:result.selected_current_revision?'recall_replayed':'recall_replay_failed',...result};
}
