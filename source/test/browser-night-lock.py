"""Chromium Web Crypto + actual UI controls; API responses are explicit fixtures, not live server."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':390,'height':844});page.set_default_timeout(6000)
 page.route('https://everlight.test/**',lambda r:r.fulfill(status=200,content_type='text/html',body='<main id="screen"></main>'))
 page.goto('https://everlight.test/#/night');assert page.evaluate('isSecureContext && !!crypto.subtle')
 page.add_script_tag(path=str(ROOT/'dashboard/dialogs.js'))
 page.add_script_tag(content='''window.fixture={configured:false}; window.entries=[];window.pauseEntries=false;window.fetch=async (url,o={})=>{let data={}; if(url.endsWith('/status'))data=fixture;else if(url.endsWith('/setup')){fixture={configured:true,...JSON.parse(o.body)};data={ok:true}}else if(url.endsWith('/entries')){if(o.method==='POST'){entries.push({id:'one',revision:1,createdAt:new Date().toISOString(),envelope:JSON.parse(o.body).envelope});data={ok:true}}else {if(pauseEntries)await new Promise(r=>window.releaseEntries=r);data={items:entries}}}return {ok:true,json:async()=>data}};let seq=0;window.draw=async()=>{let n=++seq;let html=await EverlightNight.render(location.hash.slice(1));if(n===seq)document.querySelector('#screen').innerHTML=html};window.addEventListener('hashchange',draw);window.addEventListener('everlight:night-lock',draw);''')
 page.add_script_tag(path=str(ROOT/'dashboard/night.js'));page.evaluate('draw()')
 page.locator('[name=password]').fill('test-password-123');page.locator('[name=repeat]').fill('test-password-123');page.locator('[name=adult]').check();page.locator('#en-setup button').click();page.locator('[data-en-act=lock]').wait_for()
 page.locator('[data-route="/night/new"]').click();page.evaluate("location.hash='/night/new'") # isolated navigation fixture
 page.locator('[name=title]').fill('LOCK TEST ONLY');page.locator('[name=note]').fill('synthetic marker');page.locator('#en-entry button').click();page.get_by_text('LOCK TEST ONLY').wait_for();assert page.evaluate("!JSON.stringify(entries).includes('LOCK TEST ONLY')")
 page.evaluate("location.hash='/night'");page.get_by_text('LOCK TEST ONLY').wait_for();page.locator('[data-en-act=lock]').click();assert 'LOCK TEST ONLY' not in page.locator('#screen').inner_text();page.locator('#en-unlock').wait_for();print('PASS same-route lock removes plaintext and renders unlock',flush=True)
 page.locator('[name=password]').fill('test-password-123');page.locator('#en-unlock button').click();page.get_by_text('LOCK TEST ONLY').wait_for()
 page.evaluate("window.pauseEntries=true;window.pending=EverlightNight.render('/night/list');");page.wait_for_function('typeof releaseEntries === "function"');page.evaluate("EverlightNight.lock();pauseEntries=false;releaseEntries()")
 html=page.evaluate('window.pending');assert 'LOCK TEST ONLY' not in html;assert 'en-unlock' in html;print('PASS in-flight render after lock cannot redisplay plaintext',flush=True)
 page.locator('#en-unlock').wait_for();page.locator('[name=password]').fill('wrong-password');page.locator('#en-unlock button').click();page.locator('dialog').wait_for();assert '密码错误' in page.locator('dialog').inner_text();page.locator('.el-dialog-ok').click();assert page.locator('#en-unlock').is_visible();print('PASS wrong password shows in-app dialog, remains locked',flush=True)
 page.close();b.close()
