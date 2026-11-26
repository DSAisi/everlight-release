"""Optional isolated Chromium acceptance; Python Playwright + Chromium required."""
import os, tempfile, subprocess, socket, time, urllib.request, json, pathlib, secrets
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent.parent

def port():
    with socket.socket() as s: s.bind(('127.0.0.1',0)); return s.getsockname()[1]

def main():
    with tempfile.TemporaryDirectory() as d:
        cp,up=port(),port(); core=f'http://127.0.0.1:{cp}'; ui=f'http://127.0.0.1:{up}'
        env=dict(os.environ,EVERLIGHT_BOUND_SCOPE='personal',EVERLIGHT_UI_SCOPE='personal',EVERLIGHT_CORE_ADAPTER='v8',EVERLIGHT_CORE_URL=core,EVERLIGHT_CORE_PORT=str(cp),PORT=str(up),EVERLIGHT_CORE_DB=d+'/core.sqlite',EVERLIGHT_UI_DB=d+'/ui.sqlite',EVERLIGHT_DREAM_AUTO='0',EVERLIGHT_REVIEW_WRITES='1')
        for k in ['CORE_TOKEN','UI_TOKEN','HOST_TOKEN','SHARED_HOST_TOKEN','HUMAN_DECISION_TOKEN','AI_DECISION_TOKEN','GOVERNANCE_ADMIN_TOKEN']: env['EVERLIGHT_'+k]=secrets.token_hex(32)
        procs=[subprocess.Popen(['node',p],cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL) for p in ['core/server.mjs','dashboard/server.mjs']]
        try:
            for url in [core+'/api/v8/contract',ui+'/']:
                for i in range(80):
                    try:
                        with urllib.request.urlopen(urllib.request.Request(url,headers={'Authorization':'Bearer '+env['EVERLIGHT_CORE_TOKEN']}),timeout=1) as r: assert r.status==200
                        break
                    except Exception: time.sleep(.1)
                else: raise RuntimeError('HTTP readiness failed')
            with sync_playwright() as p:
                b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox'])
                for width,height in [(1280,900),(390,844)]:
                    page=b.new_page(viewport={'width':width,'height':height});page.set_default_timeout(3500); errors=[]; page.on('pageerror',lambda e:errors.append(str(e)))
                    page.goto(ui);page.locator('#loginForm input').fill(env['EVERLIGHT_UI_TOKEN']);page.locator('#loginForm button').click();page.locator('.hero').wait_for();print(f'PASS {width} login/home',flush=True)
                    for route in ['/overview','/libraries','/search','/reviews/pending','/audit','/modules','/status','/dreams','/tasks','/relations','/skins','/night','/photos']+[f'/library/S{i:02}' for i in range(1,13)]:
                        page.locator('#menuButton').click();page.locator(f'#sideDrawer [data-route="{route}"]').click();page.wait_for_function("r=>location.hash==='#'+r",arg=route);page.wait_for_timeout(250)
                        body=page.locator('#screen').inner_text();assert body.strip() and '页面暂不可用' not in body and '页面不存在' not in body, (route,body[:300]);print(f'PASS {width} navigation {route}',flush=True)
                    assert not errors,errors
                    page.close()
                b.close()
        finally:
            for pr in procs: pr.terminate()
            for pr in procs: pr.wait(timeout=10)
if __name__=='__main__': main()
