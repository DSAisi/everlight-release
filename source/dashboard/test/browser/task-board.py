# Real browser, isolated fixture API; no connection to production.
from playwright.sync_api import sync_playwright
from pathlib import Path
import sys,json,mimetypes
from urllib.parse import urlsplit,unquote
root=Path(__file__).resolve().parents[2]
url='http://everlight.test/'
base={'revision':1,'category':'work','owner':'D','intent':'检查项目配置','acceptance':'以实际接口核验','source_refs':['src-demo-1'],'reporting':{'enabled':True,'interval_minutes':30,'next_due':'2026-11-25T14:00:00+08:00'},'workflow_evidence':{'steps':[],'deliveries':[]},'events':[],'verified':False,'due_at':None,'priority':'normal'}
rows=[dict(base,id='task-a',title='修正 doorman 仓库清单',state='in_progress',events=[{'detail':'已核对仓库接口，正在修订清单','state':'in_progress','actor':'ai','at':'2026-11-25T12:00:00+08:00','source_id':'src-demo-1'}]),dict(base,id='task-b',title='核对开口前的召回耗时',state='todo'),dict(base,id='task-c',title='提交测试报告',state='done'),dict(base,id='task-d',title='修订接口说明',state='verified',verified=True),dict(base,id='task-e',title='等待授权',state='blocked')]
requests=[]
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True,timezone_id='Asia/Tokyo')
 page.set_content('<meta name="viewport" content="width=device-width, initial-scale=1"><main id="screen" style="max-width:430px;margin:0 auto;padding:12px"></main>')
 for f in ['app.css','style.css','extra.css','addon.css','mobile-app.css']: page.add_style_tag(content=(root/f).read_text())
 page.evaluate("""rows=>{window.testRequests=[];window.fetch=async (url,opts={})=>{let data;if(url.includes('/ui/api/v1/status'))data={mode:'local',workflowMode:'core'};else if(url.includes('/settings/theme'))data={theme:'berry'};else if(url.includes('/api/v8/ui/tasks'))data={rows,total:rows.length};else if(url.includes('/api/list?slot=S01'))data={mode:'v8-adapter',rows:[{slot:'S01',id:'src-demo-1',actor:'D',text:'已确认测试任务与实际交付要求'}]};else if(url.includes('/api/v8/ui/workflow')){testRequests.push(JSON.parse(opts.body));data={id:'candidate-test'}}else return new Response('{}',{status:404});return new Response(JSON.stringify(data),{status:200,headers:{'Content-Type':'application/json'}})}}""",rows)
 page.evaluate("()=>{window.everlightFetch=window.fetch}")
 for f in ['dialogs.js','addon.js']: page.add_script_tag(content=(root/f).read_text())
 page.evaluate("""async()=>{document.querySelector('#screen').innerHTML='<p style="font-size:11px;color:#796889">隔离测试 · 示例任务</p>'+await EverlightExtras.render('/tasks',new URLSearchParams())}""")
 page.locator('.task-overview-card').first.wait_for()
 assert page.locator('.task-overview-card').count()==5
 assert page.locator('#el-core-create-task').is_hidden()
 assert page.locator('.task-maintenance').first.locator('form').first.is_hidden()
 assert page.locator('.task-state-done').inner_text()=='等待验收'
 assert page.locator('.task-state-verified').inner_text()=='已验收'
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
 if len(sys.argv)>1: page.screenshot(path=sys.argv[1])
 print('PASS: 390px grouped overview, forms hidden, distinct acceptance, no horizontal overflow')
 page.locator('[data-task-filter=blocked]').click();assert page.locator('.task-overview-card:visible').count()==1
 page.locator('[data-task-filter=all]').click();assert page.locator('.task-overview-card:visible').count()==5
 print('PASS: page state filters')
 card=page.locator('.task-overview-card').first
 card.locator('.task-disclosure').first.locator('summary').first.click();assert card.get_by_text('查看原话 1',exact=True).first.is_visible()
 print('PASS: real source navigation and history disclosure')
 card.locator('.task-disclosure').first.locator('summary').first.click()
 page.locator('.task-create > summary').click();form=page.locator('#el-core-create-task')
 form.locator('[name=title]').fill('验收测试任务');form.locator('[name=owner]').fill('D');form.locator('[name=acceptance]').fill('核对结果');form.locator('[name=due_at]').fill('2026-11-30T18:00')
 form.locator('[data-task-pick-source]').click();form.locator('.task-source-option').click();assert form.locator('[name=source_id]').input_value()=='src-demo-1'
 form.locator('details').last.locator('summary').click();form.locator('[name=category]').select_option('custom');assert form.locator('[name=category_label]').is_visible();assert form.locator('[name=category_label]').get_attribute('required') is not None
 form.locator('[name=category]').select_option('work');assert form.locator('[name=category_label]').is_hidden()
 form.locator('button[type=submit]').click();page.wait_for_timeout(500)
 requests=page.evaluate("window.testRequests");assert len(requests)==1,requests
 assert requests[0]['action']=='task-create' and requests[0]['source_id']=='src-demo-1' and requests[0]['due_at']=='2026-11-30T09:00:00.000Z',requests
 print('PASS: source picker, conditional category, device timezone conversion, actual POST payload')
 browser.close()

