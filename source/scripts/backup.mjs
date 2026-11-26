import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
const hash=p=>createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const required=['core.sqlite','ui.sqlite'];
const validName=n=>/^ASSET[-_A-Za-z0-9]+\.img$/.test(n);
function regular(p){if(!fs.lstatSync(p).isFile())throw Error('regular file required: '+path.basename(p));return p;}
function copyDb(p,out){const db=new DatabaseSync(regular(p),{readOnly:true});try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw Error('database integrity failure');db.prepare('VACUUM INTO ?').run(out);}finally{db.close();}fs.chmodSync(out,0o600);}
function assets(dbPath){const db=new DatabaseSync(dbPath,{readOnly:true});try{if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='ui_photo_assets'").get())return [];return db.prepare('SELECT file_name,sha256,bytes FROM ui_photo_assets ORDER BY file_name').all();}finally{db.close();}}
function copyMedia(src,dest,rows,manifest,files){if(!rows.length)return;const from=path.join(src,'everlight-media'),to=path.join(dest,'everlight-media');if(!fs.lstatSync(from).isDirectory())throw Error('regular media directory required');fs.mkdirSync(to,{mode:0o700});const seen=new Set();for(const row of rows){const n=row.file_name;if(!validName(n)||seen.has(n))throw Error('invalid or duplicate asset filename');seen.add(n);const key='everlight-media/'+n,p=regular(path.join(from,n)),out=path.join(to,n);if(fs.statSync(p).size!==row.bytes||hash(p)!==row.sha256||manifest&&manifest.files[key]!==row.sha256)throw Error('media checksum mismatch: '+n);fs.copyFileSync(p,out,fs.constants.COPYFILE_EXCL);fs.chmodSync(out,0o600);if(hash(out)!==row.sha256)throw Error('media copy checksum mismatch: '+n);files[key]=row.sha256;}}
// Offline isolated snapshots only. Caller must stop all writers before transfer.
export function transfer(mode,source,dest){
 if(!['backup','restore'].includes(mode))throw Error('invalid mode');source=fs.realpathSync(source);dest=path.resolve(dest);
 if(mode==='backup'&&!fs.existsSync(path.join(source,'trial.env')))throw Error('trial configuration required');
 const manifest=mode==='restore'?JSON.parse(fs.readFileSync(regular(path.join(source,'manifest.json')),'utf8')):null;
 if(manifest&&(![1,2].includes(manifest.format)||!manifest.files||typeof manifest.files!=='object'))throw Error('invalid manifest');
 const names=[...required];if(mode==='backup'?fs.existsSync(path.join(source,'vector.sqlite')):Object.hasOwn(manifest.files,'vector.sqlite'))names.push('vector.sqlite');
 for(const n of names){const p=regular(path.join(source,n));if(manifest&&['-wal','-journal','-shm'].some(s=>fs.existsSync(p+s)))throw Error('unexpected database sidecar: '+n);if(manifest&&hash(p)!==manifest.files[n])throw Error('checksum mismatch: '+n);}
 fs.mkdirSync(dest,{mode:0o700});
 try{const files={};for(const n of names){const out=path.join(dest,n);copyDb(path.join(source,n),out);files[n]=hash(out);}const rows=assets(path.join(dest,'ui.sqlite'));if(manifest?.format===1&&rows.length)throw Error('legacy backup has no photo originals; restore refused');copyMedia(source,dest,rows,manifest,files);if(manifest&&Object.keys(manifest.files).some(k=>!Object.hasOwn(files,k)))throw Error('unexpected manifest entry');fs.writeFileSync(path.join(dest,'manifest.json'),JSON.stringify({format:2,files},null,2),{mode:0o600,flag:'wx'});}catch(e){fs.rmSync(dest,{recursive:true,force:true});throw e;}
}
if(process.argv[1]&&path.resolve(process.argv[1])===new URL(import.meta.url).pathname)transfer(...process.argv.slice(2));
