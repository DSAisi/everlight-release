// Beta 08 invitation profile. Internal cognition is not a supported public feature.
export function inviteEnv(env){
 const e={...env,EVERLIGHT_INVITE_PROFILE:'memory'};
 for(const k of Object.keys(e))if(k.startsWith('EVERLIGHT_D14_'))delete e[k];
 for(const k of ['EVERLIGHT_TRIAL_D14','EVERLIGHT_D14E8E9_STATE','EVERLIGHT_D14E8B_DYNAMICS','EVERLIGHT_D14E9B_ADVICE','EVERLIGHT_D14E2_REFLECTION_AUTO','EVERLIGHT_D14E5C_ENGINE_CAPTURE'])e[k]='0';
 return e;
}
export const inviteProfile=e=>true;
