(()=>{
 const titles={'/notifications':'通知中心','/controls':'设置中心'};
 const kinds={joy:'喜悦',sadness:'悲伤',anger:'愤怒',fear:'恐惧',surprise:'惊讶',calm:'平静',interest:'兴趣',aspiration:'愿望',value_conflict:'价值冲突',intention:'意向',remind_ai:'留言 / 提醒',task_nudge:'任务核查',memory_check:'记忆质量核查',review_request:'审核提醒',dream_request:'梦境请求'};
 const notificationRows=(items,esc)=>items.map(a=>`<div class="line-item"><span class="item-copy"><strong>${esc(kinds[a.kind]||a.kind)}</strong><small>通知 ID：${esc(a.id)}</small><small>${esc(a.created_at)} · ${esc(a.state==='resolved'?'已反馈':a.state==='rejected'?'已拒绝':!a.active?'不再有效':a.request_verified?'模型请求读回已核验（非已执行）':(a.state==='acknowledged'||a.connect_host_accepted)?'宿主确认接收（非模型执行）':'排队待宿主处理')}</small></span></div>`).join('')||'<div class="empty">尚无通知</div>';
 const settingStatus=v=>!v.available?'未配置运行依赖或授权':v.effective?'运行条件已允许（非执行回执）':v.enabled?'已设置，依赖未启用':'已停用';
 const refresh='<button type="button" class="soft-btn" data-action="retry">刷新实际状态</button>';
 window.EverlightMainline={handles:path=>Object.hasOwn(titles,path),async render(path,{api,heading,panel,esc,linkButton,empty}){
  if(path==='/controls'){
   const d=await api('/api/v8/ui/settings');const retrieval=await api('/api/v8/ui/mainline?name=retrieval').catch(()=>null);const names={continuity:'持续状态与自动关心',memory:'自动记忆与分类',commitments:'待办自动感知',tracking:'任务进度与写入提醒',repair:'质量核查调度',autonomy:'自主调度',offline:'离线活动',dream:'自主做梦',learning:'自主学习',evolution:'认知演化',reflection:'自主反思',creation:'自主创作',message:'自主消息',motivation:'动机活动',promise:'运行层承诺',tasks:'运行层任务',correction:'运行层纠错',feedback:'运行层反馈',recall:'运行层召回',photo:'运行层照片',private:'运行层私密',notice:'运行层通知'};
   const rows=(items,domain)=>items.map(v=>`<div class="line-item"><span class="item-copy"><strong>${esc(names[v.key]||v.key)}</strong><small>${settingStatus(v)}</small></span>${v.available?`<button type="button" class="soft-btn" data-h6-key="${esc(v.key)}" data-h6-domain="${domain}" data-h6-enabled="${!v.enabled}">${v.enabled?'关闭':'开启'}</button>`:''}</div>`).join('');
   return heading('EVERLIGHT / SETTINGS','设置中心','实际后端读回')+panel('自动记录与提醒',rows(d.core,'core'))+panel('召回策略与资源权限',retrieval?.mode==='automatic'?`<p>自动选择 · 必要检索不可关闭</p><p class="hint">本地：${esc(retrieval.local_text)}；人物关联：${retrieval.person_association?'已配置':'未配置'}；原话：${retrieval.raw_evidence_opt_in?'核心已授权，仍需逐次许可':'未授权'}</p><p class="hint">外部向量：${retrieval.remote_allowed?'已获配置授权，实际健康待核验':retrieval.remote_configured?'管理员已停用查询':'未配置'}；可信插件 ${esc(retrieval.trusted_plugins.length)} 个（传输范围未声明）</p><p class="hint">召回正文候选预算：${esc(retrieval.context_budget_bytes??'未配置')} 字节（非 Token）；目前仅宿主可建议跳过内置外部向量，AI 自主选择尚未验收。</p>`:'<p class="hint">核心策略未读到，不推测状态。</p>')+panel('其他设置入口',linkButton('查看宿主同步回执 / 主动提醒','/notifications')+linkButton('记忆治理与安装状态','/status')+linkButton('皮肤与字体','/skins'))+panel('设置结果','<p role="status" id="mainline-result"></p>'+refresh);
  }
  const d=await api('/api/v8/ui/mainline?name=notifications');
  const title=heading('EVERLIGHT / LIVE',titles[path],'后端真实读回 · '+d.read_at);
  if(path==='/notifications'){
   const q=d.quality;
   return title+panel('需要处理',`<div class="mainline-metrics"><div><strong>${esc(q.human+q.person)}</strong>人类审核</div><div><strong>${esc(q.ai)}</strong>AI 核查</div><div><strong>${esc(q.system)}</strong>技术问题</div></div><p class="hint">待分类路由 ${esc(q.classification_waiting??0)} 条（不计入异常；不代表均可提取）。统计是问题项，不是记忆条数；语义覆盖尚未验收。</p><p class="hint">分类处置：${Object.entries(q.classification_dispositions||{}).map(([k,v])=>esc(({proposed:"已生成候选",exact_repeat:"重复",no_change:"无新增",held:"暂缓/排除",retry:"待重试",awareness_pending:"待核查",task_reported:"任务报告"})[k]||k)+" "+esc(v)).join(" · ")||"暂无"}；旧版处置 ${esc(q.classification_legacy??0)} 条。处置不代表正式入库。</p><p class="hint">累计重建重复证据候选 ${esc(q.repeat_repaired??0)} 条（仍需正常审核，不等于已入库）。</p>${linkButton('记忆审核','/reviews/pending')} ${linkButton('人物审核','/relations')} ${linkButton('问题明细','/audit')}`)+panel('持续状态',!d.continuity?.enabled?'<p class="hint">未启用持续状态</p>':(d.continuity.items.map(v=>`<div class="line-item"><span class="item-copy"><strong>${esc(v.label)}</strong><small>${esc(({last_reported_active:'上次自述正在进行',needs_confirmation:'待核查现状',reported_ended:'已自述结束',unknown_stale:'已过期，当前未知'})[v.state]||v.state)} · ${esc(v.observed_at)}</small><small>跟进计划：${esc(v.followup_at||'无')} · ${esc(v.followup_state||'未排队')}</small><small>经历归档：${esc(({not_compiled:'尚未生成',pending:'待审核',approved_pending_commit:'待提交',committed:'正式入库',rejected:'已驳回',source_invalid:'来源失效',not_current:'已非当前版本'})[v.links?.archive]||v.links?.archive||'未知')}</small>${(v.links?.items||[]).map(m=>`<small>${esc(m.slot)} · ${esc(m.label)}${m.task_state?' · '+esc(m.task_state):''}（${m.association==='episode_evidence_bridge'?'经共同经历证据关联':'同源关联'}）</small>`).join('')}${v.links?.has_more?'<small>还有关联记录</small>':''}</span></div>`).join('')||'<p class="hint">暂无可信状态</p>'))+panel('状态变化历史 · 最近50条',!d.continuity?.enabled?'<p class="hint">持续状态已停用</p>':((d.continuity.history||[]).map(v=>`<div class="line-item"><span class="item-copy"><strong>${esc(v.label)} · ${esc(v.state==='reported_ended'?'已自述结束':'当时自述进行中')}</strong><small>${esc(v.observed_at)} · 当时跟进计划：${esc(v.followup_at||'无')}</small></span></div>`).join('')||'<p class="hint">暂无新版本状态历史</p>'))+panel('联系 AI',`<form id="mainline-remind"><label>留言或提醒<textarea name="body" maxlength="2000" rows="3" required></textarea></label><button class="soft-btn primary" type="submit">提交到统一通知</button><p role="status" id="mainline-result"></p></form>`)+panel('最近通知 · 最多50条',`<div id="mainline-notice-rows">${notificationRows(d.items,esc)}</div>`)+panel('记忆修订与失效通知 · 最近50条',(d.memory_changes||[]).map(v=>`<div class="line-item"><span class="item-copy"><strong>${v.kind==='human_fact_revision'?'人类事实修订请求':'记忆缓存失效同步'}</strong><small>事件 ${esc(v.seq)} · ${esc(v.at)}</small><small>${esc(v.host_accepted_at?'宿主已确认接收（非模型执行）':'尚无宿主接收回执；可能已过期或受权限限制')}</small>${v.kind==='human_fact_revision'?`<small>候选状态：${esc(v.proposal_state||'未知')}</small>${linkButton('核查修订候选','/review/'+encodeURIComponent(v.ref))}`:''}</span></div>`).join('')||'<p class="hint">暂无记忆变更通知</p>')+panel('最近设置快照的宿主接收回执',(d.settings_sync||[]).map(v=>`<div class="line-item"><span class="item-copy"><strong>${v.domain==='core'?'自动记忆与提醒':'自主运行'}</strong><small>${esc(v.status==='unavailable'?'状态暂不可用':v.host_accepted_at?'宿主已确认接收（非模型执行）':'等待宿主接收')} ${esc(v.host_accepted_at||'')}</small></span></div>`).join('')||'<p class="hint">尚无宿主同步记录</p>')+panel('同步',refresh);
  }
  return heading('EVERLIGHT','页面未开放','邀请测试版不提供该模块');
 }};
 // The POST returns the authoritative snapshot, including dependent switches. Update it
 // immediately, even when a focused button intentionally prevents background rerender.
 let settingsBusy=false;const pendingReminders=new WeakMap();
 function applySettings(root,d){
  for(const b of root.querySelectorAll('[data-h6-key]')){
   const v=d[b.dataset.h6Domain]?.find(x=>x.key===b.dataset.h6Key);if(!v)continue;
   const label=b.closest('.line-item')?.querySelector('small');if(label)label.textContent=settingStatus(v);
   b.dataset.h6Enabled=String(!v.enabled);b.textContent=v.enabled?'关闭':'开启';b.disabled=!v.available;
  }
 }
 document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-h6-key]');if(!b)return;e.preventDefault();e.stopPropagation();if(settingsBusy||b.disabled)return;
  const root=b.closest('#screen'),r=document.getElementById('mainline-result');if(!root)return;
  const domain=b.dataset.h6Domain,key=b.dataset.h6Key,enabled=b.dataset.h6Enabled==='true';
  const buttons=[...root.querySelectorAll('[data-h6-key]')];settingsBusy=true;buttons.forEach(x=>x.disabled=true);
  let snapshot=null;
  try{
   const res=await window.everlightFetch('/api/v8/ui/settings',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({domain,key,enabled})});
   const d=await res.json();if(!res.ok)throw Error(d.error||'未确认');
   if(!Array.isArray(d.core)||!Array.isArray(d.runtime)||d[domain]?.find(x=>x.key===key)?.enabled!==enabled)throw Error('设置读回不一致，请刷新核对');
   snapshot=d;if(b.isConnected){applySettings(root,d);if(r)r.textContent='设置已保存并读回；宿主轮询后静默同步，不会自动唤醒 AI。接收回执见通知中心；执行状态另行核验。';}
  }catch(err){if(r?.isConnected)r.textContent='未确认：'+err.message+'；请刷新实际状态后重试。';}
  finally{settingsBusy=false;if(b.isConnected){if(snapshot)applySettings(root,snapshot);else buttons.forEach(x=>x.disabled=false);if(snapshot){if(document.activeElement===b)b.blur();window.dispatchEvent(new Event('everlight:mainline-refresh'));}}}
 },true);
 document.addEventListener('submit',async e=>{
  if(e.target.id!=='mainline-remind')return;e.preventDefault();const f=e.target,b=e.submitter||f.querySelector('button[type=submit]'),r=f.querySelector('[role=status]'),input=f.elements.body;
  if(f.dataset.busy==='true')return;const body=input.value.trim();if(!body){r.textContent='请填写正文';return;}
  let pending=pendingReminders.get(f);if(!pending||pending.body!==body){pending={body,key:crypto.randomUUID?.()||Array.from(crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('')};pendingReminders.set(f,pending);}
  f.dataset.busy='true';b.disabled=true;input.readOnly=true;let saved=false;
  try{const res=await window.everlightFetch('/api/v8/shared/actions',{method:'POST',credentials:'same-origin',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'remind_ai',actor:'human',body,idempotency_key:pending.key})});const d=await res.json();if(!res.ok||!d.id)throw Error(d.error||'未取得通知 ID');pendingReminders.delete(f);saved=true;if(f.isConnected){r.textContent='已排队：'+d.id+'，尚未证明 AI 收到。';f.reset();}}
  catch(err){if(f.isConnected)r.textContent='未确认提交：'+err.message+'；同一内容可安全重试。';}
  finally{delete f.dataset.busy;b.disabled=false;input.readOnly=false;if(saved&&f.isConnected){if(f.contains(document.activeElement))document.activeElement.blur();window.dispatchEvent(new Event('everlight:mainline-refresh'));}}
 });
})();
