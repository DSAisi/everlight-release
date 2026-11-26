"""Offline Chromium render/navigation from recorded isolated HTTP GET snapshots; no live browser writes."""
import re,base64,os,tempfile,subprocess,socket,time,urllib.request,urllib.error,json,pathlib,secrets,http.cookiejar,mimetypes
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent

def port():
 with socket.socket() as s:s.bind(('127.0.0.1',0));return s.getsockname()[1]

def main():
 with tempfile.TemporaryDirectory() as d:
  cp,up=port(),port();core=f'http://127.0.0.1:{cp}';ui=f'http://127.0.0.1:{up}'
  env=dict(os.environ,EVERLIGHT_BOUND_SCOPE='personal',EVERLIGHT_UI_SCOPE='personal',EVERLIGHT_CORE_ADAPTER='v8',EVERLIGHT_CORE_URL=core,EVERLIGHT_CORE_PORT=str(cp),PORT=str(up),EVERLIGHT_CORE_DB=d+'/core.sqlite',EVERLIGHT_UI_DB=d+'/ui.sqlite',EVERLIGHT_DREAM_AUTO='0',EVERLIGHT_REVIEW_WRITES='1',EVERLIGHT_MEDIA_DIR=d+'/media')
  for k in ['CORE_TOKEN','UI_TOKEN','HOST_TOKEN','SHARED_HOST_TOKEN','HUMAN_DECISION_TOKEN','AI_DECISION_TOKEN','GOVERNANCE_ADMIN_TOKEN']:env['EVERLIGHT_'+k]=secrets.token_hex(32)
  ps=[subprocess.Popen(['node',p],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL) for p in ['core/server.mjs','dashboard/server.mjs']]
  try:
   for url in [core+'/api/v8/contract',ui+'/']:
    for i in range(80):
     try:
      with urllib.request.urlopen(urllib.request.Request(url,headers={'Authorization':'Bearer '+env['EVERLIGHT_CORE_TOKEN']}),timeout=1) as r:assert r.status==200
      break
     except Exception:time.sleep(.1)
    else:raise RuntimeError('readiness failed')
   opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
   with opener.open(urllib.request.Request(ui+'/api/session',data=json.dumps({'token':env['EVERLIGHT_UI_TOKEN']}).encode(),headers={'Content-Type':'application/json'})) as r:assert r.status==200
   paths=['/api/status','/api/reviews?state=pending&limit=1','/api/recent?limit=1','/api/turn?limit=1','/api/modules','/api/v8/ui/governance','/api/v8/ui/gateway-health','/api/v8/relations/graph','/ui/api/v1/status','/ui/api/v1/settings/theme','/ui/api/v1/dreams','/ui/api/v1/tasks','/ui/api/v1/dreams/reviews','/ui/api/v1/vault/status','/ui/api/v1/vault/auto','/ui/api/v1/media/summary','/ui/api/v1/media/albums','/ui/api/v1/media/settings','/ui/api/v1/media/activity','/api/v8/ui/tasks?limit=20&offset=0','/api/v8/ui/dreams?limit=20&offset=0','/api/v8/shared/actions','/api/v8/tasks/board','/api/v8/shared/view?limit=50','/api/v8/health/chains']
   paths += [f'/api/list?slot=S{i:02}&limit=25&offset=0' for i in range(1,13)]
   paths += [f'/api/module?name={x}&limit=20&offset=0' for x in ['growth','continuity','lessons','domains','candidates','tombstones','env','vitals']]
   paths += [f'/api/reviews?state={x}&limit={n}&offset=0' for x in ['pending','accepted','rejected','deferred'] for n in [20,25,30]]
   paths += [f'/api/turn?limit={n}' for n in [20,25,30,50]]
   paths += [f'/ui/api/v1/media/items?limit={n}&offset=0&sort={s}' for n in [20,24,30,36,40,50,60] for s in ['newest','latest','oldest']]
   paths += ['/api/turn?limit=25&offset=0','/api/search?q=fixture&limit=25&offset=0','/ui/api/v1/media/items','/api/v8/shared/view?limit=50&slot=S01']
   snapshots={}
   for path in paths:
    try:
     with opener.open(ui+path,timeout=5) as r:snapshots[path]=(r.status,r.headers.get('Content-Type','application/json'),r.read())
    except urllib.error.HTTPError as e:snapshots[path]=(e.code,e.headers.get('Content-Type','application/json'),e.read())
   assets={}
   for name in ['index.html']+[p.name for p in (ROOT/'dashboard').glob('*.css')]+[p.name for p in (ROOT/'dashboard').glob('*.js')]+['assets/lampkin-peek.png','assets/memory-orb.png','assets/approved-reference.jpg']:
    p=ROOT/'dashboard'/name;assets['/'+name]=(mimetypes.guess_type(str(p))[0] or 'application/octet-stream',p.read_bytes())
   assets['/']=assets['/index.html']
   shots=ROOT/'previews-J4';shots.mkdir(exist_ok=True)
   routes=['/home','/overview','/libraries','/search','/reviews/pending','/audit','/modules','/status','/dreams','/tasks','/relations','/skins','/night','/photos']+[f'/library/S{i:02}' for i in range(1,13)]
   with sync_playwright() as p:
    b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
    for width,height in [(320,700),(390,844),(430,932),(1280,900)]:
     page=b.new_page(viewport={'width':width,'height':height},device_scale_factor=1,reduced_motion='reduce');page.set_default_timeout(4000);errors=[];missing=[]
     page.on('pageerror',lambda e:errors.append(str(e)))
     fixtures={k:{'status':v[0],'mime':v[1],'body':v[2].decode('utf-8',errors='replace')} for k,v in snapshots.items()}
     html=assets['/'][1].decode()
     html=re.sub(r'<link rel="stylesheet" href="([^"]+)"\s*/?>',lambda m:'<style>'+assets['/'+m.group(1)][1].decode()+'</style>',html)
     def inlinescript(m):
      js=assets['/'+m.group(1)][1].decode()
      for name in ['assets/lampkin-peek.png','assets/memory-orb.png','assets/approved-reference.jpg']:
       mime,raw=assets['/'+name];js=js.replace(name,'data:'+mime+';base64,'+base64.b64encode(raw).decode())
      return '<script>'+js.replace('</script','<\\/script')+'</script>'
     html=re.sub(r'<script src="([^"]+)"></script>',inlinescript,html)
     # A pure local document, no navigation or network. Replay captured GET data only.
     setup="""<script>window.__missing=[];const fixtures=FIXTURES;window.fetch=async(url,opt={})=>{const key=String(url).replace(/^blank/,'');if((opt.method||'GET')!=='GET')return new Response(JSON.stringify({error:'snapshot read only'}),{status:405});const v=fixtures[key];if(!v){window.__missing.push(key);return new Response(JSON.stringify({error:'missing recorded fixture'}),{status:404})}return new Response(v.body,{status:v.status,headers:{'Content-Type':v.mime}})};</script>""".replace('FIXTURES',json.dumps(fixtures,ensure_ascii=True).replace('</','<\\/'))
     html=html.replace('<body>', '<body>'+setup,1)
     page.set_content(html,wait_until='load');page.locator('.hero').wait_for()
     for path in routes:
      if path!='/home':
       page.locator('#menuButton').click();page.locator(f'#sideDrawer [data-route="{path}"]').click();page.wait_for_function("r=>location.hash==='#'+r",arg=path)
      page.wait_for_function("document.querySelector('#screen').dataset.ready==='true'");page.wait_for_timeout(100)
      body=page.locator('#screen').inner_text();assert body.strip() and '页面暂不可用' not in body and '页面不存在' not in body and 'missing recorded fixture' not in body,(path,body[:300],missing)
      dims=page.evaluate('''()=>({w:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,main:document.querySelector('#screen').clientWidth,mainScroll:document.querySelector('#screen').scrollWidth})''');assert dims['scroll']<=dims['w']+1 and dims['mainScroll']<=dims['main']+1,(path,dims)
      if width in [390,1280] and path in ['/home','/libraries','/overview','/dreams','/tasks','/night','/photos','/relations','/status','/skins']:page.screenshot(path=str(shots/f'{width}-{path[1:]}.png'),full_page=False)
      print(f'PASS snapshot {width} {path}',flush=True)
     # Use actual controls, not hash injection. All requests still replay captured GET snapshots.
     page.locator('#tabbar [data-route="/search"]').click();page.locator('#searchForm input[name=q]').fill('fixture');page.locator('#searchForm button[type=submit]').click();page.wait_for_function("location.hash.includes('q=fixture') && document.querySelector('#screen').dataset.ready==='true'")
     assert '检索结果' in page.locator('#screen').inner_text()
     page.locator('#tabbar [data-route="/home"]').click();page.locator('.hero').wait_for();page.locator('#everlight-shared-toggle').click();page.locator('#everlight-shared-body').wait_for(state='visible');page.wait_for_timeout(200);assert '读取失败' not in page.locator('#everlight-shared-result').inner_text();page.locator('#everlight-shared-toggle').click();page.locator('#everlight-shared-body').wait_for(state='hidden')
     page.locator('#menuButton').click();page.locator('#sideDrawer [data-route="/photos"]').click();page.locator('.ep-view-switch').wait_for();page.locator('[data-ep-action=view][data-value=albums]').click();page.wait_for_timeout(150);assert page.locator('[data-ep-action=view][data-value=albums]').evaluate("e=>e.classList.contains('active')")
     page.locator('[data-ep-action=view][data-value=timeline]').click();page.wait_for_timeout(150);assert page.locator('[data-ep-action=view][data-value=timeline]').evaluate("e=>e.classList.contains('active')")
     print(f'PASS snapshot {width} search, tabbar, reminder open/close, photo view switch',flush=True)
     assert not errors,errors
     missing=page.evaluate('window.__missing');assert not missing,missing
     page.close()
    b.close()
  finally:
   for pr in ps:pr.terminate()
   for pr in ps:pr.wait(timeout=10)
if __name__=='__main__':main()
