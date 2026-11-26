"""Offline Chromium DOM test of app modal behavior; no host writes."""
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent.parent
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 for w,h in [(320,700),(390,844),(430,932),(1280,900)]:
  page=b.new_page(viewport={'width':w,'height':h},reduced_motion='reduce');page.set_default_timeout(3000)
  page.set_content('<button id="opener">open</button>');page.add_style_tag(path=str(ROOT/'dashboard/mobile-app.css'));page.add_script_tag(path=str(ROOT/'dashboard/dialogs.js'))
  page.locator('#opener').focus();page.evaluate("()=>{window.result='pending';EverlightDialog.confirm('确认删除？').then(r=>window.result=r)}")
  d=page.locator('dialog');assert d.is_visible();assert d.locator('.el-dialog-cancel').evaluate('e=>document.activeElement===e');r=d.bounding_box();assert r['x']>=0 and r['x']+r['width']<=w
  d.locator('.el-dialog-cancel').click();page.wait_for_function('window.result===false');assert page.locator('#opener').evaluate('e=>document.activeElement===e')
  page.evaluate("()=>{window.result='pending';EverlightDialog.confirm('确认操作').then(r=>window.result=r)}");d.locator('.el-dialog-ok').click();page.wait_for_function('window.result===true')
  page.evaluate("()=>{window.result='pending';EverlightDialog.prompt('每隔多少分钟提醒 AI 核对进度？5–10080；输入 0 关闭','30').then(r=>window.result=r)}");d.locator('input').fill('45');
  if w==390:page.screenshot(path=str(ROOT/'previews-J4/390-dialog.png'))
  d.locator('.el-dialog-ok').click();page.wait_for_function("window.result==='45'")
  page.evaluate("()=>{window.result='pending';EverlightDialog.prompt('原因').then(r=>window.result=r)}");page.keyboard.press('Escape');page.wait_for_function('window.result===null');assert not d.count()
  page.evaluate("()=>{window.result='pending';EverlightDialog.confirm('确认操作').then(r=>window.result=r)}");page.evaluate("location.hash='new'");page.wait_for_function('window.result===false')
  print(f'PASS {w} confirm/cancel, input, Escape, route change, focus, bounds',flush=True);page.close()
 b.close()
