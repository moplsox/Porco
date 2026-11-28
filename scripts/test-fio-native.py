#!/usr/bin/env python3
"""Check Fio's active transparent expression sprites and stable outfit geometry."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image

ROOT=Path(__file__).resolve().parent.parent
art=json.loads((ROOT/'assets/manifest.json').read_text())
assert art.get('fioPortraitVersion')=='native-seam-edge-v19'
proof=json.loads((ROOT/'docs/FIO-NATIVE.json').read_text())
assert proof['version']==art['fioPortraitVersion'] and proof['uniqueNativeSprites']==36
proven={r['slot']:r for r in proof['records']}
assert len(proven)==36
EXP=['neutral','smile','serious','sad','surprise','tired']
OUTFITS=['work','date','flight','strawhat','swim-dry','swim-wet']
paths=set();checked=0
for outfit in OUTFITS:
    baseline=None;hashes=set()
    for expression in EXP:
        slot=f'fio-{outfit}-{expression}';entry=art['portraits'][slot]
        assert entry['nativeSrc']==f'assets/portrait-fio-native/{slot}.png'
        assert entry['nativeCanvas']==entry['region'][2:]
        p=ROOT/entry['nativeSrc'];raw=p.read_bytes();digest=hashlib.sha256(raw).hexdigest();hashes.add(digest);paths.add(entry['nativeSrc'])
        record=proven[slot]
        assert record['nativeSrc']==entry['nativeSrc'] and record['nativeCanvas']==entry['nativeCanvas'],f'{slot}: proof binding mismatch'
        assert digest==record['nativeSha256'],f'{slot}: immutable native master changed'
        assert hashlib.sha256((ROOT/record['originalSource']).read_bytes()).hexdigest()==record['originalSha256'],f'{slot}: source provenance mismatch'
        with Image.open(p) as im:
            assert im.mode=='RGBA',f'{slot}: sprite is not native RGBA'
            assert list(im.size)==entry['nativeCanvas'],f'{slot}: sprite canvas mismatch'
            pixels=np.array(im)
        alpha=pixels[:,:,3]
        assert hashlib.sha256(alpha.tobytes()).hexdigest()==record['alphaSha256'],f'{slot}: proof alpha mismatch'
        assert (alpha==0).sum()>alpha.size*.15,f'{slot}: background has no true transparency'
        assert (alpha==255).sum()>alpha.size*.15,f'{slot}: body is unexpectedly translucent'
        assert ((alpha>0)&(alpha<255)).any(),f'{slot}: alpha edge lost smooth sampling'
        assert np.all(alpha[:2]==0) and np.all(alpha[:,:2]==0),f'{slot}: visible image border remains'
        if baseline is None:baseline=pixels
        else:
            assert np.array_equal(alpha,baseline[:,:,3]),f'{slot}: expression changes silhouette'
            row=round(pixels.shape[0]*.35)
            assert np.array_equal(pixels[row:],baseline[row:]),f'{slot}: expression changes outfit/pose'
        if outfit=='swim-wet':
            x,y,_,_=entry['region']
            for px,py in [(182,186),(247,164),(275,122),(319,119)]:
                assert alpha[py-y,px-x]>=250,f'{slot}: intentional water drop or eye highlight removed'
        checked+=1
    assert len(hashes)==6,f'{outfit}: expected six distinct expressions'
assert len(paths)==36
bindings={k:v for k,v in art['portraits'].items() if v.get('nativeSrc')}
assert len(bindings)==42 and all(k.startswith('fio-') for k in bindings),'Native changes affected another character'
for expression in EXP:
    assert art['portraits'][f'fio-swim-{expression}']==art['portraits'][f'fio-swim-wet-{expression}'],'Legacy swim does not alias wet outfit'
dry=art['portraits']['fio-swim-dry-neutral'];wet=art['portraits']['fio-swim-wet-neutral']
assert dry['nativeSrc']!=wet['nativeSrc'],'Before/after swimming point to one sprite'
assert hashlib.sha256((ROOT/dry['src']).read_bytes()).hexdigest()=='38f31074f629127e952996044d8b7f7e743d230e91583ac82ab2cb3fa4a4af5c','Dry swim does not use approved blue-shorts original'
print(json.dumps({'status':'passed','nativeRGBA':checked,'outfits':6,'expressionsPerOutfit':6,'bindings':42,'fixedSilhouetteAndBody':True,'dryAndWetSeparate':True,'browserVerification':False},ensure_ascii=False))
