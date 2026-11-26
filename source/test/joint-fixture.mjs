// Test-only simulated independent decisions; never imported by runtime.
export function approveBoth(core,id){const {scope}=core.db.prepare('SELECT scope FROM proposals WHERE id=?').get(id);const digest=core.jointStatus({scope,id}).digest;for(const role of ['ai','human'])core.jointDecision({scope,id,digest,decision:'approve',reason:`fixture ${role} approval`},role);}
