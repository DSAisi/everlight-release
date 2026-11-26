"""Offline real Chromium DOM regression; not live API or Web Crypto acceptance."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':390,'height':844});page.set_default_timeout(3000)
 page.set_content('<main id="screen"><section class="en-page"><p>PRIVATE TEST MARKER</p><button data-en-act="lock">上锁</button></section></main>')
 page.add_script_tag(path=str(ROOT/'dashboard/dialogs.js'));page.add_script_tag(path=str(ROOT/'dashboard/night.js'))
 for route in ['/night','/night/entry/one','/night/edit/one','/night/settings']:
  page.evaluate('r=>location.hash=r',route);page.evaluate("document.querySelector('#screen').innerHTML='<section class=\"en-page\"><p>PRIVATE TEST MARKER</p><button data-en-act=\"lock\">上锁</button></section>';window.lockCount=0")
  page.evaluate("window.onLock=()=>window.lockCount++;window.addEventListener('everlight:night-lock',onLock,{once:true})")
  page.locator('[data-en-act=lock]').click();assert 'PRIVATE TEST MARKER' not in page.locator('#screen').inner_text();assert page.evaluate('lockCount')==1;assert page.evaluate('location.hash')=='#/night';print('PASS lock DOM and event',route)
 page.wait_for_timeout(200);page.evaluate("()=>{EverlightDialog.confirm('synthetic test').then(x=>window.confirmed=x)}");assert page.locator('dialog').is_visible();page.evaluate('EverlightNight.lock()');page.wait_for_function('window.confirmed===false');assert not page.locator('dialog').count();print('PASS lock dismisses pending confirmation')
 assert not page.evaluate('isSecureContext');html=page.evaluate("EverlightNight.render('/night')");assert '夜契需要安全连接' in html and 'en-unlock' not in html;print('PASS insecure context shows actionable HTTPS notice')
 b.close()
