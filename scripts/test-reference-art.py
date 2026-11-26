#!/usr/bin/env python3
"""Audit the active film-reference-v2 artwork without changing game files.

This checks formats, transparency, references, bindings, and replacement bytes.
Hashes do not prove likeness, expression quality, or fidelity to a film style.
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
OUTFITS={'fio':('work','date','flight'),'gina':('morning','work','date','stage'),'porco':('work',)}
INDEPENDENT={'fio':('work','date','flight'),'gina':('morning','date','stage'),'porco':('work',)}
CG_IDS={'letter','yellow-quilt','dinner-fio','kitchen','silence','dock','mailbag','storm','first-flight','key','garden','last-boat'}


def digest(data):return hashlib.sha256(data).hexdigest()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--baseline',default='cf42651',help='Git revision before this full artwork replacement')
    args=parser.parse_args()
    checks=[];image_info={};cg_info=[];binding_info=[];scene_info={}
    try:
        manifest=json.loads((ROOT/'assets/manifest.json').read_text())
        scenes=[scene for name in ['common','fio','gina','quests','endings','port'] for scene in json.loads((ROOT/f'data/{name}.json').read_text())]
    except Exception as exc:
        print('FAIL 无法读取正式清单或剧情：'+str(exc));return 1
    portraits=manifest.get('portraits',{})
    by_id={scene['id']:scene for scene in scenes}

    def test(name,fn):
        try:
            detail=fn()
            checks.append({'name':name,'status':'passed','detail':detail})
            print('PASS '+name,flush=True)
        except Exception as exc:
            checks.append({'name':name,'status':'failed','error':str(exc)})
            print('FAIL '+name+' · '+str(exc),flush=True)

    def local_path(src):
        assert isinstance(src,str) and src,'资源路径为空或无效'
        p=(ROOT/src).resolve()
        assert p.is_relative_to(ROOT),f'资源越出项目目录：{src}'
        assert p.is_file(),f'资源文件缺失：{src}'
        return p

    def image_data(src):
        if src in image_info:return image_info[src]
        p=local_path(src);raw=p.read_bytes()
        with Image.open(p) as im:
            assert im.format=='PNG',f'不是实际PNG：{src} ({im.format})'
            im.verify()
        with Image.open(p) as im:
            extrema=im.getchannel('A').getextrema() if im.mode=='RGBA' else None
            record={'src':src,'width':im.width,'height':im.height,'mode':im.mode,'alphaRange':list(extrema) if extrema else None,'sha256':digest(raw),'pixelSha256':digest(im.tobytes()),'bytes':len(raw)}
        image_info[src]=record
        return record

    def version_and_legacy():
        assert manifest.get('styleVersion')=='film-reference-v2',f"尚未启用 film-reference-v2：{manifest.get('styleVersion')!r}"
        assert 'setting' not in manifest,'旧setting仍在active清单中'
        assert all(str(src).lower().endswith('.png') for src in portraits.values()),'active人物清单仍引用旧SVG或非PNG'
        assert not any('character-setting' in str(src) for src in portraits.values()),'active人物仍使用旧设定图'
        return {'styleVersion':manifest['styleVersion'],'oldSettingActive':False,'oldSvgPortraitActive':False}
    test('启用film-reference-v2且旧SVG人物与旧setting不再active',version_and_legacy)

    def slots():
        expected={f'{who}-{outfit}-{expr}' for who,outfits in OUTFITS.items() for outfit in outfits for expr in EXPRESSIONS}
        assert set(portraits)==expected,f'立绘slot集合不符；缺少{sorted(expected-set(portraits))}，多出{sorted(set(portraits)-expected)}'
        assert len(portraits)==48,f'立绘slot为{len(portraits)}，应为48'
        assert len(set(portraits.values()))==42,f'独立PNG为{len(set(portraits.values()))}，应为42'
        for expr in EXPRESSIONS:
            assert portraits[f'gina-work-{expr}']==portraits[f'gina-morning-{expr}'],f'Gina work没有别名到morning：{expr}'
        for who,outfits in INDEPENDENT.items():
            paths={portraits[f'{who}-{outfit}-{expr}'] for outfit in outfits for expr in EXPRESSIONS}
            assert len(paths)==len(outfits)*6,f'{who}独立衣装文件出现别名或缺失'
        return {'slots':48,'uniquePngs':42,'fioUnique':18,'ginaUnique':18,'porcoUnique':6,'ginaWorkAliasesMorning':True}
    test('48立绘slot对应42独立PNG，Gina工作别名映射正确',slots)

    def transparency():
        dimensions=set()
        for src in set(portraits.values()):
            info=image_data(src)
            assert info['mode']=='RGBA',f"{src} 不是RGBA：{info['mode']}"
            assert info['alphaRange'][0]==0 and info['alphaRange'][1]>0,f'{src}缺少全透明区或完全不可见'
            dimensions.add((info['width'],info['height']))
        assert len(dimensions)==1,f'立绘画布尺寸不一致：{sorted(dimensions)}'
        return {'validated':len(set(portraits.values())),'allRGBA':True,'transparentRegionPresent':True,'canvas':list(next(iter(dimensions)))}
    test('42独立人物PNG完整可读、RGBA透明区与画布尺寸一致',transparency)

    def expressions():
        groups=[]
        for who,outfits in INDEPENDENT.items():
            for outfit in outfits:
                infos=[image_data(portraits[f'{who}-{outfit}-{expr}']) for expr in EXPRESSIONS]
                assert len({info['sha256'] for info in infos})==6,f'{who}-{outfit}六表情文件SHA重复'
                assert len({info['pixelSha256'] for info in infos})==6,f'{who}-{outfit}六表情像素完全相同'
                assert len({(info['width'],info['height']) for info in infos})==1,f'{who}-{outfit}组内尺寸不同'
                groups.append({'character':who,'outfit':outfit,'expressions':6,'distinctByteHashes':6,'distinctPixelHashes':6})
        return groups
    test('七套独立衣装各有六张不同文件与不同像素的表情图',expressions)

    def scene_outfits():
        mappings=0;line_mappings=0
        names={'菲尔':'fio','吉娜':'gina','波鲁克':'porco'}
        for scene in scenes:
            override=scene.get('portraitOutfits',{})
            for who,outfit in override.items():
                assert who in OUTFITS,f"{scene['id']} 未知人物{who}"
                for expr in EXPRESSIONS:
                    key=f'{who}-{outfit}-{expr}'
                    assert key in portraits,f"{scene['id']} 缺少 {key}"
                    local_path(portraits[key])
                mappings+=1
            for line in scene['lines']:
                who=names.get(line.get('speaker'))
                if not who:continue
                outfit=override.get(who) or line.get('outfit') or ('morning' if who=='gina' else 'work')
                expr=line.get('expression','neutral')
                key=f'{who}-{outfit}-{expr}'
                assert key in portraits,f"{scene['id']} 对白无法解析立绘 {key}"
                line_mappings+=1
        scene_info.update({'scenes':len(scenes),'explicitOutfitMappings':mappings,'resolvedCharacterLines':line_mappings})
        return dict(scene_info)
    test('每个场景衣装映射及人物对白表情均能解析active PNG',scene_outfits)

    def changed_cgs():
        cgs=manifest.get('cgs',{})
        assert set(cgs)==CG_IDS,f'CG集合不符：{sorted(cgs)}'
        assert len(cgs)==12
        for id in sorted(cgs):
            cg=cgs[id];src=cg['src'] if isinstance(cg,dict) else cg
            assert src.lower().endswith('.png'),f'{id}不是PNG路径'
            if isinstance(cg,dict):
                assert cg.get('styleVersion')=='film-reference-v2',f'{id}缺少新版本标记'
                assert cg.get('placeholder') is False,f'{id}仍标临时图'
            info=image_data(src)
            assert info['width']>info['height'],f'{id}不是横向CG'
            result=subprocess.run(['git','show',f'{args.baseline}:{src}'],cwd=ROOT,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
            assert result.returncode==0,f"无法取得{args.baseline}原CG {src}：{result.stderr.decode(errors='replace')[:180]}"
            old_sha=digest(result.stdout)
            assert old_sha!=info['sha256'],f'{id}内容与{args.baseline}原CG完全相同'
            cg_info.append({'id':id,'src':src,'size':[info['width'],info['height']],'beforeSha256':old_sha,'afterSha256':info['sha256'],'bytesChanged':True})
        return {'count':12,'baseline':args.baseline,'allActualPngs':True,'allContentHashesChanged':True}
    test('12张active CG均为实际PNG且内容SHA不同于替换前版本',changed_cgs)

    def important_bindings():
        expected=[
            ('common_d66_gap','storm',66,0,{'fio':'work','gina':'morning'}),
            ('common_d81_firstflight','first-flight',81,0,{'fio':'flight'}),
            ('gina_d04','garden',51,2,{'gina':'morning'}),
            ('gina_d01','kitchen',9,2,{'gina':'stage'}),
            ('gina_d02','silence',21,2,{'gina':'morning'}),
            ('gina_e10','key',70,0,{'gina':'morning'}),
            ('fio_d02','dinner-fio',24,2,{'fio':'date'}),
            ('fio_d02_after',None,0,2,{'fio':'date'}),
            ('opening','letter',1,0,{'fio':'flight'}),
            ('common_d89_boat','last-boat',89,2,{'fio':'work','gina':'date'}),
        ]
        for id,cg,day,period,outfits in expected:
            assert id in by_id,f'关键场景不存在：{id}'
            s=by_id[id]
            assert s.get('cg')==cg,f"{id} CG绑定应为{cg}，实际{s.get('cg')}"
            assert (s['day'],s['period'])==(day,period),f'{id} 日期/昼夜错误'
            for who,outfit in outfits.items():assert s.get('portraitOutfits',{}).get(who)==outfit,f'{id} {who}衣装应为{outfit}'
            binding_info.append({'scene':id,'day':day,'period':period,'cg':cg,'outfits':outfits})
        assert 'common_d66_gap' in manifest['cgs']['storm'].get('unlock',''),'storm清单解锁条件未更新'
        assert 'common_d81_firstflight' in manifest['cgs']['first-flight'].get('unlock',''),'first-flight清单解锁条件未更新'
        assert '夜' in manifest['cgs']['garden'].get('composition',''),'garden清单构图仍未说明夜晚'
        return binding_info
    test('首航、天气图、夜花园及厨房/晚餐前后衣装绑定一致',important_bindings)

    def privacy():
        active=json.dumps(manifest,ensure_ascii=False)
        assert '/workspace/art-references' not in active and '/Users/' not in active,'active清单泄露本地参考路径'
        assert not any(str(src).lower().endswith(('.pdf','.jpeg','.jpg')) for src in portraits.values()),'人物清单误用原参考文件'
        assert not list(ROOT.rglob('*.pdf')),'项目目录中意外存在原PDF，应留在本地参考目录'
        return {'referencePdfsInProject':0,'privateReferencePathsInActiveManifest':0}
    test('用户参考PDF和本地参考目录未进入active资源清单',privacy)

    passed=sum(c['status']=='passed' for c in checks);failed=[c for c in checks if c['status']=='failed'];status='passed' if not failed else 'failed'
    summary={'status':status,'passed':passed,'total':len(checks),'styleVersion':manifest.get('styleVersion'),'portraitSlots':len(portraits),'uniquePortraitFiles':len(set(portraits.values())),'changedCGs':len(cg_info),'browserVerification':False,'checks':checks}
    when=datetime.now(timezone.utc).isoformat()
    story_report='主代理报告剧情检查已完成；本美术脚本不重复运行剧情或浏览器检查。'
    audit_path=ROOT/'data/audit.json'
    if audit_path.is_file():
        audit=json.loads(audit_path.read_text())
        tests=audit.get('tests',{})
        summary['existingStoryAudit']={'source':'data/audit.json','status':audit.get('status'),'uniqueCharacters':audit.get('uniqueCharacters'),'uniqueHanziCharacters':audit.get('uniqueHanziCharacters'),'sceneCount':audit.get('sceneCount'),'passedTests':tests.get('passed'),'totalTests':tests.get('total'),'testStatus':tests.get('status')}
        story_report=f"主代理已另外执行正式剧情/引擎检查。现有 `data/audit.json` 记录：{tests.get('passed','?')}/{tests.get('total','?')} 项通过，状态 `{tests.get('status','unknown')}`；{audit.get('sceneCount','?')} 个场景、{audit.get('uniqueCharacters','?'):,} 个去重正文字符，其中汉字 {audit.get('uniqueHanziCharacters','?'):,} 字。本美术脚本仅读取该既有记录，没有重跑剧情或浏览器检查。"
    rows='\n'.join(f"| {c['name']} | {'通过' if c['status']=='passed' else '失败'} | {c.get('error','')} |" for c in checks)
    portrait_rows=[]
    for who,outfits in INDEPENDENT.items():
        for outfit in outfits:
            infos=[image_info.get(portraits.get(f'{who}-{outfit}-{expr}')) for expr in EXPRESSIONS]
            good=[i for i in infos if i]
            sizes=sorted({(i['width'],i['height']) for i in good})
            portrait_rows.append(f"| {who} | {outfit} | {len(good)} | {', '.join(str(w)+'×'+str(h) for w,h in sizes) or '未验证'} | {len({i['sha256'] for i in good})} |")
    cg_rows='\n'.join(f"| {c['id']} | {c['beforeSha256'][:16]}… | {c['afterSha256'][:16]}… | 已改变 |" for c in cg_info) or '| 尚未验证 | — | — | — |'
    binding_rows='\n'.join(f"| {c['scene']} | 第{c['day']}天 / {['上午','下午','夜晚'][c['period']]} | {c['cg'] or '延续对白'} | {', '.join(k+': '+v for k,v in c['outfits'].items())} |" for c in binding_info)
    report=f'''# 原参考角色美术接入验收\n\n执行：`python scripts/test-reference-art.py --baseline {args.baseline}`。时间：{when}。结果：**{passed}/{len(checks)} 项通过，{status}**。\n\n本检查以正式 `assets/manifest.json` 与游戏实际载入的六份剧情为准。它不修改代码、清单、剧情或图片，也不重新生成构建产物。\n\n| 检查 | 结果 | 未通过原因 |\n|---|---|---|\n{rows}\n\n## 人物文件\n\nActive 人物清单 {len(portraits)} 个slot，引用 {len(set(portraits.values()))} 个独立文件。Gina 的work六slot应与morning六slot共享同一组PNG，其余七套服装各有六个独立表情文件。透明度检查要求RGBA、至少有完全透明像素和可见像素；图像文件均通过PNG读取校验。\n\n| 人物 | 独立服装 | 已验证文件 | 画布尺寸 | 不同文件SHA数 |\n|---|---|---:|---|---:|\n{chr(10).join(portrait_rows)}\n\n## CG实际内容替换\n\n下表逐个读取当前PNG，并同 `git show {args.baseline}:资源路径` 得到的替换前二进制比较。SHA变化只证明文件内容改变，不证明电影风格、人物相似程度或逐像素复现参考图。不同表情的像素SHA也只证明像素不同，不替代对情绪和表情的人工判断。\n\n| CG | 替换前SHA256前16位 | 当前SHA256前16位 | 文件内容 |\n|---|---|---|---|\n{cg_rows}\n\n## 关键剧情绑定\n\n| 场景 | 时间 | CG | 人物衣装 |\n|---|---|---|---|\n{binding_rows}\n\n## 相关剧情检查\n\n{story_report}\n\n## 视觉复核与隐私边界\n\n角色脸型、发型、胡须颜色、画线与平涂方向，以及CG中的视线、服装、鞋、钥匙、船桨等细节，仍由人工对照用户提供的电影参考审阅。本脚本不把哈希或版本字段当作视觉风格合格证。原参考PDF和提取参考图仅保留在本地工作区，不随游戏公开；本报告只记录active清单与项目目录未引用原PDF及本地参考路径。\n\n本次美术审计未重试已确认的浏览器策略：真实 `file://` 导航此前被 Chromium 管理员策略以 `ERR_BLOCKED_BY_ADMINISTRATOR` 阻止；没有绕过策略，也没有宣称浏览器视觉、触控或音频已经通过。此前的单文件静态/VM检查与真实浏览器限制见 [STANDALONE-QA.md](STANDALONE-QA.md)。\n'''
    (ROOT/'docs/REFERENCE-ART-QA.md').write_text(report)
    print(json.dumps(summary,ensure_ascii=False,indent=2),flush=True)
    return 1 if failed else 0

if __name__=='__main__':sys.exit(main())
