# Chromium real DOM and isolated API fixtures; HTTP/backend covered separately.
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
root=Path(__file__).resolve().parents[2]
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 page.set_content('<meta name="viewport" content="width=device-width, initial-scale=1"><main id="screen"></main>')
 page.evaluate('''()=>{window.calls=[];window.job=null;window.invite=null;window.fail=true;window.confirm=()=>true;window.everlightFetch=async(u,o={})=>{let d;let body=o.body?JSON.parse(o.body):null;if(u.endsWith('/status'))d={mode:'local',workflowMode:'core'};else if(u.includes('/ui/dreams?'))d={rows:[],total:0};else if(u.includes('/dream-invitations'))d={items:invite?[invite]:[],inbox_configured:true};else if(u.includes('/ui/workflow')){calls.push(body);if(fail){fail=false;throw Error('offline')}invite={state:'queued'};d={id:'dream-test'}}else if(u.endsWith('/updates/authorize')){calls.push(body);job={version:body.version,state:'authorized',notification_id:'n-test'};d=job;}else if(u.endsWith('/updates')||u.endsWith('/updates/check'))d={local:{version:'0.1.0-beta.13'},latest:{version:'0.1.0-beta.14',notes:'test'},repository:'example/everlight',configured:true,authorizationEnabled:true,status:'update_available',job};else throw Error(u);return new Response(JSON.stringify(d),{status:200});};window.show=async path=>document.querySelector('#screen').innerHTML=await EverlightExtras.render(path,new URLSearchParams());}''')
 for f in ['app.css','addon.css','mobile-app.css']:page.add_style_tag(content=(root/f).read_text())
 for f in ['dialogs.js','addon.js']:page.add_script_tag(content=(root/f).read_text())
 page.evaluate("show('/dreams')"); invite=page.get_by_role('button',name='邀请 AI 自主整理');expect(invite).to_be_visible();invite.click();expect(page.locator('dialog')).to_contain_text('操作没有完成');page.get_by_role('button',name='知道了').click();expect(invite).to_be_enabled();invite.click();expect(page.locator('dialog')).to_contain_text('等待宿主投递');assert page.evaluate('calls[0].idempotency_key===calls[1].idempotency_key && calls[1].action==="dream-invite"');print('PASS dream actual click, failure and same-key retry, truthful queued wording')
 # Close via dialog API without navigation; reload is expected; render next screen in fresh fixture after click handler.
 page.evaluate("EverlightDialog.dismiss()")
 page.wait_for_timeout(100)
 # About:blank reload can clear JS; use separate page for update.
 page.close();page=b.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
 page.set_content('<meta name="viewport" content="width=device-width, initial-scale=1"><main id="screen"></main>')
 page.evaluate('''()=>{window.calls=[];window.job=null;window.confirm=()=>true;window.everlightFetch=async(u,o={})=>{let body=o.body?JSON.parse(o.body):null;if(u.endsWith('/updates/authorize')){calls.push(body);job={version:body.version,state:'authorized',notification_id:'n-test'};return new Response(JSON.stringify(job))}return new Response(JSON.stringify({local:{version:'0.1.0-beta.13'},latest:{version:'0.1.0-beta.14',notes:'test'},repository:'example/everlight',configured:true,authorizationEnabled:true,status:'update_available',job}));};}''')
 for f in ['dialogs.js','addon.js']:page.add_script_tag(content=(root/f).read_text())
 page.evaluate("async()=>document.querySelector('#screen').innerHTML=await EverlightExtras.render('/updates',new URLSearchParams())")
 page.get_by_role('button',name='检查更新').click();page.get_by_role('button',name='授权 AI 更新（先备份）').click();expect(page.locator('#el-updates')).to_contain_text('已授权，等待 AI 领取');expect(page.locator('#el-updates')).to_contain_text('尚未校验');assert page.evaluate('calls.length===1&&calls[0].confirm===true&&calls[0].version==="0.1.0-beta.14"');page.get_by_role('button',name='刷新任务进度').click();expect(page.locator('#el-updates')).to_contain_text('已进入宿主通知队列');print('PASS update actual check/authorize/refresh clicks and backup pending status');b.close()
