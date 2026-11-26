from pathlib import Path
from playwright.sync_api import sync_playwright, expect
root=Path(__file__).resolve().parents[2]
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
    page=browser.new_page(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    page.set_content('<base href="http://localhost/"><meta name="viewport" content="width=device-width, initial-scale=1"><main id="screen"></main>')
    page.add_style_tag(content=(root/'relations-panel.css').read_text())
    page.evaluate('''()=>{window.calls=[];const people=Array.from({length:24},(_,i)=>({id:'p'+i,label:'人物'+i,aliases:[],names:[]}));const edges=Array.from({length:10},(_,i)=>({id:'e'+i,from:'p0',to:'p'+(14+i),relation:'已确认关系',circle:'friend',sources:['source']}));window.everlightFetch=async(u)=>{const url=new URL(u);calls.push(url.pathname+url.search);let d;if(url.pathname.endsWith('live-revision'))d={revision:'fixture:1'};else if(url.pathname.endsWith('/graph'))d={people,edges,pending:[],name_pending:[]};else{const offset=Number(url.searchParams.get('offset'));d={items:Array.from({length:Math.min(20,45-offset)},(_,i)=>({library:'S07',memory_id:'r'+(i+offset),summary:'记忆'+(i+offset),status:'committed',recorded_at:'2025-01-01T00:00:00Z'})),has_more:offset+20<45,next_offset:offset+20<45?offset+20:null}}return new Response(JSON.stringify(d),{status:200})}}''')
    page.add_script_tag(content=(root/'relations-panel.js').read_text())
    page.evaluate("document.querySelector('#screen').innerHTML=EverlightRelations.page();EverlightRelations.mount()")
    expect(page.locator('#el-focus-label')).to_contain_text('10 位已确认关联人物')
    expect(page.locator('.el-graph-person')).to_have_count(9)
    expect(page.locator('.el-graph-person[aria-label="查看人物 人物14"]')).to_be_visible()
    page.locator('#el-neighbor-next').click();expect(page.locator('.el-graph-person')).to_have_count(3)
    page.locator('.el-graph-person[aria-label="查看人物 人物23"]').click();expect(page.locator('#el-relations-detail h3')).to_have_text('人物23')
    expect(page.locator('#el-focus-label')).to_contain_text('1 位已确认关联人物')
    print('PASS cross-directory edges, neighbor pages, node navigation')
    expect(page.locator('#el-memory-page')).to_have_text('第 1 页');page.locator('#el-memory-next').click();expect(page.locator('#el-memory-page')).to_have_text('第 2 页');expect(page.locator('.el-memory-card')).to_have_count(20)
    page.locator('#el-memory-next').click();expect(page.locator('#el-memory-page')).to_have_text('第 3 页');expect(page.locator('.el-memory-card')).to_have_count(5);expect(page.locator('#el-memory-next')).to_be_disabled()
    page.locator('#el-memory-prev').click();expect(page.locator('#el-memory-page')).to_have_text('第 2 页')
    assert not any('trigger-recall' in x for x in page.evaluate('calls'))
    print('PASS person memory pagination and no recall side effect')
    browser.close()
