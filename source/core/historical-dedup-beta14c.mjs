// Only exact export records with a stable conversation/message identity are reusable.
// Preserve original source IDs, timestamps and evidence; never merge by semantic similarity.
export function historicalDuplicate(db,{scope,actor,kind,body}){
 if(kind!=='historical_import'||body?.historical!==true||body.imported!==true||body.continuity_live!==false||typeof body.message_id!=='string'||!body.message_id||/^seq-\d+$/.test(body.message_id)||typeof body.conversation_id!=='string'||!body.conversation_id||body.conversation_id==='default'||typeof body.happened_at!=='string'||!Number.isFinite(Date.parse(body.happened_at))||!body.raw||typeof body.raw!=='object'||body.actor!==actor)return null;
 db.exec("CREATE INDEX IF NOT EXISTS beta14c_import_identity ON sources(scope,actor,json_extract(body,'$.conversation_id'),json_extract(body,'$.message_id')) WHERE kind='historical_import'");
 const rows=db.prepare("SELECT id,hash,body,revoked FROM sources WHERE scope=? AND actor=? AND kind='historical_import' AND json_extract(body,'$.conversation_id')=? AND json_extract(body,'$.message_id')=? ORDER BY id").all(scope,actor,body.conversation_id,body.message_id);
 const comparable=o=>{const {seq,source_id,...rest}=o;return JSON.stringify(rest)};
 const matches=rows.filter(r=>comparable(JSON.parse(r.body))===comparable(body));
 if(matches.some(r=>r.revoked))throw Object.assign(Error('Historical duplicate source revoked'),{status:409});
 const r=matches[0];return r?{id:r.id,idempotent:true,deduplicated:true,source_hash:r.hash}:null;
}
