/* Read-only unified workspace. Uses same v8 canonical projection as host; UI task board remains a separately labelled projection. */
(()=>{'use strict';
 const mount=()=>{const anchor=document.getElementById('everlight-shared');if(!anchor)return;
 const section=document.createElement('section');section.id='everlight-workspace';section.style.cssText='margin-top:10px;border-top:1px solid #e5d7ed;padding-top:10px;max-height:none;overflow:visible';
 const heading=document.createElement('strong');heading.textContent='十二库 · 任务 · 真实状态';section.append(heading);
 const toolbar=document.createElement('div');toolbar.style.cssText='display:flex;gap:6px;flex-wrap:wrap;margin:8px 0';
 const selector=document.createElement('select');selector.setAttribute('aria-label','选择记忆库');const all=document.createElement('option');all.value='';all.textContent='全部库';selector.append(all);
 for(let i=1;i<=12;i++){const o=document.createElement('option');o.value='S'+String(i).padStart(2,'0');o.textContent=o.value;selector.append(o)}
 const reload=document.createElement('button');reload.type='button';reload.textContent='刷新真实数据';toolbar.append(selector,reload);section.append(toolbar);
 const alertBox=document.createElement('div');alertBox.setAttribute('role','alert');alertBox.style.cssText='display:none;background:#fff0f0;border:2px solid #d53043;color:#9b1728;padding:12px;border-radius:12px;margin:10px 0;font-weight:600';section.append(alertBox);const status=document.createElement('p');status.setAttribute('role','status');const counts=document.createElement('div'),pending=document.createElement('div'),tasks=document.createElement('div'),localTasks=document.createElement('div'),memories=document.createElement('div');section.append(status,counts,pending,tasks,localTasks,memories);anchor.querySelector('#everlight-shared-body').append(section);
 const block=(root,title,rows,render)=>{root.replaceChildren();const h=document.createElement('h4');h.textContent=title;root.append(h);if(!rows.length){const p=document.createElement('p');p.textContent='暂无真实记录';root.append(p)}for(const row of rows){const p=document.createElement('p');p.style.cssText='padding:7px;border:1px solid #e8deef;border-radius:9px;white-space:pre-wrap';p.textContent=render(row);root.append(p)}};
 async function get(url){const r=await window.everlightFetch(url,{credentials:'same-origin'});const data=await r.json();if(!r.ok)throw Error(data.error||String(r.status));return data}
 async function refresh(){reload.disabled=true;status.textContent='正在读取…';try{
  const params=new URLSearchParams({limit:'50'});if(selector.value)params.set('slot',selector.value);
  const [core,ui,health]=await Promise.allSettled([get('/api/v8/shared/view?'+params),get('/ui/api/v1/tasks'),get('/api/v8/health/chains')]);
  if(health.status==='fulfilled'){const h=health.value;alertBox.style.display=h.alerts.length?'block':'none';alertBox.textContent=h.alerts.length?'🔴 长明链路异常（'+h.alerts.length+'）\n'+h.alerts.map(a=>'• '+a.title+'：'+a.detail).join('\n'):'';alertBox.style.whiteSpace='pre-wrap'}else{alertBox.style.display='block';alertBox.textContent='🔴 链路健康检查不可用：'+health.reason.message;}
  if(core.status==='fulfilled'){
   const x=core.value;counts.textContent='规范库：'+Object.entries(x.slots).map(([k,v])=>`${k} ${v}`).join(' · ')+' ｜系统流水 S01 '+x.system_ledgers.S01+' / S02 '+x.system_ledgers.S02+' / S10 '+x.system_ledgers.S10;
   block(tasks,'S03 规范任务 · 有来源的进度事件',x.tasks||[],r=>`${r.title} · ${r.state} · 负责人 ${r.owner} · 验收 ${r.acceptance||'未设定'}\n${r.verified?'已有人类或宿主验收':'未获验收'} · ${r.events?.length||0} 条进度事件 · ${r.state_source}`);
   block(pending,'待审核 / 待提交（不等于已入库）',x.pending,r=>`${r.slot} · ${r.kind} · ${r.state} · ${r.reason}`);
   block(memories,'规范记忆（已提交）',x.memories,r=>`${r.slot} · ${r.kind} · v${r.revision} · ${JSON.stringify(r.payload,null,2)}\n来源：${r.sources.join(', ')}\n状态：${r.state} · 时间：${r.created_at} · ID：${r.id}`);
  }else{counts.textContent='规范核心未连接：'+core.reason.message;pending.replaceChildren();memories.replaceChildren();tasks.replaceChildren()}
  if(ui.status==='fulfilled'){const rows=ui.value.items||ui.value.rows||[];block(localTasks,'任务面板 · UI 本地任务（与 S03 分别显示）',rows,r=>`${r.title||'未命名'} · ${r.status||'未知状态'} · 负责人 ${r.owner||'未指定'} · ${r.acceptance||'尚无验收标准'}`)}else{localTasks.textContent='UI 本地任务读取失败：'+ui.reason.message}
  status.textContent='读取完成。未连接的模块不会使用模拟数据。';
 }catch(e){status.textContent='读取失败：'+e.message}finally{reload.disabled=false}}
 reload.onclick=refresh;selector.onchange=refresh;document.getElementById('everlight-shared-toggle').addEventListener('click',()=>{if(!document.getElementById('everlight-shared-body').hidden)refresh()});
 };if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
