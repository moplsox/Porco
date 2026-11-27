#!/usr/bin/env python3
"""Read-only validation of reviewed image files and atlas regions.

Pixel hashes prove different pictures, not likeness, style or acting quality.
Pillow only reads regions for analysis; it never saves or edits any image.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
EXPRESSIONS=('neutral','smile','serious','sad','surprise','tired')
OUTFITS={'fio':('work','date','flight','strawhat','swim'),'gina':('morning','work','date','stage'),'porco':('work','flight','coat','goggles-up')}
INDEPENDENT={who:tuple(o for o in outfits if not (who=='gina' and o=='work')) for who,outfits in OUTFITS.items()}
LOCATIONS=('cove','sea','hotel','hangar','market','post','lighthouse','garden','ferry','kitchen','dock')
PRESERVED={'yellow-quilt','dinner-fio','last-boat','storm','kitchen','key'}
REPLACED={'letter','silence','dock','mailbag','first-flight','garden'}
CG_IDS=PRESERVED|REPLACED|{'fio-swimming'}
def digest(data):return hashlib.sha256(data).hexdigest()
def source(entry):return entry if isinstance(entry,str) else entry.get('src')
def region_key(entry):return json.dumps(entry,sort_keys=True,separators=(',',':'))

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--baseline',default='5722c7a7e1a4418f526ebb3b3db268bee288acd7',help='Git revision whose selected six CGs must stay byte-identical')
    args=parser.parse_args();checks=[];image_info={};cg_info=[]
    try:
        manifest=json.loads((ROOT/'assets/manifest.json').read_text())
        scenes=[s for name in ['common','fio','gina','quests','endings','port'] for s in json.loads((ROOT/f'data/{name}.json').read_text())]
    except Exception as exc:
        print('FAIL 无法读取正式清单或剧情：'+str(exc));return 1
    portraits=manifest.get('portraits',{});backgrounds=manifest.get('backgrounds',{});by_id={s['id']:s for s in scenes}
    def test(name,fn):
        try:
            detail=fn();checks.append({'name':name,'status':'passed','detail':detail});print('PASS '+name,flush=True)
        except Exception as exc:
            checks.append({'name':name,'status':'failed','error':str(exc)});print('FAIL '+name+' · '+str(exc),flush=True)
    def local_path(src):
        assert isinstance(src,str) and src,'资源路径为空或无效'
        p=(ROOT/src).resolve();assert p.is_relative_to(ROOT),f'资源越出项目目录：{src}'
        assert p.is_file(),f'资源文件缺失：{src}'
        return p
    def image_data(entry):
        src=source(entry)
        if src in image_info:return image_info[src]
        p=local_path(src);raw=p.read_bytes()
        with Image.open(p) as im:
            assert im.format=='PNG',f'不是实际PNG：{src} ({im.format})'
            im.verify()
        with Image.open(p) as im:
            alpha=im.getchannel('A').getextrema() if 'A' in im.getbands() else None
            record={'src':src,'width':im.width,'height':im.height,'mode':im.mode,'alphaRange':list(alpha) if alpha else None,'sha256':digest(raw),'bytes':len(raw)}
        image_info[src]=record;return record
    def validate_region(entry,label,aspect=None):
        assert isinstance(entry,dict),f'{label}尚未使用独立视区'
        info=image_data(entry);region=entry.get('region');canvas=entry.get('canvas')
        assert isinstance(region,list) and len(region)==4,f'{label}缺少region'
        assert isinstance(canvas,list) and len(canvas)==2,f'{label}缺少canvas'
        assert all(isinstance(n,int) and not isinstance(n,bool) for n in region+canvas),f'{label}矩形不是整数'
        assert canvas==[info['width'],info['height']],f'{label}声明画布与实际PNG不符'
        x,y,w,h=region
        assert x>=0 and y>=0 and w>0 and h>0 and x+w<=canvas[0] and y+h<=canvas[1],f'{label}视区越界：{region}'
        if aspect:assert w*aspect[1]==h*aspect[0],f'{label}不是{aspect[0]}:{aspect[1]}视区'
        return info
    def version_and_legacy():
        assert manifest.get('styleVersion')=='film-review-v10',f"尚未启用film-review-v10：{manifest.get('styleVersion')!r}"
        assert 'setting' not in manifest,'旧setting仍在active清单'
        assert all(str(source(v)).lower().endswith('.png') for v in portraits.values()),'人物仍引用SVG/非PNG'
        assert not any('character-setting' in str(source(v)) for v in portraits.values()),'人物仍使用旧设定图'
        return {'styleVersion':manifest['styleVersion'],'oldSettingActive':False}
    test('启用film-review-v10，旧人物设定图退出active清单',version_and_legacy)
    def slots():
        expected={f'{who}-{outfit}-{expr}' for who,outfits in OUTFITS.items() for outfit in outfits for expr in EXPRESSIONS}
        assert set(portraits)==expected,f'立绘slot集合不符；缺少{sorted(expected-set(portraits))}，多出{sorted(set(portraits)-expected)}'
        files={source(v) for v in portraits.values()};regions={region_key(v) for v in portraits.values()}
        assert len(files)==12,f'独立透明atlas为{len(files)}，应为12'
        assert len(regions)==72,f'独立表情视区为{len(regions)}，应为72'
        for expr in EXPRESSIONS:assert portraits[f'gina-work-{expr}']==portraits[f'gina-morning-{expr}'],f'Gina work未别名morning：{expr}'
        for who,outfits in INDEPENDENT.items():
            entries=[portraits[f'{who}-{outfit}-{expr}'] for outfit in outfits for expr in EXPRESSIONS]
            assert len({region_key(v) for v in entries})==len(outfits)*6,f'{who}独立衣装/表情视区出现别名'
        return {'slots':len(expected),'uniqueAtlases':len(files),'uniqueExpressionRegions':len(regions),'ginaWorkAliasesMorning':True}
    test('78立绘slot对应12透明atlas和72独立表情视区',slots)
    def transparency():
        for slot,entry in portraits.items():
            info=validate_region(entry,slot)
            assert info['mode']=='RGBA',f"{slot}不是RGBA：{info['mode']}"
            assert info['alphaRange'][0]==0 and info['alphaRange'][1]>0,f'{slot}缺少透明或可见像素'
            x,y,w,h=entry['region']
            with Image.open(local_path(source(entry))) as im:alpha=im.getchannel('A').crop((x,y,x+w,y+h)).getextrema()
            assert alpha[0]==0 and alpha[1]>0,f'{slot}自身视区没有透明边缘或人物'
        return {'validatedSlots':len(portraits),'allRGBA':True,'allRegionsVisibleAndTransparent':True}
    test('人物PNG与每个视区合法、可见并保留透明边缘',transparency)
    def expressions():
        groups=[]
        for who,outfits in INDEPENDENT.items():
            for outfit in outfits:
                entries=[portraits[f'{who}-{outfit}-{expr}'] for expr in EXPRESSIONS];hashes=[]
                for entry in entries:
                    validate_region(entry,f'{who}-{outfit}');x,y,w,h=entry['region']
                    with Image.open(local_path(source(entry))) as im:hashes.append(digest(im.crop((x,y,x+w,y+h)).tobytes()))
                assert len(set(hashes))==6,f'{who}-{outfit}六表情视区像素完全相同'
                groups.append({'character':who,'outfit':outfit,'expressions':6,'distinctRegionPixelHashes':6})
        return groups
    test('十二套独立衣装各有六个不同像素的表情区域',expressions)
    def background_regions():
        expected={loc for loc in LOCATIONS}|{f'{loc}-{v}' for loc in LOCATIONS for v in ('day','night','rain')}
        assert set(backgrounds)==expected,f'背景槽不完整：{sorted(expected-set(backgrounds))}'
        files={source(v) for v in backgrounds.values()};regions={region_key(v) for v in backgrounds.values()}
        assert len(files)==11 and len(regions)==33,f'背景应11board/33区域，实际{len(files)}/{len(regions)}'
        for loc in LOCATIONS:
            assert backgrounds[loc]==backgrounds[f'{loc}-day'],f'{loc}默认未映射白天'
            for variant in ('day','night','rain'):
                label=f'{loc}-{variant}';entry=backgrounds[label];validate_region(entry,label,(16,9))
                x,y,w,h=entry['region'];cw,ch=entry['canvas']
                assert not (x>=cw/2 and y>=ch/2),f'{label}误用D人物测试格'
                assert (x+w<=cw/2 or x>=cw/2) and (y+h<=ch/2 or y>=ch/2),f'{label}跨格/跨边框'
                assert y%512>=50 or x%768>=50,f'{label}可能包含左上角审阅标签'
        assert manifest.get('title')==backgrounds['cove-day'],'标题未采用红飞机海湾白天'
        return {'slots':len(backgrounds),'locations':len(LOCATIONS),'uniqueBoards':len(files),'independent16by9Regions':len(regions),'title':'cove-day'}
    test('十一地点33个16:9背景视区排除审阅标签与D测试格',background_regions)
    def scene_outfits():
        mappings=0;lines=0;names={'菲尔':'fio','吉娜':'gina','波鲁克':'porco'}
        for scene in scenes:
            override=scene.get('portraitOutfits',{})
            for who,outfit in override.items():
                assert who in OUTFITS,f"{scene['id']}未知人物{who}"
                for expr in EXPRESSIONS:assert f'{who}-{outfit}-{expr}' in portraits,f"{scene['id']}缺少{who}-{outfit}-{expr}"
                mappings+=1
            for line in scene['lines']:
                who=names.get(line.get('speaker'))
                if not who:continue
                default='morning' if who=='gina' else 'work'
                if who=='porco':default='flight' if scene.get('location') in ['sea','lighthouse'] else 'goggles-up' if scene.get('location')=='cove' else 'work'
                outfit=override.get(who) or line.get('outfit') or default;expr=line.get('expression','neutral');key=f'{who}-{outfit}-{expr}'
                assert key in portraits,f"{scene['id']}对白无法解析立绘{key}"
                local_path(source(portraits[key]));lines+=1
        return {'scenes':len(scenes),'explicitOutfitMappings':mappings,'resolvedCharacterLines':lines}
    test('所有剧情衣装映射与对白表情均能解析资源',scene_outfits)
    def cgs_and_preservation():
        cgs=manifest.get('cgs',{});assert set(cgs)==CG_IDS,f'CG集合不符：{sorted(cgs)}'
        assert len({source(v) for v in cgs.values()})==13,'13个CG未对应13个独立文件'
        baseline_manifest=subprocess.run(['git','show',f'{args.baseline}:assets/manifest.json'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
        assert baseline_manifest.returncode==0,f'无法读取{args.baseline}的正式美术清单'
        baseline_cgs=json.loads(baseline_manifest.stdout)['cgs']
        for id in sorted(cgs):
            cg=cgs[id];src=source(cg);assert src.lower().endswith('.png'),f'{id}非PNG路径';info=image_data(cg)
            assert info['width']>info['height'] and info['width']>=1200 and info['height']>=650,f'{id}完整横向CG尺寸过小'
            assert cg.get('placeholder') is False,f'{id}仍标临时图'
            old_src=source(baseline_cgs[id]) if id in baseline_cgs else src
            result=subprocess.run(['git','show',f'{args.baseline}:{old_src}'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
            old_sha=digest(result.stdout) if result.returncode==0 else None
            if id in PRESERVED:
                assert result.returncode==0,f'{id}无法读取保留原图';assert result.stdout==local_path(src).read_bytes(),f'{id}应原样保留，实际已改变'
                state='preserved'
            elif id in REPLACED:
                assert result.returncode==0,f'{id}无法读取替换前原图';assert old_sha!=info['sha256'],f'{id}尚未替换'
                assert cg.get('styleVersion')=='film-review-v10',f'{id}缺少v10标记';state='replaced'
            else:
                assert id not in baseline_cgs,'新增泳装CG在基线已存在';assert cg.get('styleVersion')=='film-review-v10','泳装CG缺少v10标记';state='added'
            cg_info.append({'id':id,'src':src,'baselineSrc':old_src if id in baseline_cgs else None,'size':[info['width'],info['height']],'beforeSha256':old_sha,'afterSha256':info['sha256'],'state':state})
        return {'count':len(cgs),'baseline':args.baseline,'preserved':len(PRESERVED),'replaced':len(REPLACED),'added':1}
    test('13张正式CG：六张原样保留、六张替换、泳装新增',cgs_and_preservation)
    def important_bindings():
        expected={'common_d66_gap':'storm','common_d81_firstflight':'first-flight','gina_d04':'garden','gina_d01':'kitchen','gina_d02':'silence','gina_e10':'key','fio_d02':'dinner-fio','opening':'letter','common_d89_boat':'last-boat'}
        for id,cg in expected.items():assert id in by_id and by_id[id].get('cg')==cg,f'{id} CG绑定改变或丢失'
        bound={s.get('cg') for s in scenes if s.get('cg')};assert CG_IDS<=bound,f'相册存在未绑定正文CG：{sorted(CG_IDS-bound)}'
        swim=[s for s in scenes if s.get('cg')=='fio-swimming'];assert swim,'泳装CG没有正式剧情'
        swim_outfits=[s for s in scenes if s.get('portraitOutfits',{}).get('fio')=='swim' or any(l.get('speaker')=='菲尔' and l.get('outfit')=='swim' for l in s.get('lines',[]))]
        assert swim_outfits,'泳装立绘没有正式对白绑定'
        assert 'common_d66_gap' in manifest['cgs']['storm'].get('unlock',''),'storm解锁场景丢失'
        assert 'common_d81_firstflight' in manifest['cgs']['first-flight'].get('unlock',''),'first-flight解锁场景丢失'
        return {'retainedBindings':expected,'swimmingCGScenes':[s['id'] for s in swim],'swimmingPortraitScenes':[s['id'] for s in swim_outfits]}
    test('13张相册CG均绑定正文，泳装CG与立绘均有剧情展示',important_bindings)
    def privacy():
        active=json.dumps(manifest,ensure_ascii=False)
        assert '/workspace/' not in active and '/Users/' not in active,'正式清单泄露本地路径'
        assert not list(ROOT.rglob('*.pdf')),'原参考PDF进入项目'
        assert not any(str(source(v)).lower().endswith(('.pdf','.jpeg','.jpg')) for v in portraits.values()),'人物误用参考文件'
        return {'referencePdfsInProject':0,'privateReferencePathsInActiveManifest':0}
    test('参考PDF与本地参考路径没有进入正式资源',privacy)
    passed=sum(c['status']=='passed' for c in checks);failed=[c for c in checks if c['status']=='failed'];status='failed' if failed else 'passed'
    summary={'status':status,'passed':passed,'total':len(checks),'styleVersion':manifest.get('styleVersion'),'portraitSlots':len(portraits),'uniquePortraitAtlases':len({source(v) for v in portraits.values()}),'cgs':len(manifest.get('cgs',{})),'browserVerification':False,'checks':checks}
    rows='\n'.join(f"| {c['name']} | {'通过' if c['status']=='passed' else '失败'} | {c.get('error','')} |" for c in checks)
    cg_rows='\n'.join(f"| {c['id']} | {(c['beforeSha256'] or '新增')[:16]} | {c['afterSha256'][:16]} | {c['state']} |" for c in cg_info)
    report=f'''# 审阅美术与泳装剧情接入验收

执行：`python3 scripts/test-reference-art.py --baseline {args.baseline}`。时间：{datetime.now(timezone.utc).isoformat()}。结果：**{passed}/{len(checks)} 项通过，{status}**。

检查读取正式清单、六份剧情、PNG及声明视区，不修改图片。Gina work仅别名morning；区域像素SHA证明画面不同，不保证表情演技、脸型或电影风格。

| 检查 | 结果 | 未通过原因 |
|---|---|---|
{rows}

## CG保留与替换

保留图允许原版本标记不变；保留与替换按二进制比较，泳装CG为新增正式剧情图。

| CG | 基线SHA256前16位 | 当前SHA256前16位 | 状态 |
|---|---|---|---|
{cg_rows}

## 验证范围

11地点/33个16:9背景视区、12透明人物atlas/78槽、13张独立CG、指定六张CG字节保留与泳装剧情绑定。Pillow仅在内存读取区域进行透明度和像素分析，没有保存或修改图像。

此脚本不运行浏览器，也不将文件/哈希检查称为触控、版式或电影风格验收。真实浏览器验证由主代理单独报告。
'''
    (ROOT/'docs/REFERENCE-ART-QA.md').write_text(report)
    print(json.dumps(summary,ensure_ascii=False,indent=2),flush=True)
    return 1 if failed else 0

if __name__=='__main__':sys.exit(main())
