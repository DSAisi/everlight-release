// Runtime audit event taxonomy, not a semantic memory classifier.
export const eventGroups=Object.freeze({
 awareness:['observed','source_revoked'],
 commitment:['accepted','deferred','task_due','overdue','verified','execution_bound','execution_claim','execution_result','execution_uncertain','execution_reconciled','recurring_occurrence','recurring_paused','recurring_registered','s03_link_conflict','s03_revision_changed','s03_suspended','s03_tracked'],
 correction:['rule_approved','rule_revoked','guard_hit'],
 learning:['learning_observed','learning_validation','d14d1_observed','d14d1_lesson','d14d1_evaluation','d14d1_revoked','d14d1_capture_failed'],
 evolution:['d14d2_candidate','d14d2_challenged','d14d2_effective','d14d2_retracted'],
 autonomy:['wake_plan','wake_claim','wake_result','wake_uncertain','wake_reconciled','wake_repeat_suppressed','d14d2_capture','d14d2_dream_revoked']
});
export const engineOf=Object.freeze(Object.fromEntries(Object.entries(eventGroups).flatMap(([group,events])=>events.map(event=>[event,group]))));
export function validEngineEvent(b){return !!b&&typeof b==='object'&&Object.keys(b).sort().join(',')==='audit_id,event,instance,occurred_at,scope'&&typeof b.scope==='string'&&b.scope.length>0&&/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(b.instance)&&Number.isSafeInteger(b.audit_id)&&b.audit_id>0&&Object.hasOwn(engineOf,b.event)&&Number.isSafeInteger(b.occurred_at)&&b.occurred_at>=0&&b.occurred_at<=8640000000000000;}
