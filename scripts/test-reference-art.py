#!/usr/bin/env python3
"""Read-only validation of approved original sheets, runtime cutouts and scene images.

Pixel hashes prove different pictures, not likeness, style or acting quality.
Pillow only reads regions for analysis; it never saves or edits any image.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import re
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
# These hashes were recorded from the previously approved review sheets, before
# this integration. A proof file cannot silently bless a regenerated replacement.
APPROVED_SHA256={
 'fio-work':'394c065a5a9b784cc187d13585c59d921841b26f7706b5072661a152991afbd1',
 'fio-date':'cef1cb90e4781824173cc3e50ea8f7d4372ab599cc925b0b14083098ece49a58',
 'fio-flight':'07f02515fddaac40868858c97c4cb98073b803b8b8417d9ce60dfb8cbd1b443c',
 'fio-strawhat':'a4b7ac16bbb564dc269c08d8176594373852c98cee32c02eaa901f6c091578ad',
 'fio-swim':'2297e84e2a973f4db1f6a2b540c6fa75a74efba25eb2ba3fca4fdc612bcac85c',
 'gina-morning':'b74c6f99a5c4ac7769ec0ab3ed0f415b66a99a035296914b625e68df029a5d26',
 'gina-date':'5b8adcc07fc4f95991313eea553845051d28c02fadd7c0facf80b0a9b07a1fc0',
 'gina-stage':'a62514bb8f3ab82bf7319b384bd7487c9b95be1a77e3fab19bfbaf5ac7ff952d',
 'porco-work':'eb00fd3b5f4d727fad2157da1a45934b180df17314cb59ed8b9bbf7fa9c4b5a9',
 'porco-flight':'ec50adae88dff3ff11a2f397221dbe4c1fd7e1691f388f456a93193540dcf51b',
 'porco-coat':'27985cb754a5b010235d6b8a83c34675d175a3941b1d29855913d6f43e905c9e',
 'porco-goggles-up':'5f060c595c1db124d84497c9eb960c9bba8c4ff2439c68df622ce0a8e523d88d',
}

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
        assert manifest.get('portraitStyleVersion')=='approved-pixels-v11',f"未启用approved-pixels-v11：{manifest.get('portraitStyleVersion')!r}"
        assert manifest.get('styleVersion')=='film-review-v10',f"尚未启用film-review-v10：{manifest.get('styleVersion')!r}"
        assert 'setting' not in manifest,'旧setting仍在active清单'
        assert all(str(source(v)).lower().endswith('.png') for v in portraits.values()),'人物仍引用SVG/非PNG'
        assert not any('character-setting' in str(source(v)) for v in portraits.values()),'人物仍使用旧设定图'
        return {'styleVersion':manifest['styleVersion'],'portraitStyleVersion':manifest['portraitStyleVersion'],'oldSettingActive':False}
    test('立绘启用approved-pixels-v11，背景CG保留film-review-v10',version_and_legacy)
    def slots():
        expected={f'{who}-{outfit}-{expr}' for who,outfits in OUTFITS.items() for outfit in outfits for expr in EXPRESSIONS}
        assert set(portraits)==expected,f'立绘slot集合不符；缺少{sorted(expected-set(portraits))}，多出{sorted(set(portraits)-expected)}'
        files={source(v) for v in portraits.values()};regions={region_key(v) for v in portraits.values()}
        assert len(files)==12,f'原始审阅sheet为{len(files)}，应为12'
        assert len(regions)==72,f'独立表情视区为{len(regions)}，应为72'
        for expr in EXPRESSIONS:assert portraits[f'gina-work-{expr}']==portraits[f'gina-morning-{expr}'],f'Gina work未别名morning：{expr}'
        for who,outfits in INDEPENDENT.items():
            entries=[portraits[f'{who}-{outfit}-{expr}'] for outfit in outfits for expr in EXPRESSIONS]
            assert len({region_key(v) for v in entries})==len(outfits)*6,f'{who}独立衣装/表情视区出现别名'
        return {'slots':len(expected),'uniqueApprovedSheets':len(files),'uniqueExpressionRegions':len(regions),'ginaWorkAliasesMorning':True}
    test('78立绘slot对应12张原始审阅sheet和72独立表情视区',slots)
    def original_sources():
        proof=json.loads((ROOT/'docs/APPROVED-PORTRAITS.json').read_text())
        assert proof.get('portraitStyleVersion')=='approved-pixels-v11','原像素凭据版本错误'
        records=proof.get('sources');assert isinstance(records,list) and len(records)==12,'凭据缺少12个原sheet'
        expected={f'assets/portrait-approved/{name}.png':sha for name,sha in APPROVED_SHA256.items()}
        evidence={v['src']:v for v in records};assert set(evidence)==set(expected),'凭据源文件集合不符'
        assert {source(v) for v in portraits.values()}==set(expected),'active立绘并非这12张原sheet'
        details=[]
        for src,sha in expected.items():
            raw=local_path(src).read_bytes();record=evidence[src];info=image_data({'src':src})
            assert digest(raw)==sha,f'{src}字节已变，非先前认可的原sheet'
            assert record.get('sha256')==sha and record.get('reviewSourceSha256')==sha,f'{src}凭据SHA与先前审阅不符'
            assert info['mode']=='RGB' and info['alphaRange'] is None,f'{src}被再处理为RGBA/遮罩图片'
            assert [info['width'],info['height']]==[1536,1024],f'{src}原sheet尺寸改变'
            review_name=record.get('reviewFileName');assert isinstance(review_name,str) and Path(review_name).name==review_name,f'{src}缺少原审阅文件名'
            review=ROOT.parent.parent/'art-preview-v8/portraits'/review_name
            if review.exists():assert review.read_bytes()==raw,f'{src}与本地已认可审阅文件不逐字节相同'
            details.append({'src':src,'sha256':sha,'originalRgbPixelsUnchanged':True,'localReviewAlsoCompared':review.exists()})
        return details
    test('12张RGB人物sheet与先前认可图逐字节SHA256相同',original_sources)
    def runtime_cutouts():
        number=re.compile(r'[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?')
        for slot,entry in portraits.items():
            info=validate_region(entry,slot);clip=entry.get('clipPath')
            assert isinstance(clip,str) and clip.strip().startswith('M') and clip.strip().endswith('Z'),f'{slot}没有闭合的绝对clipPath'
            rest=number.sub('',clip);assert not re.search(r'[^MLQCZ,\s]',rest),f'{slot}clipPath有未支持/相对/非路径内容'
            coords=[float(v) for v in number.findall(clip)]
            assert len(coords)>=6 and len(coords)%2==0,f'{slot}clipPath坐标不成对'
            assert all(0<=v<=info['width'] for v in coords[::2]) and all(0<=v<=info['height'] for v in coords[1::2]),f'{slot}clipPath越出原sheet画布'
        renderer=(ROOT/'src/assets.js').read_text()
        assert 'clipPathUnits="userSpaceOnUse"' in renderer,'renderer未以原sheet绝对坐标裁边'
        assert '<clipPath' in renderer and 'clip-path="url(#' in renderer,'renderer缺少clip定义或image引用'
        assert 'value.clipPath' in renderer,'renderer没有使用清单中的实际轮廓'
        assert 'class="${escape(className)} art-viewport' in renderer,'原portrait布局class丢失'
        return {'validatedSlots':len(portraits),'absoluteClosedCutouts':len(portraits),'runtimeSvgOnly':True,'originalPngsNotMasked':True}
    test('78人物视区以运行时SVG绝对轮廓裁边，原RGB图不改色不抠图',runtime_cutouts)
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
    def environment_unchanged():
        proof=json.loads((ROOT/'docs/APPROVED-PORTRAITS.json').read_text())
        baseline=proof.get('unchanged',{}).get('baseline')
        assert isinstance(baseline,str) and baseline.startswith('55df303'),'缺少已发布v10背景CG基线'
        result=subprocess.run(['git','show',f'{baseline}:assets/manifest.json'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
        assert result.returncode==0,'无法读取背景CG基线'
        before=json.loads(result.stdout)
        for key in ['backgrounds','cgs','title']:assert manifest[key]==before[key],f'{key}本轮原值被改动'
        files={source(v) for v in before['backgrounds'].values()}|{source(v) for v in before['cgs'].values()}|{source(before['title'])}
        for src in files:
            old=subprocess.run(['git','show',f'{baseline}:{src}'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
            assert old.returncode==0 and old.stdout==local_path(src).read_bytes(),f'本轮不应改变背景/CG字节：{src}'
        return {'baseline':baseline,'manifestSectionsUnchanged':['backgrounds','cgs','title'],'sourceImagesByteIdentical':len(files)}
    test('本轮仅换立绘，v10的背景、CG和标题原值及图片字节未变',environment_unchanged)
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
    summary={'status':status,'passed':passed,'total':len(checks),'styleVersion':manifest.get('styleVersion'),'portraitSlots':len(portraits),'uniqueApprovedPortraitSheets':len({source(v) for v in portraits.values()}),'portraitStyleVersion':manifest.get('portraitStyleVersion'),'cgs':len(manifest.get('cgs',{})),'browserVerification':False,'checks':checks}
    rows='\n'.join(f"| {c['name']} | {'通过' if c['status']=='passed' else '失败'} | {c.get('error','')} |" for c in checks)
    cg_rows='\n'.join(f"| {c['id']} | {(c['beforeSha256'] or '新增')[:16]} | {c['afterSha256'][:16]} | {c['state']} |" for c in cg_info)
    report=f'''# 审阅美术与泳装剧情接入验收

执行：`python3 scripts/test-reference-art.py --baseline {args.baseline}`。时间：{datetime.now(timezone.utc).isoformat()}。结果：**{passed}/{len(checks)} 项通过，{status}**。

检查读取正式清单、六份剧情、PNG及声明视区，不修改图片。Gina work仅别名morning；12张原审阅sheet以固定SHA256和凭据双重核对，轮廓只在运行时裁切。区域像素SHA证明画面不同，不保证表情演技、脸型或电影风格。

| 检查 | 结果 | 未通过原因 |
|---|---|---|
{rows}

## CG保留与替换

保留图允许原版本标记不变；保留与替换按二进制比较，泳装CG为新增正式剧情图。

| CG | 基线SHA256前16位 | 当前SHA256前16位 | 状态 |
|---|---|---|---|
{cg_rows}

## 验证范围

11地点/33个16:9背景视区、12张原始RGB审阅sheet/78槽/72个SVG裁边表情视区、13张独立CG、指定六张CG字节保留与泳装剧情绑定。Pillow仅在内存读取区域进行像素分析，没有保存或修改图像。

此脚本不运行浏览器，也不将文件/哈希检查称为触控、版式或电影风格验收。真实浏览器验证由主代理单独报告。
'''
    (ROOT/'docs/REFERENCE-ART-QA.md').write_text(report)
    print(json.dumps(summary,ensure_ascii=False,indent=2),flush=True)
    return 1 if failed else 0

if __name__=='__main__':sys.exit(main())
