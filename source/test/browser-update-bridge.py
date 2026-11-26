"""Test-only Chromium bridge to real dashboard HTTP, with mocked GitHub metadata. No direct browser networking or Safari claim."""
import os,tempfile,subprocess,socket,time,json,pathlib,secrets,urllib.request,urllib.error,re
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent
with tempfile.TemporaryDirectory() as d:
 with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
 base=f'http://127.0.0.1:{port}';token=secrets.token_hex(32)
 env=dict(os.environ,PORT=str(port),EVERLIGHT_UI_DB=d+'/ui.sqlite',EVERLIGHT_UI_SCOPE='personal',EVERLIGHT_UI_TOKEN=token,EVERLIGHT_DREAM_AUTO='0',EVERLIGHT_CORE_URL='',EVERLIGHT_UPDATE_REPO='example/everlight',EVERLIGHT_UPDATE_AUTO='0')
 # Only this test child replaces outbound GitHub fetch. No runtime fixture configuration is exposed.
 fixture=pathlib.Path(d)/'mock.mjs';fixture.write_text("const orig=globalThis.fetch;globalThis.fetch=(u,o)=>String(u)==='https://api.github.com/repos/example/everlight/releases?per_page=100'?Promise.resolve(new Response(JSON.stringify([{tag_name:'v0.1.0-beta.2',prerelease:true,draft:false,body:'增量测试 <img src=x onerror=alert(1)>'}]))):orig(u,o);\n")
 child=subprocess.Popen(['node','--import',str(fixture),str(ROOT/'dashboard/server.mjs')],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
 def req(path,method='GET',body=None):
  try:
   with urllib.request.urlopen(urllib.request.Request(base+path,method=method,data=body.encode() if body is not None else None,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'}),timeout=8) as r:return r.status,r.headers.get('Content-Type','application/json'),r.read().decode()
  except urllib.error.HTTPError as e:return e.code,'application/json',e.read().decode()
 try:
  for _ in range(50):
   try:
    if req('/ui/api/v1/updates')[0]==200:break
   except OSError:pass
   time.sleep(.1)
  else:raise RuntimeError('dashboard not ready')
  with sync_playwright() as p:
   b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page(viewport={'width':390,'height':844});page.set_default_timeout(5000);calls=[];errors=[]
   def bridge(path,method,body):
    code,mime,raw=req(path,method,body);calls.append((path,method,code));return {'status':code,'mime':mime,'body':raw}
   page.expose_function('updateBridge',bridge);page.on('pageerror',lambda e:errors.append(str(e)))
   html=(ROOT/'dashboard/index.html').read_text();html=re.sub(r'<link rel="stylesheet" href="([^"]+)"\s*/?>',lambda m:'<style>'+(ROOT/'dashboard'/m.group(1)).read_text()+'</style>',html)
   html=re.sub(r'<script src="([^"]+)"></script>',lambda m:'<script>'+(ROOT/'dashboard'/m.group(1)).read_text().replace('</script','<\\/script')+'</script>',html)
   html=html.replace('<body>',"<body><script>location.hash='/updates';window.fetch=async(u,o={})=>{const r=await updateBridge(String(u),o.method||'GET',o.body||null);return new Response(r.body,{status:r.status,headers:{'Content-Type':r.mime}})};</script>",1)
   page.set_content(html,wait_until='load');page.locator('[data-el-action="update-check"]').wait_for();assert page.locator('#el-updates').inner_text().find('尚未检查')>=0
   page.locator('[data-el-action="update-check"]').click();page.locator('#el-updates',has_text='发现新版本').wait_for();assert '0.1.0-beta.2' in page.locator('#el-updates').inner_text();assert ('/ui/api/v1/updates/check','POST',200) in calls
   assert '<img src=x onerror=alert(1)>' in page.locator('#el-updates pre').inner_text();assert page.locator('#el-updates pre img').count()==0
   assert page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1');assert not errors,errors
   print('PASS 390px update screen, actual check button, HTTP readback, escaped notes; mocked GitHub metadata via test-only bridge');b.close()
 finally:child.terminate();child.wait(timeout=5)
