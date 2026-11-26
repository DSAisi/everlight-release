"""Chromium DOM + deterministic API fixtures. Actual HTTP chain is tested separately."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
root=Path(__file__).resolve().parents[2]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    page.set_content('<meta name="viewport" content="width=device-width, initial-scale=1"><main id="screen"></main>')
    page.evaluate('''()=>{
      window.calls=[];window.refreshes=0;window.failReminder=true;
      window.addEventListener('everlight:mainline-refresh',()=>refreshes++);
      window.state={core:[{key:'memory',available:true,enabled:true,effective:true},{key:'commitments',available:true,enabled:true,effective:true}],runtime:[],host_verified:false};
      window.everlightFetch=async(url,opts)=>{const body=JSON.parse(opts.body);calls.push({url,body});if(url.endsWith('/settings')){state.core[0].enabled=body.enabled;state.core[0].effective=body.enabled;state.core[1].effective=body.enabled;return new Response(JSON.stringify(state),{status:200});}if(failReminder){failReminder=false;throw Error('connection lost after send');}return new Response(JSON.stringify({id:'notice-fixture'}),{status:200});};
      window.helpers={api:async(url)=>url.endsWith('/settings')?state:{read_at:'2026-11-25T01:00:00Z',quality:{human:0,person:0,ai:0,system:0},items:[{id:'notice-fixture',kind:'remind_ai',created_at:'2026-11-25T01:00:00Z',state:'queued',active:true,connect_host_accepted:true}],continuity:{enabled:false}},heading:(a,b,c)=>`<h1>${b}</h1>`,panel:(a,b)=>`<section><h2>${a}</h2>${b}</section>`,esc:x=>String(x??''),linkButton:()=>'',empty:x=>x};
      window.show=async(path)=>document.querySelector('#screen').innerHTML=await EverlightMainline.render(path,helpers);
    }''')
    page.add_script_tag(content=(root/'mainline.js').read_text())
    page.evaluate("show('/controls')")
    memory=page.locator('[data-h6-key=memory]');commitments=page.locator('[data-h6-key=commitments]')
    memory.click();expect(memory).to_have_text('开启',timeout=3000)
    expect(commitments.locator('..').locator('small')).to_have_text('已设置，依赖未启用')
    memory.click();expect(memory).to_have_text('关闭',timeout=3000)
    assert page.evaluate('calls.map(x=>x.body.enabled)')==[False,True]
    print('PASS: settings readback updates both selected and dependent switch; second tap sends opposite value',flush=True)
    page.evaluate("show('/notifications')")
    form=page.locator('#mainline-remind');body=form.locator('textarea');button=form.locator('button')
    body.fill('test reminder');button.click();expect(form.locator('[role=status]')).to_contain_text('未确认')
    expect(body).to_have_value('test reminder');button.click();expect(form.locator('[role=status]')).to_contain_text('尚未证明 AI 收到')
    calls=page.evaluate('calls.filter(x=>x.url.endsWith("/actions")).map(x=>x.body)');assert len(calls)==2 and calls[0]['idempotency_key']==calls[1]['idempotency_key'],calls
    expect(body).to_have_value('');expect(page.locator('#mainline-notice-rows')).to_contain_text('notice-fixture');expect(page.locator('#mainline-notice-rows')).to_contain_text('宿主确认接收（非模型执行）')
    print('PASS: uncertain delivery retry reuses idempotency key; draft and exact notification receipt visible',flush=True)
    # A slow settings operation must not mutate another screen after navigation.
    page.evaluate("show('/controls')")
    page.evaluate("""()=>{window.savedFetch=everlightFetch;window.everlightFetch=async(...args)=>{await new Promise(r=>window.finishSettings=r);return savedFetch(...args)}}""")
    memory=page.locator('[data-h6-key=memory]');memory.click();expect(memory).to_be_disabled();expect(page.locator('[data-h6-key=commitments]')).to_be_disabled()
    page.evaluate("show('/notifications')");form=page.locator('#mainline-remind');form.locator('textarea').fill('another page draft');before=page.evaluate('refreshes');page.evaluate('finishSettings()');page.wait_for_timeout(300)
    expect(form.locator('textarea')).to_have_value('another page draft');assert page.evaluate('refreshes')==before
    print('PASS: in-flight settings serialisation and late result does not reset other page draft',flush=True)
    browser.close()
