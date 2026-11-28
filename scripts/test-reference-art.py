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
import math
import re
from pathlib import Path
import subprocess
import sys
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
EXPRESSIONS=('neutral','smile','serious','sad','surprise','tired')
OUTFITS={'fio':('work','date','flight','strawhat','swim','swim-dry','swim-wet'),'gina':('morning','work','date','stage'),'porco':('work','flight','coat','goggles-up')}
INDEPENDENT={who:tuple(o for o in outfits if not (who=='gina' and o=='work') and not (who=='fio' and o=='swim')) for who,outfits in OUTFITS.items()}
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
        assert manifest.get('portraitStyleVersion')=='fullbody-parts-v12',f"未启用fullbody-parts-v12：{manifest.get('portraitStyleVersion')!r}"
        assert manifest.get('styleVersion')=='film-review-v10',f"尚未启用film-review-v10：{manifest.get('styleVersion')!r}"
        assert 'setting' not in manifest,'旧setting仍在active清单'
        assert all(str(source(v)).lower().endswith('.png') for v in portraits.values()),'人物仍引用SVG/非PNG'
        assert not any('character-setting' in str(source(v)) for v in portraits.values()),'人物仍使用旧设定图'
        return {'styleVersion':manifest['styleVersion'],'portraitStyleVersion':manifest['portraitStyleVersion'],'oldSettingActive':False}
    test('立绘启用fullbody-parts-v12，背景CG保留film-review-v10',version_and_legacy)
    def slots():
        expected={f'{who}-{outfit}-{expr}' for who,outfits in OUTFITS.items() for outfit in outfits for expr in EXPRESSIONS}
        assert set(portraits)==expected,f'立绘slot集合不符；缺少{sorted(expected-set(portraits))}，多出{sorted(set(portraits)-expected)}'
        files={source(v) for v in portraits.values()};regions={region_key(v) for v in portraits.values()}
        assert len(files)==13,f'独立全身基底PNG为{len(files)}，应为13'
        assert len(regions)==78,f'独立全身/表情组合为{len(regions)}，应为78'
        for expr in EXPRESSIONS:
            assert portraits[f'gina-work-{expr}']==portraits[f'gina-morning-{expr}'],f'Gina work未别名morning：{expr}'
            assert portraits[f'fio-swim-{expr}']==portraits[f'fio-swim-wet-{expr}'],f'旧swim未别名湿装：{expr}'
        for who,outfits in INDEPENDENT.items():
            entries=[portraits[f'{who}-{outfit}-{expr}'] for outfit in outfits for expr in EXPRESSIONS]
            assert len({region_key(v) for v in entries})==len(outfits)*6,f'{who}独立衣装/表情组合出现别名'
        return {'slots':len(expected),'uniqueBodySources':len(files),'independentBodyExpressionCombinations':len(regions),'ginaWorkAliasesMorning':True,'legacySwimAliasesWet':True}
    test('90立绘slot对应13套全身基底和78独立表情组合',slots)
    def original_sources():
        proof=json.loads((ROOT/'docs/APPROVED-PORTRAITS.json').read_text())
        assert proof.get('portraitStyleVersion')=='fullbody-parts-v12','全身分层凭据版本错误'
        records=proof.get('sources');assert isinstance(records,list) and len(records)==13,'凭据缺少13个独立PNG'
        evidence={v['src']:v for v in records};assert len(evidence)==13,'凭据路径重复'
        original={f'assets/portrait-approved/{name}.png':sha for name,sha in APPROVED_SHA256.items()}
        original['assets/portrait-approved/fio-swim-dry.png']='38f31074f629127e952996044d8b7f7e743d230e91583ac82ab2cb3fa4a4af5c'
        targeted=set()
        assert set(evidence)==set(original)|targeted,'凭据源文件集合不符'
        assert {source(v) for v in portraits.values()}==set(evidence),'active全身基底并非凭据中的13张PNG'
        details=[]
        for src,record in evidence.items():
            raw=local_path(src).read_bytes();info=image_data({'src':src});sha=digest(raw)
            assert re.fullmatch(r'[0-9a-f]{64}',record.get('sha256','')) and record['sha256']==sha,f'{src}凭据SHA与实际文件不符'
            assert info['width']>=1000 and info['height']>=700,f'{src}源图尺寸过小'
            if src in original:
                assert record.get('kind')=='approved-original',f'{src}原图类型错误'
                assert sha==original[src],f'{src}字节已变，非先前认可的原sheet'
                if 'reviewSourceSha256' in record:assert record['reviewSourceSha256']==sha,f'{src}原审阅SHA错误'
                assert info['mode']=='RGB' and info['alphaRange'] is None,f'{src}原RGB图经过透明化再处理'
                assert [info['width'],info['height']]==[1536,1024],f'{src}原sheet尺寸改变'
                review_name=record.get('reviewFileName')
                if review_name:
                    assert Path(review_name).name==review_name,f'{src}原审阅文件名不合法'
                    review=ROOT.parent.parent/'art-preview-v8/portraits'/review_name
                    if review.exists():assert review.read_bytes()==raw,f'{src}与本地已认可图不逐字节相同'
            else:
                assert record.get('kind')=='targeted-edit',f'{src}缺少明确局部修改标记'
            details.append({'src':src,'sha256':sha,'kind':record['kind']})
        assert sum(v['kind']=='approved-original' for v in records)==13
        assert sum(v['kind']=='targeted-edit' for v in records)==0
        return {'approvedOriginals':13,'restoredDrySwimOriginal':True,'targetedEdits':0,'sources':details}
    test('13张认可原图含旧草帽与恢复的蓝短裤干泳装有SHA凭据',original_sources)
    number=re.compile(r'[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?')
    def path_points(clip,canvas,label):
        assert isinstance(clip,str) and clip.strip().startswith('M') and clip.strip().endswith('Z'),f'{label}没有闭合绝对轮廓'
        assert not re.search(r'[^MLQCZ,\s]',number.sub('',clip)),f'{label}轮廓含非绝对路径内容'
        coords=[float(v) for v in number.findall(clip)];assert len(coords)>=6 and len(coords)%2==0,f'{label}轮廓坐标不成对'
        assert all(math.isfinite(v) for v in coords),f'{label}坐标非有限数'
        assert all(0<=v<=canvas[0] for v in coords[::2]) and all(0<=v<=canvas[1] for v in coords[1::2]),f'{label}轮廓越出PNG'
        return list(zip(coords[::2],coords[1::2]))
    def matrix(value,label):
        assert isinstance(value,str) and re.fullmatch(r'matrix\([\d+eE.,\s-]+\)',value),f'{label}不是SVG affine matrix'
        nums=[float(v) for v in number.findall(value)];assert len(nums)==6 and all(math.isfinite(v) for v in nums),f'{label}矩阵不合法'
        a,b,c,d,e,f=nums;assert abs(a*d-b*c)>1e-8,f'{label}矩阵将表情压成直线'
        return nums
    def runtime_cutouts():
        evidence={v['src'] for v in json.loads((ROOT/'docs/APPROVED-PORTRAITS.json').read_text())['sources']};layer_count=0
        for slot,entry in portraits.items():
            info=validate_region(entry,slot);x,y,w,h=entry['region']
            assert h>w and h>=info['height']*.6,f'{slot}仍是头肩视区而非完整全身基底'
            layers=entry.get('layers');assert isinstance(layers,list) and layers,f'{slot}缺少全身分层'
            base=layers[0];assert base.get('src')==entry['src'] and base.get('canvas')==entry['canvas'],f'{slot}首层不是原全身基底'
            assert not base.get('transform'),f'{slot}全身基底不应被缩放/平移重画'
            assert len(layers)==1 if slot.endswith('-neutral') else len(layers)>=2,f'{slot}普通表情须保留单基底，其余表情须有局部覆盖'
            for i,layer in enumerate(layers):
                label=f'{slot}.layers[{i}]';assert layer.get('src') in evidence,f'{label}引用凭据之外图像'
                li=image_data(layer);assert layer.get('canvas')==[li['width'],li['height']],f'{label}画布不符'
                points=path_points(layer.get('clipPath'),layer['canvas'],label)
                if i:
                    a,b,c,d,e,f=matrix(layer['transform'],label) if layer.get('transform') else (1,0,0,1,0,0)
                    mapped=[(a*px+c*py+e,b*px+d*py+f) for px,py in points]
                    minx,maxx=min(v[0] for v in mapped),max(v[0] for v in mapped);miny,maxy=min(v[1] for v in mapped),max(v[1] for v in mapped)
                    assert maxx>x and minx<x+w and maxy>y and miny<y+h,f'{label}表情映射完全落在立绘以外'
                layer_count+=1
        renderer=(ROOT/'src/assets.js').read_text()
        assert 'clipPathUnits="userSpaceOnUse"' in renderer and 'value.layers.map' in renderer,'renderer没有实际遍历全身/表情层'
        assert 'layer.clipPath' in renderer and 'layer.transform' in renderer and 'layer.src' in renderer,'renderer缺少轮廓/矩阵/供体源图'
        assert 'clip-path="url(#' in renderer and 'portrait-fullbody' in renderer,'renderer缺少局部裁切引用或全身布局class'
        natives=[v for v in portraits.values() if v.get('nativeSrc')]
        assert len(natives)==42 and len({v['nativeSrc'] for v in natives})==36,'Fio native bindings missing'
        assert 'if(value.nativeSrc)' in renderer and 'portrait-native-alpha' in renderer,'Fio native renderer missing'
        return {'validatedSlots':len(portraits),'provenanceLayers':layer_count,'unalteredBodyBase':True,'fioNativeSprites':36,'fioNativeBindings':42}
    test('全身原像素基底不变，局部表情层的轮廓/矩阵与运行时绘制合法',runtime_cutouts)
    def expressions():
        groups=[]
        for who,outfits in INDEPENDENT.items():
            for outfit in outfits:
                entries=[portraits[f'{who}-{outfit}-{expr}'] for expr in EXPRESSIONS]
                bases=[region_key({'src':v['src'],'region':v['region'],'canvas':v['canvas'],'base':v['layers'][0]}) for v in entries]
                assert len(set(bases))==1,f'{who}-{outfit}切表情时全身基底/站姿改变'
                hashes=[];donors=[]
                for entry in entries:
                    patches=[]
                    for layer in entry['layers'][1:]:
                        points=path_points(layer['clipPath'],layer['canvas'],f'{who}-{outfit}')
                        box=(math.floor(min(v[0] for v in points)),math.floor(min(v[1] for v in points)),math.ceil(max(v[0] for v in points)),math.ceil(max(v[1] for v in points)))
                        with Image.open(local_path(layer['src'])) as im:patches.append(digest(im.crop(box).tobytes()))
                    hashes.append(tuple(patches));donors.append(region_key(entry['layers'][1:]))
                assert len(set(hashes))==6,f'{who}-{outfit}表情供体局部像素重复'
                assert len(set(donors))==6,f'{who}-{outfit}未采用六种独立表情组合'
                groups.append({'character':who,'outfit':outfit,'expressions':6,'bodyBaseUnchanged':True,'distinctExpressionDonors':6})
        return groups
    test('13套衣装各六种局部表情，切换不裁掉身体也不更换站姿',expressions)
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
                outfit=line.get('portraitOutfit') or override.get(who) or line.get('outfit') or default;expr=line.get('expression','neutral');key=f'{who}-{outfit}-{expr}'
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
    summary={'status':status,'passed':passed,'total':len(checks),'styleVersion':manifest.get('styleVersion'),'portraitSlots':len(portraits),'uniquePortraitBodySources':len({source(v) for v in portraits.values()}),'portraitStyleVersion':manifest.get('portraitStyleVersion'),'cgs':len(manifest.get('cgs',{})),'browserVerification':False,'checks':checks}
    rows='\n'.join(f"| {c['name']} | {'通过' if c['status']=='passed' else '失败'} | {c.get('error','')} |" for c in checks)
    cg_rows='\n'.join(f"| {c['id']} | {(c['beforeSha256'] or '新增')[:16]} | {c['afterSha256'][:16]} | {c['state']} |" for c in cg_info)
    report=f'''# 审阅美术与泳装剧情接入验收

执行：`python3 scripts/test-reference-art.py --baseline {args.baseline}`。时间：{datetime.now(timezone.utc).isoformat()}。结果：**{passed}/{len(checks)} 项通过，{status}**。

检查读取正式清单、六份剧情、PNG及声明视区，不修改图片。Gina work仅别名morning；12张原审阅sheet含恢复的旧草帽以固定SHA256和凭据核对，仅干泳装局部修改有独立凭据；全身基底与局部表情仅在运行时SVG组合。区域像素SHA证明画面不同，不保证表情演技、脸型或电影风格。

| 检查 | 结果 | 未通过原因 |
|---|---|---|
{rows}

## CG保留与替换

保留图允许原版本标记不变；保留与替换按二进制比较，泳装CG为新增正式剧情图。

| CG | 基线SHA256前16位 | 当前SHA256前16位 | 状态 |
|---|---|---|---|
{cg_rows}

## 验证范围

11地点/33个16:9背景视区、13套全身基底/90槽/78个表情组合、13张独立CG、指定六张CG字节保留与泳装剧情绑定。Pillow仅在内存读取区域进行像素分析，没有保存或修改图像。

此脚本不运行浏览器，也不将文件/哈希检查称为触控、版式或电影风格验收。真实浏览器验证由主代理单独报告。
'''
    (ROOT/'docs/REFERENCE-ART-QA.md').write_text(report)
    print(json.dumps(summary,ensure_ascii=False,indent=2),flush=True)
    return 1 if failed else 0

if __name__=='__main__':sys.exit(main())
