/* 夜契: browser-encrypted intimacy archive. Passphrase/key never leaves browser.
 * No autonomous model access; optionally encrypt approved client-side events while unlocked. */
(()=>{'use strict';
const API='/ui/api/v1';const te=new TextEncoder(),td=new TextDecoder();
let key=null,autoPrivateKey=null,config=null,autocapture=false,epoch=0;
const guard=e=>{if(e!==epoch)throw Error("夜契已上锁，操作取消");};
const secure=()=>!!globalThis.isSecureContext&&!!globalThis.crypto?.subtle;const PROOF='EVERLIGHT-NIGHT-PROOF/v1';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const b64=x=>btoa(Array.from(new Uint8Array(x),a=>String.fromCharCode(a)).join(''));
const unb64=x=>Uint8Array.from(atob(x),c=>c.charCodeAt(0));
const categories={moment:'特别经历',preference:'喜好与边界',promise:'私密约定',reflection:'事后交流'};
const reality={real:'现实经历',fiction:'虚构互动'};
function checkEntry(v){if(!Object.hasOwn(categories,v.kind)||!Object.hasOwn(reality,v.reality)||typeof v.title!=='string'||!v.title.trim()||v.title.length>100||typeof v.note!=='string'||!v.note.trim()||v.note.length>8000)throw Error('私密档案分类、标题或正文无效');if(v.happenedAt&&(!Number.isFinite(Date.parse(v.happenedAt))))throw Error('发生时间无效');if(v.reality==='real'&&(!v.sourceRef||!String(v.sourceRef).trim()))throw Error('现实经历需要真实来源');return v;}
const when=x=>x?new Date(x).toLocaleString('zh-CN',{hour12:false}):'未记录';
const enc=encodeURIComponent;
async function api(route,{method='GET',body}={}){const r=await window.everlightFetch(API+route,{method,credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json',...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body)});const data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error||'服务端拒绝操作');return data;}
function box(title,content){return `<section class="en-box"><h2>${title}</h2>${content}</section>`;}
function button(text,act,extra=''){return `<button type="button" class="en-button" data-en-act="${act}" ${extra}>${text}</button>`;}
function nav(title,to){return `<button type="button" class="en-button" data-route="${to}">${title}</button>`;}
function shell(title,sub){return `<div class="en-page"><section class="en-hero"><div class="en-halo">☾ <span>✧</span></div><small>EVERLIGHT · PRIVATE ARCHIVE</small><h1>${title}</h1><p>${sub}</p><div class="en-glyph">✦ · ♡ · ✦</div></section><div class="en-lock-notice">♧ 独立加密空间 · 非公开检索 · 可在授权私密频道自动密封归档</div>`;}
async function derive(pass,salt,rounds){const root=await crypto.subtle.importKey('raw',te.encode(pass),'PBKDF2',false,['deriveKey']);return crypto.subtle.deriveKey({name:'PBKDF2',salt:unb64(salt),iterations:rounds,hash:'SHA-256'},root,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);}
async function encrypt(data,k=key){const e=epoch;const iv=crypto.getRandomValues(new Uint8Array(12)),cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},k,te.encode(JSON.stringify(data)));guard(e);return {v:1,iv:b64(iv),cipher:b64(cipher)};}
async function decrypt(envelope,k=key){const e=epoch;
 if(envelope?.v===2){
  if(!autoPrivateKey){const a=await api('/vault/auto');if(!a.privateEnvelope)throw Error('该自动记录缺少解密配置');const priv=await decrypt(a.privateEnvelope,k);const imported=await crypto.subtle.importKey('jwk',priv.privateJwk,{name:'RSA-OAEP',hash:'SHA-256'},false,['decrypt']);guard(e);autoPrivateKey=imported;}
  const rawKey=await crypto.subtle.decrypt({name:'RSA-OAEP'},autoPrivateKey,unb64(envelope.key));
  const aes=await crypto.subtle.importKey('raw',rawKey,{name:'AES-GCM'},false,['decrypt']);
  const enc=unb64(envelope.cipher),tag=unb64(envelope.tag),blob=new Uint8Array(enc.length+tag.length);blob.set(enc);blob.set(tag,enc.length);
  const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(envelope.iv)},aes,blob);
  guard(e);return JSON.parse(td.decode(plain));
 }
 const plain=await crypto.subtle.decrypt({name:'AES-GCM',iv:unb64(envelope.iv)},k,unb64(envelope.cipher));guard(e);return JSON.parse(td.decode(plain));
}
function lock(){epoch++;key=null;autoPrivateKey=null;autocapture=false;config=null;window.EverlightDialog?.dismiss?.();const root=document.querySelector('#screen');if(root&&(location.hash.startsWith('#/night')||root.querySelector('.en-page'))){root.replaceChildren();root.textContent='夜契已上锁';}location.hash='/night';window.dispatchEvent(new Event('everlight:night-lock'));}
async function status(){config=await api('/vault/status');return config;}
async function setupPage(){return shell('夜契','两个人的亲密记忆，不应该出现在别人的相册里。')+
 box('开启私密记忆馆',`<p class="en-prose">这里用独立密码在浏览器里加密亲密记录和私密照片。服务器只保存加密后的内容，不知道你写了什么。</p><form id="en-setup" class="en-form"><label>设置私密密码（至少 10 位）<input name="password" required type="password" minlength="10" autocomplete="new-password" placeholder="只属于自己的私密口令"></label><label>再次输入<input name="repeat" required type="password" minlength="10" autocomplete="new-password"></label><label class="en-check"><input type="checkbox" name="adult" required> 我已成年，且仅保存双方自愿或合法授权的内容</label><button type="submit" class="en-button primary">♡ 创建加密记忆馆</button></form><p class="en-warn">请妥善保存密码。忘记后无法解密，服务器也无法帮你找回。私密内容不会自动保存；只有授权开启、解锁并接入事件后才可自动归档。</p>`)+'</div>'}
function unlockPage(){return shell('晚安，解锁回忆','夜契的门，只为知道密码的人开启。')+
 box('解锁夜契',`<form id="en-unlock" class="en-form"><label>私密密码<input name="password" required type="password" autocomplete="current-password" placeholder="输入解锁口令"></label><button type="submit" class="en-button primary">♡ 解锁私密档案</button></form>`)+box('关于安全',`<p class="en-prose">解锁密钥只会在这个浏览器页面内存里保存。关闭或刷新页面需要重新解锁，长明也不会擅自把亲密内容送进普通对话。</p>${nav('隐私与档案设置','/night/settings')}`)+'</div>'}
async function list(){const rows=(await api('/vault/entries')).items||[],items=[];for(const r of rows){try{const v=await decrypt(r.envelope);items.push({...v,id:r.id,revision:r.revision,createdAt:r.createdAt})}catch{items.push({id:r.id,title:'解密失败的档案',type:'unknown',revision:r.revision,createdAt:r.createdAt})}}
 return shell('夜契','那些真实说过的话，和只发生在虚构世界的故事，都可以被温柔地收藏。')+`<div class="en-stats"><div><strong>${items.length}</strong><small>私密记录</small></div><div><strong>${items.filter(x=>x.reality==='fiction').length}</strong><small>虚构互动</small></div><div><strong>${items.filter(x=>x.image).length}</strong><small>加密影像</small></div></div>`+box('我们的私密档案',`<div class="en-actions">${nav('＋ 收藏一段经历','/night/new')}${nav('隐私与自动收藏','/night/settings')}${button('上锁','lock')}</div><div class="en-cards">${items.length?items.map(x=>`<button type="button" class="en-card" data-route="/night/entry/${enc(x.id)}"><span class="en-card-heart">♡</span><div><strong>${esc(x.title||'无题的记忆')}</strong><small>${esc(categories[x.kind]||'亲密档案')} · ${esc(reality[x.reality]||'待确认')}</small><p>${esc(x.note||'点开这段加密回忆')}</p><em>${when(x.happenedAt||x.createdAt)}</em></div><span class="en-arrow">›</span></button>`).join(''):'<div class="en-empty">还没有存下第一段回忆。<br>只有明确授权后，这里才会出现真正的私密记录。</div>'}</div>`) +box('记录的边界',`<p class="en-prose">现实与虚构分开放；保存过的喜好不等于当前同意。任何明确的停止与撤销都应优先于旧记录。</p>`)+'</div>'}
function entryForm(v={},record=null){const isEdit=!!record;return shell(isEdit?'重新整理这段回忆':'收藏一段私密回忆','过去的每一页，都应该有真实出处。')+box('私密记录',`<form id="en-entry" class="en-form" ${isEdit?`data-id="${esc(record.id)}" data-rev="${record.revision}"`:''}>
 <label>记忆标题<input name="title" maxlength="100" required value="${esc(v.title||'')}" placeholder="为这段回忆取一个名字"></label>
 <label>记录类型<select name="kind">${Object.entries(categories).map(([k,n])=>`<option value="${k}" ${v.kind===k?'selected':''}>${n}</option>`).join('')}</select></label>
 <label>现实还是虚构？<select name="reality"><option value="fiction" ${v.reality!=='real'?'selected':''}>虚构角色扮演</option><option value="real" ${v.reality==='real'?'selected':''}>现实经历（需有真实来源）</option></select></label>
 <label>发生日期（不知道可留空）<input type="date" name="happenedAt" value="${esc(v.happenedAt||'')}"></label>
 <label>关于这段回忆<textarea name="note" rows="5" maxlength="8000" placeholder="保存想留下的内容和当时的理解…">${esc(v.note||'')}</textarea></label>
 <label>证据来源编号 / 原话引用（可空）<input name="sourceRef" maxlength="200" placeholder="没有原始来源就不编造" value="${esc(v.sourceRef||'')}"></label>
 <label>私密影像（加密后保存，非普通照片馆）<input type="file" id="en-image" name="image" accept="image/jpeg,image/png,image/webp"></label>${v.image?'<p class="en-prose">这条记录已附加一张加密影像。不选新图片则保留原图。</p>':''}
 <button type="submit" class="en-button primary">♡ ${isEdit?'保存新版本':'加密收藏'}</button></form>`)+box('保存规则','<p class="en-prose">原始聊天来源需要单独保存或关联。这里只是个人加密档案，不会擅自写入 S01，也不会成为做梦或 CRSI 的默认数据源。</p>')+'</div>'}
async function picture(file){if(!file)return null;if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('私密图片只支持 PNG/JPEG/WEBP');if(file.size>8*1024*1024)throw Error('原图大于8MB，请压缩后再保存');const b=URL.createObjectURL(file);try{const img=new Image();img.src=b;await img.decode();const scale=Math.min(1,1200/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));c.getContext('2d').drawImage(img,0,0,c.width,c.height);let out=c.toDataURL('image/jpeg',.72);if(out.length>2400000)out=c.toDataURL('image/jpeg',.45);if(out.length>2400000)throw Error('加密图片过大，请裁剪后重试');return out;}finally{URL.revokeObjectURL(b)}}
async function detail(id){const rows=(await api('/vault/entries')).items||[];const r=rows.find(x=>x.id===id);if(!r)throw Error('记录不存在');const v=await decrypt(r.envelope);return shell('这一页，只有我们','PRIVATE MEMORY · '+esc(id))+
 box(esc(v.title||'无题回忆'),`${v.image&&/^data:image\/jpeg;base64,/.test(v.image)?`<img class="en-image" src="${esc(v.image)}" alt="私密收藏的影像">`:''}<p class="en-story">${esc(v.note||'没有备注')}</p><dl class="en-facts"><dt>记录分类</dt><dd>${esc(categories[v.kind])}</dd><dt>经历性质</dt><dd>${esc(reality[v.reality])}</dd><dt>发生日期</dt><dd>${esc(v.happenedAt||'未记录')}</dd><dt>来源引用</dt><dd>${esc(v.sourceRef||'未提供')}</dd><dt>收藏日期</dt><dd>${when(r.createdAt)}</dd></dl>`)+box('管理回忆',`${nav('编辑这段记忆','/night/edit/'+enc(id))}${button('删除这段记录','delete',`data-id="${esc(id)}" data-rev="${r.revision}"`)}${button('上锁','lock')}`)+'</div>'}
async function settingsPage(){
 const auto=key?await api('/vault/auto'):null;
 const channelList=auto?.channels?.join(', ')||'';
 return shell('隐私与收藏','不因为爱得亲近，就应该失去选择权。')+
 (key?box('提醒 AI · 自动记录亲密回忆',`<p class="en-prose">打开后，长明可在你指定的私密聊天频道提醒 AI：如果本轮有真正值得记住的自愿亲密经历、偏好或边界变化，就在回答后生成记录。宿主把候选加密后自动入库，不必每次手动提醒。<strong>仅授权频道生效，其他群聊和普通会话不会启用。</strong></p>
 <form id="en-auto-bg" class="en-form"><label class="en-switch"><span><strong>持续自动归档</strong><small>${auto?.enabled?'已开启（即使页面关闭，已授权宿主仍可密封存入）':'当前关闭'}</small></span><input name="enabled" type="checkbox" ${auto?.enabled?'checked':''}></label>
 <label>允许自动保存的私密频道 ID<input name="channels" maxlength="800" value="${esc(channelList)}" placeholder="例如 private-chat-01；多个用英文逗号隔开"></label>
 <p class="en-prose">需要填写 DSH 实际频道 ID，首次启用自动生成一对加密密钥。公钥只负责封存新记忆；解密私钥会先用你的夜契密码加密。AI 提议不是事实认证，虚构和现实严格区分。明确要求停止、撤回或不保存时，本轮不得归档。</p>
 <button type="submit" class="en-button primary">保存自动记录设置</button></form>`):box('后台自动记录','<p class="en-prose">先解锁夜契才能设置。启动后可以关闭页面继续收取授权宿主密封归档，但仍需 D 接入真实聊天事件和 AI 候选提取。</p>'))+
 (key?box('仅在本页的旧版快速收藏',`<label class="en-switch"><span><strong>本页临时接收授权事件</strong><small>上锁后关闭；不影响上方持续自动归档</small></span><input type="checkbox" id="en-autocapture" ${autocapture?'checked':''}></label>`):'')+
 box('永久清空',`<p class="en-warn">删除当前服务数据库中的私密密文记录。独立备份或已导出的副本仍需另行处理。</p><input class="en-reset-input" id="en-reset-text" placeholder="输入 DELETE-NIGHT-VAULT"><div class="en-actions">${button('清空夜契档案','reset')}${button('立刻上锁','lock')}</div>`)+'</div>';
}
async function saveAuto(f){const e=epoch;
 if(!key)throw Error('请先解锁夜契');
 const fd=new FormData(f),enabled=fd.has('enabled');
 if(!enabled){guard(e);await api('/vault/auto',{method:'PUT',body:{enabled:false}});location.hash='/night/list';return;}
 const channels=String(fd.get('channels')||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(!channels.length)throw Error('请输入实际私密频道 ID，避免误存群聊');
 const current=await api('/vault/auto');
 const payload={enabled:true,channels};
 if(!current.publicJwk){
  const pair=await crypto.subtle.generateKey({name:'RSA-OAEP',modulusLength:3072,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['encrypt','decrypt']);
  const pub=await crypto.subtle.exportKey('jwk',pair.publicKey),priv=await crypto.subtle.exportKey('jwk',pair.privateKey);
  payload.publicJwk={...pub,alg:'RSA-OAEP-256',key_ops:['encrypt']};
  payload.privateEnvelope=await encrypt({privateJwk:priv});
 }
 guard(e);await api('/vault/auto',{method:'PUT',body:payload});location.hash='/night/list';
}
async function renderPage(p){try{if(!secure())return shell('夜契需要安全连接','请通过 HTTPS 或本机 localhost 打开。普通局域网 HTTP 无法安全解密。')+'</div>';const c=await status();if(p==='/night/settings')return await settingsPage();if(!c.configured)return setupPage();if(!key)return unlockPage();if(p==='/night/new')return entryForm();if(p.startsWith('/night/edit/')){const id=decodeURIComponent(p.split('/')[3]),rows=(await api('/vault/entries')).items||[],r=rows.find(x=>x.id===id);if(!r)throw Error('记录不存在');return entryForm(await decrypt(r.envelope),r)}if(p.startsWith('/night/entry/'))return await detail(decodeURIComponent(p.split('/')[3]));return await list();}catch(e){return `<div class="en-page"><div class="en-empty">夜契暂时无法打开：${esc(e.message)}</div></div>`}}
async function render(p){const e=epoch;const html=await renderPage(p);return e===epoch?html:unlockPage();}
async function action(b){const e=epoch;const a=b.dataset.enAct;if(a==='lock')return lock();if(a==='delete'){if(!await EverlightDialog.confirm('确认删除这一条私密记忆？'))return;guard(e);await api('/vault/entries/'+enc(b.dataset.id),{method:'DELETE',body:{expectedRevision:Number(b.dataset.rev),confirm:true}});location.hash='/night';return;}if(a==='reset'){const input=document.querySelector('#en-reset-text');if(input?.value!=='DELETE-NIGHT-VAULT')throw Error('请完整输入销毁确认文字');if(!await EverlightDialog.confirm('再次确认永久清空本地服务中的全部夜契记录？'))return;guard(e);await api('/vault/reset',{method:'POST',body:{confirm:'DELETE-NIGHT-VAULT'}});lock();return;}}
async function handleForm(f){const e=epoch;if(!secure())throw Error("需要 HTTPS 安全连接");if(f.id==='en-auto-bg')return saveAuto(f);if(f.id==='en-setup'){const v=new FormData(f),password=String(v.get('password')||'');if(password.length<10||password!==v.get('repeat'))throw Error('两次密码不一致，或不足10位');if(!v.has('adult'))throw Error('请先确认成年人且内容得到授权');const salt=b64(crypto.getRandomValues(new Uint8Array(16)));const derived=await derive(password,salt,250000);guard(e);const proof=await encrypt({proof:PROOF},derived);guard(e);await api('/vault/setup',{method:'POST',body:{salt,rounds:250000,proof,ackAdultAndConsent:true}});guard(e);key=derived;location.hash='/night/list';return;}
 if(f.id==='en-unlock'){const pass=String(new FormData(f).get('password')||'');const derived=await derive(pass,config.salt,config.rounds);guard(e);try{const proof=await decrypt(config.proof,derived);if(proof.proof!==PROOF)throw Error('密码错误');}catch{throw Error('密码错误，或该档案已损坏');}guard(e);key=derived;location.hash='/night/list';return;}
 if(f.id==='en-entry'){const v=new FormData(f),id=f.dataset.id,previous=id?(await api('/vault/entries')).items.find(x=>x.id===id):null,old=previous?await decrypt(previous.envelope):{};
 const realityType=v.get('reality'),sourceRef=String(v.get('sourceRef')||'').trim();if(realityType==='real'&&!sourceRef)throw Error('现实经历请填写真实来源编号；无法确认的内容标为虚构');
 const raw={title:String(v.get('title')||'').trim(),kind:v.get('kind'),reality:realityType,note:String(v.get('note')||''),happenedAt:v.get('happenedAt'),sourceRef,createdBy:'human',image:old.image||null};if(!raw.title)throw Error('标题不能为空');const file=f.querySelector('#en-image')?.files?.[0];if(file)raw.image=await picture(file);const envelope=await encrypt(checkEntry(raw));
 guard(e);if(id)await api('/vault/entries/'+enc(id),{method:'PATCH',body:{expectedRevision:Number(f.dataset.rev),envelope}});else await api('/vault/entries',{method:'POST',body:{envelope}});location.hash='/night/list';return;}
}
document.addEventListener('click',e=>{const b=e.target.closest('[data-en-act]');if(b){e.preventDefault();e.stopPropagation();action(b).catch(err=>EverlightDialog.alert('夜契：'+err.message));}});
document.addEventListener('change',e=>{if(e.target.id==='en-autocapture')autocapture=e.target.checked;});
document.addEventListener('submit',e=>{if(!['en-setup','en-unlock','en-entry','en-auto-bg'].includes(e.target.id))return;e.preventDefault();const submit=e.submitter;if(submit)submit.disabled=true;handleForm(e.target).catch(err=>{EverlightDialog.alert('操作没有完成：'+err.message);if(submit)submit.disabled=false;});});
// For explicitly trusted in-page host integrations only; never runs by itself or reads D's messages.
async function captureAuthorized(event){const e=epoch;if(!key||!autocapture)throw Error('夜契没有解锁或当前会话未授权自动归档');if(!event||event.userAuthorized!==true||!event.sourceRef||!Object.hasOwn(categories,event.kind)||!['fiction','real'].includes(event.reality)||typeof event.title!=='string'||!event.title.trim()||typeof event.note!=='string'||!event.note.trim())throw Error('缺少明确授权、来源或真实/虚构标识');const data={title:String(event.title).slice(0,100),kind:event.kind,reality:event.reality,note:String(event.note||'').slice(0,8000),happenedAt:event.happenedAt||'',sourceRef:String(event.sourceRef).slice(0,200),createdBy:'authorized-client-event',image:null};const envelope=await encrypt(checkEntry(data));guard(e);return api('/vault/entries',{method:'POST',body:{envelope}});}
window.EverlightNight={handles:p=>p==='/night'||p.startsWith('/night/'),render,captureAuthorized,lock};
})();
