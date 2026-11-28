#!/usr/bin/env python3
"""Check untouched Fio neutral masters and original full bust expressions."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent
art=json.loads((ROOT/'assets/manifest.json').read_text())
assert art['fioPortraitVersion']=='native-bust-expressions-v20'
original=json.loads((ROOT/'docs/FIO-NATIVE.json').read_text())
old={r['slot']:r for r in original['records']}
proof=json.loads((ROOT/'docs/FIO-BUST.json').read_text())
assert proof['version']==art['fioPortraitVersion'] and proof['bustSprites']==30
assert proof['imageGenerationUsed'] is False and proof['neutralChanged'] is False
busts={r['slot']:r for r in proof['records']};assert len(busts)==30
EXP=['neutral','smile','serious','sad','surprise','tired']
OUTFITS=['work','date','flight','strawhat','swim-dry','swim-wet']
paths=set();formats={'fullbody':0,'bust':0}
for outfit in OUTFITS:
 hashes=set()
 for expression in EXP:
  slot=f'fio-{outfit}-{expression}';entry=art['portraits'][slot]
  neutral=expression=='neutral';record=old[slot] if neutral else busts[slot]
  assert entry['portraitFormat']==('fullbody' if neutral else 'bust')
  formats[entry['portraitFormat']]+=1
  folder='portrait-fio-native' if neutral else 'portrait-fio-bust'
  assert entry['nativeSrc']==f'assets/{folder}/{slot}.png'
  assert entry['nativeCanvas']==(entry['region'][2:] if neutral else entry['bustRegion'][2:])
  assert entry['nativeSrc']==record['nativeSrc'] and entry['nativeCanvas']==record['nativeCanvas']
  p=ROOT/entry['nativeSrc'];digest=hashlib.sha256(p.read_bytes()).hexdigest()
  assert digest==record['nativeSha256'],f'{slot}: artwork differs from proof'
  hashes.add(digest);paths.add(entry['nativeSrc'])
  assert hashlib.sha256((ROOT/record['originalSource']).read_bytes()).hexdigest()==record['originalSha256']
  with Image.open(p) as im:
   assert im.mode=='RGBA';assert list(im.size)==entry['nativeCanvas'];pixels=np.array(im)
  alpha=pixels[:,:,3]
  assert hashlib.sha256(alpha.tobytes()).hexdigest()==record['alphaSha256']
  assert (alpha==0).sum()>alpha.size*.10 and (alpha==255).sum()>alpha.size*.20
  assert ((alpha>0)&(alpha<255)).any()
  assert np.all(alpha[:2]==0) and np.all(alpha[:,:2]==0),f'{slot}: numbering or border visible'
  if not neutral:
   assert entry['nativeCanvas'][1]<500 and entry['nativeCanvas'][0]>250
   assert record['interiorRGBChangedPixels']==0 and record['originalDarkInkAlphaChangedPixels']==0
   x,y,w,h=record['sourceRegion'];raw=np.array(Image.open(ROOT/record['originalSource']).convert('RGB').crop((x,y,x+w,y+h)))
   # Check actual copied interior pixels independently of the exported audit.
   opaque=(alpha==255)
   assert np.array_equal(pixels[opaque,:3],raw[opaque]),f'{slot}: opaque original pixels changed'
  else:
   assert digest==old[slot]['nativeSha256'],f'{slot}: neutral was changed'
   if outfit=='swim-wet':
    x,y,_,_=entry['region']
    for px,py in [(182,186),(247,164),(275,122),(319,119)]:assert alpha[py-y,px-x]>=250
 assert len(hashes)==6
assert len(paths)==36 and formats=={'fullbody':6,'bust':30}
bindings={k:v for k,v in art['portraits'].items() if v.get('nativeSrc')}
assert len(bindings)==42 and all(k.startswith('fio-') for k in bindings)
assert sum(v['portraitFormat']=='bust' for v in bindings.values())==35
assert sum(v['portraitFormat']=='fullbody' for v in bindings.values())==7
for e in EXP:assert art['portraits'][f'fio-swim-{e}']==art['portraits'][f'fio-swim-wet-{e}']
dry=art['portraits']['fio-swim-dry-neutral'];wet=art['portraits']['fio-swim-wet-neutral']
assert dry['nativeSrc']!=wet['nativeSrc']
assert hashlib.sha256((ROOT/dry['src']).read_bytes()).hexdigest()=='38f31074f629127e952996044d8b7f7e743d230e91583ac82ab2cb3fa4a4af5c'
print(json.dumps({'status':'passed','neutralFullbodyUnchanged':6,'originalBustExpressions':30,'bindings':42,'dryAndWetSeparate':True,'browserVerification':False}))
