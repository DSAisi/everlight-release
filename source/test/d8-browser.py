import sys,pathlib,json,urllib.request,urllib.error
from playwright.sync_api import sync_playwright
port,token,pid,mid=sys.argv[1:];root=pathlib.Path(__file__).resolve().parent.parent/'dashboard';base=f'http://127.0.0.1:{port}'
def bridge(u):
 from urllib.parse import urlsplit
 x=urlsplit(u);route=x.path.removeprefix('/everlight3')+('?' +x.query if x.query else '')
 try:
  with urllib.request.urlopen(urllib.request.Request(base+route,headers={'Authorization':'Bearer '+token}),timeout=8) as r:return {'status':r.status,'body':r.read().decode()}
 except urllib.error.HTTPError as e:return {'status':e.code,'body':e.read().decode()}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox']);page=b.new_page(viewport={'width':390,'height':844});page.set_default_timeout(5000);page.expose_function('bridge',bridge);errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content('<base href="'+base+'/everlight3/"><style>'+(root/'relations-panel.css').read_text()+'</style><main id="main"></main><script>window.fetch=async(u)=>{const r=await bridge(String(u));return new Response(r.body,{status:r.status,headers:{"Content-Type":"application/json"}})};</script><script>'+(root/'relations-panel.js').read_text()+'</script><script>document.querySelector("main").innerHTML=EverlightRelations.page();EverlightRelations.mount();</script>')
 page.get_by_role('button',name='D8乙',exact=True).click();page.get_by_text('D8昵称',exact=False).first.wait_for();page.locator('#el-person-memories a[href="#/memory/S07/'+mid+'"]').wait_for();assert page.locator('#el-relations-detail a[href="#/memory/S07/'+mid+'"]').count()==1
 page.locator('#el-person-filter').fill('D8昵称');assert page.locator('#el-person-list button').count()==1
 assert page.evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth+1');assert not errors,errors
 print('PASS 390px graph, confirmed nickname search, person click, S07 and linked memory href, prefix URL via explicit test bridge');b.close()
