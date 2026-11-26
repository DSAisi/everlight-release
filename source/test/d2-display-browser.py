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
   original='第一行\n第二行 <img src=x onerror=alert(1)> 与原话引号'
   source=post('/api/v8/source',{'scope':'personal','actor':'migration-adapter','kind':'legacy_raw_event','source_ref':'fixture.jsonl:7','body':{'text':original,'happened_at':'2026-08-19T02:03:04+08:00','legacy_actor':'d','channel':'qisuo','conversation_id':'fixture'}})['id']
   proposal=post('/api/v8/proposal',{'scope':'personal','slot':'S05','kind':'fact','payload':{'statement':'D2 fixture fact','subject':'user','attribution':'explicit'},'source_refs':[source],'reason':'fixture','idempotency_key':'d2-browser'})['id']
   digest=json.loads(req(core,'/api/v8/joint/status?scope=personal&id='+proposal,auth=coretoken)[2])['digest']
   for role in ['ai','human']:post('/api/v8/joint/'+role,{'scope':'personal','id':proposal,'digest':digest,'decision':'approve','reason':role+' fixture'},dict(host,**{'x-everlight-decision-token':env['EVERLIGHT_'+role.upper()+'_DECISION_TOKEN']}))
   memory=post('/api/v8/commit/scoped',{'scope':'personal','id':proposal})['id']
   post('/api/v8/recall',{'scope':'personal','query':'D2 fixture fact','limit':8})
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
    setup="""<script>location.hash='/library/S01';window.fetch=async(u,o={})=>{const r=await observationBridge(String(u).replace(/^blank/,''),o.method||'GET',o.body||null);return new Response(r.body,{status:r.status,headers:{'Content-Type':r.mime}})};</script>"""
    html=html.replace('<body>','<body>'+setup,1)
    page.set_content(html,wait_until='load');row=page.locator('[data-route="/memory/S01/'+source+'"]');row.wait_for()
    assert '第一行' in row.inner_text() and '發言人' not in row.inner_text();assert '发言人：d' in row.inner_text();assert '发生 2026-08-19' in row.inner_text();assert '{"text":' not in row.inner_text()
    row.click();q=page.locator('#screen .quote');q.wait_for();assert q.text_content()==original;assert q.locator('img').count()==0;assert page.locator('#screen').get_by_text('原话发生时间',exact=True).count()==1;assert page.locator('#screen').get_by_text('实际入库时间',exact=True).count()==1;assert page.locator('#screen').get_by_text('fixture.jsonl:7',exact=True).count()>=1
    assert page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1');assert not errors,errors
    page.locator('[data-route="/memory/S05/'+memory+'"]').click();page.get_by_text('召回记录 · 不等于实际送达',exact=True).wait_for();assert page.locator('#screen').get_by_text('选中轮次（本版本）',exact=True).count()>=1
    page.evaluate("location.hash='/reviews/committed'");page.locator('[data-route="/review/'+proposal+'"]').click();page.get_by_text('正式提交结果',exact=True).wait_for();assert page.locator('#screen').get_by_text('ai fixture',exact=True).count()>=1;assert page.locator('#screen').get_by_text('human fixture',exact=True).count()>=1
    assert page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1');assert not errors,errors
    print('PASS 390px actual S01 reverse link, recall detail, committed review and both reasons; test-only HTTP bridge',flush=True);b.close()
  finally:
   for p in ps:p.terminate()
   for p in ps:p.wait(timeout=5)
if __name__=='__main__':main()
