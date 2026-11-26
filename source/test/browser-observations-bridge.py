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
   assert not json.loads(req(core,'/api/v8/ui/module?name=vitals',auth=coretoken)[2])['available']
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
    setup="""<script>location.hash='/modules';window.fetch=async(u,o={})=>{const r=await observationBridge(String(u).replace(/^blank/,''),o.method||'GET',o.body||null);return new Response(r.body,{status:r.status,headers:{'Content-Type':r.mime}})};</script>"""
    html=html.replace('<body>','<body>'+setup,1)
    page.set_content(html,wait_until='load');page.locator('[data-route="/module/domains"]').first.wait_for()
    for name in ['domains','env','vitals']:
     page.locator(f'#screen [data-route="/module/{name}"]').click();f=page.locator('#observationCreate');f.wait_for();f.locator('[name=title]').fill('RC3 fixture '+name);f.locator('[name=detail]').fill('synthetic data');f.locator('[name=observed_at]').fill('2026-11-23T10:00');
     if name=='vitals':f.locator('[name=source_ref]').fill('synthetic self report');f.locator('[name=consent]').check()
     else:f.locator('[name=source_id]').fill(source)
     f.locator('button[type=submit]').click();summary=page.locator('#screen details summary',has_text='RC3 fixture '+name);summary.wait_for();page.evaluate("window.dispatchEvent(new Event('everlight:night-lock'));location.hash='/modules'");page.locator(f'#screen [data-route=\"/module/{name}\"]').click();summary.wait_for();summary.click();page.locator('.observation-withdraw button').click();page.locator('dialog button',has_text='确认').click();page.wait_for_function("!document.querySelector('#screen .observation-withdraw') && document.querySelector('#screen').dataset.ready==='true'")
     assert json.loads(req(ui,'/api/module?name='+name)[2])['total']==0
     assert page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1')
     print('PASS actual browser save, navigate/reopen, withdraw, HTTP readback',name,flush=True);page.evaluate("location.hash='/modules'");page.locator('[data-route="/module/domains"]').first.wait_for()
    assert not errors,errors;assert sum(m=='POST' and path=='/api/v8/ui/observations' and c==200 for m,path,c in calls)==6;b.close()
  finally:
   for p in ps:p.terminate()
   for p in ps:p.wait(timeout=5)
if __name__=='__main__':main()
