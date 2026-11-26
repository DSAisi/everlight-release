import json, os, pathlib, subprocess, tempfile, time
from playwright.sync_api import sync_playwright
root=pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory() as tmp:
 p=pathlib.Path(tmp); cfg=json.loads((root/'config.example.json').read_text()); cfg.update(input='input.jsonl',workDir='work',transport={'type':'mock'},calibrationRecords=2,chunkSize=2,contextOverlap=0)
 (p/'config.json').write_text(json.dumps(cfg)); source=p/'chat.jsonl'; source.write_text('\n'.join(json.dumps({'id':str(i),'actor':'human','content':'I like tea','timestamp':'2026-01-01T00:00:00Z'}) for i in range(4))+'\n')
 port='18765'; proc=subprocess.Popen(['node',str(root/'src/ui.mjs'),str(p/'config.json')],env={**os.environ,'CONVERTER_PORT':port},stdout=subprocess.PIPE,text=True)
 try:
  assert proc.stdout.readline().strip()==f'http://127.0.0.1:{port}'
  with sync_playwright() as pw:
   browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH','/usr/bin/chromium'),args=['--no-sandbox']); page=browser.new_page(viewport={'width':390,'height':844}); errors=[]; page.on('pageerror',lambda e:errors.append(str(e))); page.on('dialog',lambda d:d.dismiss()); page.goto(f'http://127.0.0.1:{port}')
   page.locator('#sourceFile').set_input_files(str(source)); page.locator('#upload').click(); page.wait_for_function("document.querySelector('#importStatus').textContent.includes('sha256')")
   print('PASS browser file upload',flush=True)
   for action in ['prepare','calibrate','approve-calibration','run','verify','merge']:
    page.locator('#reviewer').fill('browser-test'); page.locator('#note').fill('synthetic fixture only'); page.locator(f'button[data-a="{action}"]').last.click(); page.wait_for_function('a => {try {const s=JSON.parse(document.querySelector("#out").textContent);return !s.running && s.last?.action===a && s.last.exit!==null}catch{return false}}',arg=action,timeout=30000); s=json.loads(page.locator('#out').inner_text()); assert s['last']['exit']==0,s; print('PASS browser '+action,flush=True)
   page.locator('#loadReview').click(); page.wait_for_function("document.querySelector('#reviews').textContent.includes('共')"); page.locator('#historyLoad').click(); page.wait_for_function("document.querySelector('#history').textContent.includes('共')"); assert not errors,errors; print('PASS review/history pages and no JS errors',flush=True); browser.close()
 finally:
  proc.terminate(); proc.wait(timeout=5)
