#!/usr/bin/env python3
"""Repeatable file:// Chromium QA. Never starts a server or changes browser policy.

Use the installed Python Playwright package and /usr/bin/chromium. All HTTP(S)
requests are rejected. Game actions use visible DOM controls; state is compared
through the game's exported JSON, never by modifying private app variables.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import re
import sys
import tempfile
import traceback
from datetime import datetime, timezone

from playwright.sync_api import sync_playwright, expect, Error as PlaywrightError

ROOT = Path(__file__).resolve().parents[1]
DELIVERABLES = Path('/workspace/deliverables')
CHECKS = [
    '桌面 file:// 标题与背景图片加载',
    '开场第一句及第一次选择',
    '多槽存读档恢复当前对白和选择后回复',
    '真实导出与文件导入恢复完整存档',
    '重新载入后从继续航行恢复',
    '可见界面完成委托并走到周四、回收传话分支',
    '委托板、日历、设置、相册及账本入口',
    '手机竖屏与横屏切换保持日期和对白',
    '损坏 localStorage 仍可开局',
    '被禁用 localStorage 使用临时存档并提示',
    '应用运行无需 HTTP/HTTPS 且无 JavaScript 错误',
]

class PolicyBlocked(RuntimeError):
    pass

class QA:
    def __init__(self, target: Path):
        self.target = target.resolve()
        self.results = []
        self.network = []
        self.errors = []
        self.console_errors = []
        self.screenshots = []
        self.version = ''

    def record(self, name, status='passed', detail=''):
        self.results.append({'name':name, 'status':status, 'detail':detail})
        print(f'{status.upper()} {name}' + (f' · {detail}' if detail else ''), flush=True)

    def context(self, browser, mobile=False, init_script=None):
        ctx = browser.new_context(viewport={'width':390 if mobile else 1440, 'height':844 if mobile else 900},
                                  is_mobile=mobile, has_touch=mobile, device_scale_factor=1,
                                  accept_downloads=True)
        def block(route):
            self.network.append(route.request.url)
            route.abort('blockedbyclient')
        ctx.route(re.compile(r'^https?://', re.I), block)
        if init_script:
            ctx.add_init_script(init_script)
        page = ctx.new_page()
        page.set_default_timeout(12000)
        page.on('pageerror', lambda error:self.errors.append(str(error)))
        page.on('console', lambda msg:self.console_errors.append(msg.text) if msg.type=='error' else None)
        return ctx, page

    def navigate(self, page):
        try:
            page.goto(self.target.as_uri(), wait_until='load', timeout=60000)
        except PlaywrightError as exc:
            if 'ERR_BLOCKED_BY_ADMINISTRATOR' in str(exc):
                raise PolicyBlocked('Chromium 管理员策略拒绝 file:// 导航（net::ERR_BLOCKED_BY_ADMINISTRATOR）。') from exc
            raise
        expect(page.locator('[data-action="new"]')).to_be_visible(timeout=30000)

    def snap(self, page):
        # Read only rendered UI. Exported JSON provides the precise state check.
        return page.evaluate('''() => {
          const text=s=>document.querySelector(s)?.textContent?.replace(/\\s+/g,' ').trim()||'';
          return {day:text('.day-header'),scene:text('.scene-caption strong'),
            speaker:text('.speaker'),dialogue:text('#dialogue-text'),
            choices:[...document.querySelectorAll('.choices button')].map(x=>x.textContent.replace(/\\s+/g,' ').trim()),
            map:!!document.querySelector('.map-shell')};
        }''')

    def click(self, page, action):
        element = page.locator(f'[data-action="{action}"]').first
        expect(element).to_be_visible()
        expect(element).to_be_enabled()
        element.click()

    def close_panel(self, page):
        if page.locator('[data-action="close"]').count():
            self.click(page,'close')

    def instant_text(self, page):
        self.click(page,'panel:settings')
        speed=page.locator('input[data-setting="speed"]')
        speed.focus()
        page.keyboard.press('Home')
        page.keyboard.press('Tab')
        expect(page.locator('input[data-setting="speed"]')).to_have_value('0')
        self.close_panel(page)

    def screenshot(self, page, name):
        DELIVERABLES.mkdir(parents=True,exist_ok=True)
        target=DELIVERABLES/name
        page.screenshot(path=str(target),full_page=True,animations='disabled')
        self.screenshots.append(str(target))

    def assert_image(self, page, selector):
        result=page.evaluate('''async selector=>{
          const element=document.querySelector(selector);
          if(!element)return {ok:false,error:'missing element'};
          const css=getComputedStyle(element).backgroundImage;
          const m=css.match(/^url\\(["']?(.*?)["']?\\)$/);
          if(!m)return {ok:false,error:'missing CSS image'};
          const image=new Image();image.src=m[1];
          try{await image.decode()}catch(e){return {ok:false,error:String(e)}};
          return {ok:image.naturalWidth>0,width:image.naturalWidth,height:image.naturalHeight,
            scheme:m[1].split(':',1)[0]};
        }''',selector)
        assert result.get('ok'),f'背景解码失败：{result}'
        assert result['scheme'] in ['data','blob','file'],result
        return result

    def advance(self, page, mobile=False):
        assert page.locator('.dialogue-box').count(),'当前没有可推进的对白'
        if mobile:
            page.locator('#dialogue-text').tap()
        else:
            page.keyboard.press('Space')

    def to_first_choice(self,page):
        for _ in range(250):
            choices=page.locator('.choices button:enabled')
            if choices.count():
                return choices
            assert page.locator('.dialogue-box').count(),'首个选择前提前退出对白'
            self.advance(page)
        raise AssertionError('250次推进后仍未出现第一组选项')

    def export(self,page,destination):
        self.click(page,'panel:saves')
        with page.expect_download(timeout=15000) as event:
            self.click(page,'export')
        download=event.value
        download.save_as(str(destination))
        payload=json.loads(destination.read_text())
        assert payload['format']=='adriatic-letters'
        state=payload['state']
        for key in ['sceneId','lineIndex','day','period','money','fuel','fioClose','fioTrust','ginaClose','ginaTrust','flags','promises']:
            assert key in state,f'导出缺少 {key}'
        self.close_panel(page)
        return payload

    def desktop(self,browser,tmp):
        ctx,page=self.context(browser)
        try:
            self.navigate(page)
            image=self.assert_image(page,'.title-art')
            self.screenshot(page,'title-desktop.png')
            self.record(CHECKS[0],detail=f'1440×900；背景 {image["width"]}×{image["height"]}')
            self.instant_text(page)
            self.click(page,'new')
            expect(page.locator('#dialogue-text')).to_be_visible()
            opening=json.loads((ROOT/'data/common.json').read_text())
            expected=next(s for s in opening if s['id']=='opening')['lines'][0]['text']
            expect(page.locator('#dialogue-text')).to_have_text(expected)
            self.assert_image(page,'.scene-bg')
            self.screenshot(page,'opening.png')
            choices=self.to_first_choice(page)
            choices.first.click()
            chosen=self.snap(page)
            assert chosen['dialogue']
            self.record(CHECKS[1],detail='从正式开场按可见对白推进并选择第一项')

            self.click(page,'panel:saves');self.click(page,'save:slot1');self.close_panel(page)
            self.advance(page)
            assert self.snap(page)!=chosen,'推进后对白没有变化'
            self.click(page,'panel:saves');self.click(page,'load:slot1')
            assert self.snap(page)==chosen,'手动槽位没有准确恢复回复及日期'
            self.click(page,'quicksave')
            self.advance(page);page.keyboard.press('l')
            assert self.snap(page)==chosen,'快速读档没有准确恢复'
            self.record(CHECKS[2])

            export_file=tmp/'ui-export.json'
            exported=self.export(page,export_file)
            before=self.snap(page)
            self.advance(page)
            assert self.snap(page)!=before
            self.click(page,'panel:saves')
            page.locator('#import-save').set_input_files(str(export_file))
            expect(page.locator('#import-save')).to_have_count(0)
            assert self.snap(page)==before,'导入后可见对白不一致'
            reexported=self.export(page,tmp/'ui-export-again.json')
            assert reexported['state']==exported['state'],'导出/导入未恢复完整游戏状态'
            self.record(CHECKS[3])

            page.reload(wait_until='load',timeout=60000)
            expect(page.locator('[data-action="continue"]')).to_be_enabled(timeout=30000)
            self.click(page,'continue')
            assert self.snap(page)==before,'重载继续的对白位置不一致'
            self.record(CHECKS[4])
            self.first_thursday(page)
            self.panels(page)
            assert not self.errors,self.errors
            assert not self.network,self.network
        finally:
            ctx.close()

    def first_thursday(self,page):
        message_chosen=False;feedback_seen=False;job_started=False;seen=[]
        for _ in range(900):
            current=self.snap(page)
            seen.append(current['dialogue'])
            if message_chosen and '6月4日' in current['day'] and any(x in current['dialogue'] for x in ['电话费','绘图挪到午后','六点早了']):
                feedback_seen=True
            choices=page.locator('.choices button:enabled')
            if choices.count():
                if '被风吹走的邮袋' in current['scene']:
                    target=choices.filter(has_text=re.compile('传话'))
                    assert target.count()==1,'邮袋传话选项不明确'
                    target.click();message_chosen=True
                else:
                    choices.first.click()
                continue
            if page.locator('.dialogue-box').count():
                self.advance(page);continue
            if page.locator('.map-shell').count():
                if '6月4日' in current['day']:
                    break
                if '6月2日' in current['day'] and not job_started:
                    self.click(page,'panel:jobs')
                    self.click(page,'prepare:job_01')
                    self.click(page,'job:job_01:standard')
                    job_started=True
                    continue
                self.click(page,'wait');continue
            raise AssertionError('推进至周四遇到未知界面：'+page.locator('body').inner_text()[:250])
        else:
            raise AssertionError('推进次数超过900，尚未进入周四地图')
        assert message_chosen,'没有实际选择邮袋传话路线'
        assert feedback_seen,'没有看到次日传话的工作/收据反馈'
        assert job_started,'没有实际接取委托'
        self.click(page,'panel:hangar')
        assert '委托结算' in page.locator('.modal-body').inner_text(),'委托尚未完成并结算'
        assert '净收入' in page.locator('.modal-body').inner_text()
        self.close_panel(page)
        self.record(CHECKS[5],detail='实际接取并结算job_01；周三选择传话；周四读到条件反馈')

    def panels(self,page):
        for name,selector in [('jobs','.job-grid'),('calendar','.calendar-grid'),('settings','input[data-setting="speed"]'),('gallery','.cg-grid'),('hangar','.ledger')]:
            self.click(page,'panel:'+name)
            expect(page.locator(selector).first).to_be_visible()
            if name=='calendar':assert page.locator('.cal-day').count()==90
            if name=='gallery':assert page.locator('.cg-card').count()==12
            self.close_panel(page)
        self.record(CHECKS[6])

    def mobile(self,browser):
        ctx,page=self.context(browser,mobile=True)
        try:
            self.navigate(page);self.instant_text(page);self.click(page,'new')
            before=self.snap(page)
            self.screenshot(page,'mobile.png')
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+2'),'竖屏横向溢出'
            page.set_viewport_size({'width':844,'height':390})
            assert self.snap(page)==before,'横屏切换改变日期或对白'
            page.set_viewport_size({'width':390,'height':844})
            assert self.snap(page)==before,'切回竖屏改变日期或对白'
            self.advance(page,mobile=True)
            assert self.snap(page)!=before,'触控推进无效'
            self.record(CHECKS[7],detail='390×844 → 844×390 → 390×844；触控推进')
        finally:ctx.close()

    def storage_cases(self,browser):
        corrupt='''for(const key of ['adriatic-meta','adriatic-settings','adriatic-auto','adriatic-quick']){try{localStorage.setItem(key,'{broken JSON')}catch(e){}}'''
        denied='''Object.defineProperty(window,'localStorage',{configurable:true,get(){throw new DOMException('QA blocked localStorage','SecurityError')}});'''
        for index,script in [(8,corrupt),(9,denied)]:
            ctx,page=self.context(browser,init_script=script)
            try:
                self.navigate(page);self.instant_text(page);self.click(page,'new')
                expect(page.locator('#dialogue-text')).to_be_visible()
                if index==9:
                    self.click(page,'panel:saves')
                    assert re.search('临时|存储|导出',page.locator('.modal-body').inner_text()),'禁用存储时缺少用户可见提示'
                    self.close_panel(page)
                    before=self.snap(page);self.click(page,'quicksave');self.advance(page);page.keyboard.press('l');assert self.snap(page)==before,'临时存档在当前页面不能恢复'
                self.record(CHECKS[index])
            finally:ctx.close()

    def write_report(self,status,error=''):
        existing={r['name'] for r in self.results}
        for name in CHECKS:
            if name not in existing:self.results.append({'name':name,'status':'skipped','detail':'文件导航被环境策略阻断。' if status=='blocked' else '前置检查未完成。'})
        rows='\n'.join(f'| {r["name"]} | {r["status"]} | {r["detail"].replace("|","/")} |' for r in self.results)
        screenshots='\n'.join(f'- [{Path(p).name}]({p})' for p in self.screenshots) or '没有生成游戏截图：应用尚未在真实浏览器中载入，避免把错误页当作游戏画面。'
        report=f'''# 单文件浏览器验收\n\n执行：`python scripts/test-standalone.py`。目标：`{self.target.as_uri()}`。\n\n时间：{datetime.now(timezone.utc).isoformat()}；Chromium：{self.version or '未启动'}；最终状态：**{status}**。\n\n{error}\n\n使用环境现有 Python Playwright 与 `/usr/bin/chromium` 的 headless 模式，没有启动服务器、安装依赖、修改权限或绕过管理员策略。所有 HTTP/HTTPS 请求在浏览器上下文拦截并拒绝。当前拦截记录 {len(self.network)} 条；JavaScript pageerror {len(self.errors)} 条。导航被阻断时，这些零值不能证明应用运行正常。\n\n| 检查 | 结果 | 说明 |\n|---|---|---|\n{rows}\n\n## 截图\n\n{screenshots}\n\n## 覆盖边界\n\n脚本通过可见DOM操作标题、对白、选项、存读档、导出/导入、日历、委托与设置。存档完整性通过用户实际导出的JSON比较，脚本不改写隐藏游戏状态。损坏与禁用 localStorage 仅用于对应故障场景。\n\nNode VM 的 classic script 执行与静态单文件检查由 `scripts/test-standalone.mjs` 另外执行；VM 不是真实浏览器，不能证明图像解码、触控、音频、下载权限或 file:// 浏览器策略已经通过。这里的 Chromium 结果也不替代 Safari、iPhone 真机及听觉检查。\n'''
        (ROOT/'docs/STANDALONE-QA.md').write_text(report)
        print(json.dumps({'status':status,'target':self.target.as_uri(),'checks':self.results,'blockedHttpRequests':self.network,'pageErrors':self.errors,'screenshots':self.screenshots},ensure_ascii=False,indent=2),flush=True)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--file',type=Path,default=ROOT/'index.html')
    args=parser.parse_args()
    qa=QA(args.file)
    if not qa.target.is_file():
        qa.write_report('failed','目标文件不存在。');return 1
    try:
        with tempfile.TemporaryDirectory(prefix='adriatic-standalone-ui-') as temporary,sync_playwright() as p:
            browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
            qa.version=browser.version
            try:
                qa.desktop(browser,Path(temporary));qa.mobile(browser);qa.storage_cases(browser)
                assert not qa.errors,qa.errors
                assert not qa.network,qa.network
                qa.record(CHECKS[10],detail='HTTP(S)全部拒绝时仍完成上述流程，未产生外部请求')
            finally:browser.close()
        qa.write_report('passed');return 0
    except PolicyBlocked as exc:
        qa.record(CHECKS[0],'blocked',str(exc));qa.write_report('blocked',str(exc));return 2
    except Exception as exc:
        qa.record('执行异常','failed',str(exc));qa.write_report('failed',str(exc));traceback.print_exc();return 1

if __name__=='__main__':
    sys.exit(main())
