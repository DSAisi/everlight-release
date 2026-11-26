// One logical registry. Each key retains its owning service and existing authorization.
export const coreGroups=Object.freeze({continuity:['EVERLIGHT_H6_CONTINUITY'],memory:['EVERLIGHT_AUTO_MEMORY_D11','EVERLIGHT_CLASSIFIER_OPT_IN','EVERLIGHT_D14E5A_SEMANTIC_AUTO','EVERLIGHT_D14E2_REFLECTION_AUTO'],commitments:['EVERLIGHT_D14E2_TASK_AUTO','EVERLIGHT_AWARENESS_D13'],tracking:['EVERLIGHT_TASK_REPORTING_OPT_IN'],repair:['EVERLIGHT_W1_QUALITY_NUDGE']});
export const runtimeSwitches=Object.freeze(['autonomy','offline','learning','evolution','dream','reflection','creation','message','motivation','promise','tasks','correction','feedback','memory','recall','photo','private','notice']);
export const runtimeEditable=Object.freeze(['autonomy','offline','dream','learning','evolution','reflection','creation']);
export const runtimeDependencies=Object.freeze({dream:['autonomy','offline'],reflection:['autonomy','offline'],creation:['autonomy','offline']});
export function runtimeInventory(settings){return runtimeSwitches.filter(key=>!runtimeEditable.includes(key)).map(key=>({key,enabled:typeof settings?.[key]==='boolean'?settings[key]:null,editable:false,effective:null}));}
