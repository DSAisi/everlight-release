import {pathToFileURL} from 'node:url';
import path from 'node:path';
// Administrator-selected trusted code only. Never load paths from requests.
export async function loadRetrievalProviders(env=process.env){
 const raw=env.EVERLIGHT_RETRIEVAL_PLUGIN;
 if(!raw)return [];
 if(env.EVERLIGHT_RETRIEVAL_PLUGIN_TRUSTED!=='1'||!path.isAbsolute(raw))throw Error('retrieval plugin requires explicit trust and absolute path');
 const mod=await import(pathToFileURL(raw).href);
 const providers=await mod.createProviders();
 if(!Array.isArray(providers)||!providers.length||providers.length>16)throw Error('invalid retrieval providers');
 const names=new Set(['lexical','local-bm25','remote-vector']);
 for(const p of providers){if(typeof p?.name!=='string'||!p.name.trim()||names.has(p.name)||typeof p.search!=='function')throw Error('invalid or duplicate retrieval provider');names.add(p.name);}
 return providers;
}
