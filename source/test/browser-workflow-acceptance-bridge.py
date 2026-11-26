"""Chromium inline document, real controls + actual isolated HTTP through explicit test-only fetch bridge; not direct network/Safari."""
import os,tempfile,subprocess,socket,time,json,pathlib,secrets,urllib.request,urllib.error
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
def port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]
def main():
 with tempfile.TemporaryDirectory() as d:
  cp,up=port(),port();core=f'http://127.0.0.1:{cp}';ui=f'http://127.0.0.1:{up}'
  env=dict(os.environ,EVERLIGHT_BOUND_SCOPE='personal',EVERLIGHT_UI_SCOPE='personal',EVERLIGHT_CORE_ADAPTER='v8',EVERLIGHT_CORE_URL=core,EVERLIGHT_CORE_PORT=str(cp),PORT=str(up),EVERLIGHT_CORE_DB=d+'/core.sqlite',EVERLIGHT_UI_DB=d+'/ui.sqlite',EVERLIGHT_DREAM_AUTO='0',EVERLIGHT_REVIEW_WRITES='1',EVERLIGHT_VITALS_UI='1',EVERLIGHT_MEDIA_DIR=d+'/media')
  for k in ['CORE_TOKEN','UI_TOKEN','HOST_TOKEN','SHARED_HOST_TOKEN','HUMAN_DECISION_TOKEN','AI_DECISION_TOKEN','GOVERNANCE_ADMIN_TOKEN','VITALS_TOKEN']:env['EVERLIGHT_'+k]=secrets.token_hex(32)
  ps=[subprocess.Popen(['node',p],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL) for p in ['core/server.mjs','dashboard/server.mjs']]
  def req(base,path,method='GET',data=None,auth=None,extra={}):
   h={'Authorization':'Bearer '+(auth or env['EVERLIGHT_UI_TOKEN']),**extra}
   if data is not None:h['Content-Type']='application/json'
   try:
    with urllib.request.urlopen(urllib.request.Request(base+path,data=data,headers=h,method=method),timeout=8) as r:return r.status,r.headers.get('Content-Type','application/octet-stream'),r.read()
   except urllib.error.HTTPError as e:return e.code,e.headers.get('Content-Type','application/json'),e.read()
  try:
   for base,path,auth in [(core,'/api/v8/contract',env['EVERLIGHT_CORE_TOKEN']),(ui,'/',env['EVERLIGHT_UI_TOKEN'])]:
    for i in range(80):
     try:
      if req(base,path,auth=auth)[0]==200:break
     except OSError:pass
     time.sleep(.1)
    else:raise RuntimeError('readiness failed')
   host={'x-everlight-host-token':env['EVERLIGHT_SHARED_HOST_TOKEN']};coretoken=env['EVERLIGHT_CORE_TOKEN'];src=req(core,'/api/v8/source','POST',json.dumps({'scope':'personal','actor':'human','kind':'message','source_ref':'test','body':'synthetic evidence'}).encode(),coretoken,host);assert src[0]==200;source=json.loads(src[2])['id']
   def post(path,body,headers=host):
    status,_,raw=req(core,path,'POST',json.dumps(body).encode(),coretoken,headers);assert status==200,(path,status,raw);return json.loads(raw)
   proposal=post('/api/v8/proposal',{'scope':'personal','slot':'S03','kind':'goal','reason':'fixture','idempotency_key':'browser-task','source_refs':[source],'payload':{'summary':'RC5 browser task','owner':'AI','intent':'test','state':'todo'}})
   pid=proposal['id'];digest=json.loads(req(core,'/api/v8/joint/status?scope=personal&id='+pid,auth=coretoken)[2])['digest']
   for role in ['ai','human']:post('/api/v8/joint/'+role,{'scope':'personal','id':pid,'digest':digest,'decision':'approve','reason':'fixture'},{**host,'x-everlight-decision-token':env['EVERLIGHT_'+role.upper()+'_DECISION_TOKEN']})
   task=post('/api/v8/commit/scoped',{'scope':'personal','id':pid})
   delivery_source=post('/api/v8/source',{'scope':'personal','actor':'human','kind':'message','source_ref':'delivery','body':'synthetic delivery'})['id']
   accept_source=post('/api/v8/source',{'scope':'personal','actor':'human','kind':'message','source_ref':'accept','body':'synthetic acceptance'})['id']
   delivery=post('/api/v8/tasks/evidence',{'scope':'personal','memory_id':task['id'],'expected_revision':1,'kind':'delivery','source_id':delivery_source,'actor':'human','detail':'synthetic deliverable','idempotency_key':'delivery'})
   for value in ['red','blue']:post('/api/v8/source',{'scope':'personal','actor':'human','kind':'message','source_ref':'color-'+value,'body':{'subject':'fixture','field':'color','value':value}})
   job=post('/api/v8/dream/start',{'scope':'personal','idempotency_key':'browser-dream'})
   for i in range(5):post('/api/v8/dream/advance',{'scope':'personal','id':job['id'],'expected_stage':i})
   # Test-only browser origin; every intercepted request is forwarded to the actual isolated UI HTTP service.
   with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page(viewport={'width':390,'height':844});page.set_default_timeout(5000);errors=[];calls=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    import re,base64,mimetypes
    def bridge(path,method,body):
     code,mime,raw=req(ui,path,method,body.encode() if body is not None else None);calls.append((method,path,code));return {'status':code,'mime':mime,'body':raw.decode()}
    page.expose_function('observationBridge',bridge)
    html=(ROOT/'dashboard/index.html').read_text()
    html=re.sub(r'<link rel="stylesheet" href="([^"]+)"\s*/?>',lambda m:'<style>'+(ROOT/'dashboard'/m.group(1)).read_text()+'</style>',html)
    def inline(m):
     js=(ROOT/'dashboard'/m.group(1)).read_text()
     for name in ['assets/lampkin-peek.png','assets/memory-orb.png','assets/approved-reference.jpg']:
      raw=(ROOT/'dashboard'/name).read_bytes();js=js.replace(name,'data:'+mimetypes.guess_type(name)[0]+';base64,'+base64.b64encode(raw).decode())
     return '<script>'+js.replace('</script','<\\/script')+'</script>'
    html=re.sub(r'<script src="([^"]+)"></script>',inline,html)
    setup="""<script>location.hash='/dreams';window.fetch=async(u,o={})=>{const r=await observationBridge(String(u).replace(/^blank/,''),o.method||'GET',o.body||null);return new Response(r.body,{status:r.status,headers:{'Content-Type':r.mime}})};</script>"""
    html=html.replace('<body>','<body>'+setup,1)
    page.set_content(html,wait_until='load');page.locator('[data-el-action="core-dream-start"]').wait_for()
    form=page.locator('[data-dream-candidate="1"]').first;form.locator('select[name=decision]').select_option('propose');form.locator('select[name=source_id]').select_option(index=1);form.locator('textarea').fill('synthetic browser review');form.locator('button').click()
    for i in range(30):
     rows=json.loads(req(ui,'/api/v8/ui/dreams')[2])['rows'];row=next(r for r in rows if r['id']==job['id'])
     if row['proposals'][0]['decision']:break
     page.wait_for_timeout(100)
    assert row['proposals'][0]['decision']['reason']=='synthetic browser review'
    assert row['proposals'][0]['decision']['proposal_id'];assert row['proposals'][0]['decision']['decision']=='propose'
    print('PASS actual dream candidate submit and core readback',flush=True)
    page.wait_for_timeout(700);page.set_content(html,wait_until='load');page.locator('[data-el-action="core-dream-start"]').wait_for();page.evaluate("location.hash='/tasks'");page.locator('#el-core-create-task').wait_for()
    def open_tasks():
     page.wait_for_timeout(700);page.set_content(html,wait_until='load');page.locator('[data-el-action="core-dream-start"]').wait_for();page.evaluate("location.hash='/tasks'");page.locator('#el-core-create-task').wait_for();page.locator('summary',has_text='子步骤与交付记录').first.click()
    def task_state():return json.loads(req(ui,'/api/v8/ui/tasks')[2])['rows'][0]
    def wait_state(state):
     for i in range(40):
      row=task_state()
      if row['state']==state:return row
      page.wait_for_timeout(100)
     raise AssertionError(row)
    page.locator('summary',has_text='子步骤与交付记录').first.click()
    form=page.locator('form[data-core-task-event]').filter(has=page.locator('input[name=state][value=done]')).first;form.locator('input[name=source_id]').fill(source);form.locator('textarea').fill('synthetic completion');form.locator('button').click();wait_state('done');print('PASS actual completion claim click and readback',flush=True)
    # Dismiss application alert to permit reload before fresh render.
    page.get_by_role('button',name='知道了',exact=True).click(timeout=3000)
    open_tasks()
    form=page.locator('form[data-core-task-event]').filter(has=page.locator('input[name=state][value=verified]')).first;form.locator('select').select_option(delivery['id']);form.locator('input[name=source_id]').fill(accept_source);form.locator('textarea').fill('synthetic independent acceptance');form.locator('button').click();assert wait_state('verified')['verified'];print('PASS actual independent acceptance click and readback',flush=True)
    assert page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1')
    assert not errors,errors;b.close()
  finally:
   for p in ps:p.terminate()
   for p in ps:p.wait(timeout=5)
if __name__=='__main__':main()
