import {preferences,changePreference} from '../automation/settings-w3h6.mjs';
const fail=(status,message)=>{throw Object.assign(Error(message),{status})};
export async function settingsView(scope,e=process.env){return {scope,core:preferences(scope,e),runtime:[],runtime_inventory:[],runtime_error:null,host_verified:false};}
export async function settingsChange(scope,{key,enabled,domain}={},e=process.env){if(scope!==e.EVERLIGHT_BOUND_SCOPE||scope!==e.EVERLIGHT_UI_SCOPE)fail(403,'作用域不匹配');if(typeof enabled!=='boolean')fail(422,'无效设置');if(domain==='runtime')fail(404,'本版未开放');if(domain!=='core')fail(422,'无效设置');changePreference(scope,key,enabled,e);return settingsView(scope,e);}
