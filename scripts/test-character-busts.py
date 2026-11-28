#!/usr/bin/env python3
"""Verify original Gina/Porco busts and unchanged full-body neutral portraits."""
from pathlib import Path
import hashlib,json
import numpy as np
from PIL import Image,ImageFilter
ROOT=Path(__file__).resolve().parent.parent
art=json.loads((ROOT/'assets/manifest.json').read_text())
assert art.get('characterPortraitVersion')=='original-bust-expressions-v21'
EXP=['smile','serious','sad','surprise','tired']
OUTFITS={'gina':['morning','date','stage'],'porco':['work','flight','coat','goggles-up']}
NEUTRAL={
 'gina-morning-neutral':'2e07dafd7a7cef782f778cc18db1a7f22520117daf3cd3d41894c6b08c02dc8c',
 'gina-work-neutral':'2e07dafd7a7cef782f778cc18db1a7f22520117daf3cd3d41894c6b08c02dc8c',
 'gina-date-neutral':'cf44df4b0702dc38c443ccc445d01cdbe4c8abce02b2f3351af6076d2cc889e4',
 'gina-stage-neutral':'b09b0ff5043289d760faacf87586a9a091ad8ea9e6e3c52dd4c669a7285fd198',
 'porco-work-neutral':'16e8a02327a7eab62f27b2e31c1987df028c2ab0d0e0243ca6916302834accd0',
 'porco-flight-neutral':'19702b482c6b4144cc619071afbcfe3e866abd6144be99e62220594f5cfcd137',
 'porco-coat-neutral':'09745ec925f0f6a8c673a708436605f61e2cf325df0c06e4ebd19fb90c857769',
 'porco-goggles-up-neutral':'e8531cc4f51d4f88ebba0bd0a4bec0336c7827700227243e1533d7e7d454e43f',
}
sha=lambda data:hashlib.sha256(data).hexdigest()
for slot,digest in NEUTRAL.items():
 entry=art['portraits'][slot]
 canonical=json.dumps(entry,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
 assert sha(canonical)==digest,f'{slot}: neutral presentation metadata changed'
 assert not entry.get('nativeSrc') and len(entry['layers'])==1,f'{slot}: original neutral rendering replaced'

SCARF={
 'porco-flight-smile':[(800,340),(820,345)],
 'porco-flight-serious':[(1170,341),(1190,350)],
}
seen=set();checked=0
for who,outfits in OUTFITS.items():
 proof=json.loads((ROOT/f'docs/{who.upper()}-BUST.json').read_text())
 assert proof.get('imageGenerationUsed') is False,f'{who}: image generation policy missing'
 records={r['slot']:r for r in proof['records']}
 expected={f'{who}-{o}-{e}' for o in outfits for e in EXP}
 assert set(records)==expected,f'{who}: missing or extra bust masters'
 for outfit in outfits:
  unique=set()
  for expression in EXP:
   slot=f'{who}-{outfit}-{expression}';entry=art['portraits'][slot];record=records[slot]
   assert entry['portraitFormat']=='bust' and entry.get('nativeSrc'),f'{slot}: original bust not active'
   assert entry['nativeSrc']==f'assets/portrait-{who}-bust/{slot}.png'
   assert entry['nativeSrc']==record['nativeSrc'] and entry['nativeCanvas']==record['nativeCanvas'],f'{slot}: active native binding differs from reviewed source crop'
   assert entry['src']==record['originalSource'],f'{slot}: source outfit mismatch'
   path=ROOT/entry['nativeSrc'];raw=path.read_bytes();digest=sha(raw)
   assert digest==record['nativeSha256'],f'{slot}: native art differs from reviewed master'
   seen.add(entry['nativeSrc']);unique.add(digest)
   source=ROOT/record['originalSource'];assert sha(source.read_bytes())==record['originalSha256']
   with Image.open(path) as im:
    assert im.mode=='RGBA',f'{slot}: opaque or indexed PNG'
    assert list(im.size)==entry['nativeCanvas'];pixels=np.array(im)
   x,y,w,h=record['sourceRegion'];assert [w,h]==entry['nativeCanvas']
   assert entry.get('bustRegion')==record['sourceRegion'],f'{slot}: crop provenance mismatch'
   with Image.open(source) as original:
    assert x>=0 and y>=0 and x+w<=original.width and y+h<=original.height
    source_pixels=np.array(original.convert('RGB').crop((x,y,x+w,y+h)))
   alpha=pixels[:,:,3];assert sha(alpha.tobytes())==record['alphaSha256']
   assert (alpha==0).sum()>alpha.size*.08,f'{slot}: paper background left opaque'
   assert (alpha==255).sum()>alpha.size*.15,f'{slot}: character is translucent'
   assert ((alpha>0)&(alpha<255)).any(),f'{slot}: hard-cut alias edge'
   for px,py in SCARF.get(slot,[]):
    assert alpha[py-y,px-x]==255,f'{slot}: protected white scarf has a transparent hole at {px},{py}'
   assert np.all(alpha[:2]==0) and np.all(alpha[:,:2]==0),f'{slot}: source numbering or crop border remains'
   # Validate actual copied original interior, independent of export audit flags.
   eroded=np.array(Image.fromarray((alpha>0).astype(np.uint8)*255).filter(ImageFilter.MinFilter(7)))>0
   interior=(alpha==255)&eroded
   assert interior.sum()>alpha.size*.12
   assert np.array_equal(pixels[interior,:3],source_pixels[interior]),f'{slot}: original face/clothes repainted or composited'
   checked+=1
  assert len(unique)==5,f'{who}-{outfit}: repeated expression masters'
assert checked==35 and len(seen)==35
for e in ['neutral',*EXP]:assert art['portraits'][f'gina-work-{e}']==art['portraits'][f'gina-morning-{e}'],'Gina work alias diverged'
entries=list(art['portraits'].values());native=[e for e in entries if e.get('nativeSrc')]
assert len(entries)==90 and len(native)==82
assert len({e['nativeSrc'] for e in native})==71
assert sum(e.get('portraitFormat')=='bust' for e in entries)==75
assert sum(slot.endswith('-neutral') for slot in art['portraits'])==15
print(json.dumps({'status':'passed','originalGinaBusts':15,'originalPorcoBusts':20,'unchangedGinaPorcoNeutralSlots':8,'nativeBindings':82,'bustBindings':75,'uniqueNativeSprites':71,'browserVerification':False}))
