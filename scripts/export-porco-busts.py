#!/usr/bin/env python3
"""Export complete approved Porco expression busts with real transparency.
Uses original pixels without face composition, resizing, recoloring or new ink.
"""
from pathlib import Path
import hashlib,json,re
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
ROOT=Path(__file__).resolve().parent.parent
SPEC=json.loads((ROOT/'docs/PORCO-BUST-REGIONS.json').read_text())
OUT=ROOT/'assets/portrait-porco-bust';OUT.mkdir(exist_ok=True)


def raster_path(d,origin,shape):
 tokens=re.findall(r'[MLCQZ]|[-+]?(?:\d*\.\d+|\d+)',d);i=0;points=[];p=None;start=None
 while i<len(tokens):
  cmd=tokens[i];i+=1
  if cmd=='Z':
   if start is not None:points.append(start)
   continue
  n={'M':2,'L':2,'Q':4,'C':6}[cmd]
  v=np.array(list(map(float,tokens[i:i+n]))).reshape(-1,2);i+=n
  if cmd in ('M','L'):
   p=v[0];points.append(p.copy())
   if cmd=='M':start=p.copy()
  else:
   for t in np.linspace(0,1,32)[1:]:
    q=(1-t)**2*p+2*(1-t)*t*v[0]+t*t*v[1] if cmd=='Q' else (1-t)**3*p+3*(1-t)**2*t*v[0]+3*(1-t)*t*t*v[1]+t**3*v[2]
    points.append(q)
   p=v[-1]
 h,w=shape;mask=Image.new('L',(w*4,h*4));ImageDraw.Draw(mask).polygon([tuple((q-origin)*4) for q in points],fill=255)
 return np.asarray(mask.resize((w,h),Image.Resampling.LANCZOS))>127


def export(rgb,cloth=None):
 v=rgb.astype(float);h,w=v.shape[:2]
 border=np.concatenate([v[:3].reshape(-1,3),v[-3:].reshape(-1,3),v[:,:3].reshape(-1,3),v[:,-3:].reshape(-1,3)])
 paper=np.median(border[(border[:,0]>235)&(border[:,1]>220)&(border[:,2]>195)],axis=0)
 distance=np.linalg.norm(v-paper,axis=2)
 r,g,b=[v[:,:,i] for i in range(3)]
 paperish=(r>238)&(g>230)&(b>213)&((r-b)<40)
 seed=ndi.binary_closing(~paperish,iterations=1)
 labels,_=ndi.label(seed);sizes=np.bincount(labels.ravel());sizes[0]=0
 mask=ndi.binary_fill_holes(labels==sizes.argmax())
 if cloth is not None:
  yy,xx=np.mgrid[:h,:w]
  mask|=cloth&(xx<w*.36)&(yy>h*.50)&(yy<h*.78)
  mask=ndi.binary_fill_holes(mask)
 # The scarf, coat, glasses and goggles are inside a closed original outline;
 # keep their pale highlights, rather than globally keying white pixels.
 inside=ndi.distance_transform_edt(mask);band=mask&(inside<=2.5)
 luma=v@np.array([.2126,.7152,.0722]);dark=(luma<100)&(v.max(axis=2)<145)
 F=v.copy();best=distance.copy()
 for dy in range(-2,3):
  for dx in range(-2,3):
   shifted=ndi.shift(v,(dy,dx,0),order=0,mode='nearest')
   support=ndi.shift(mask.astype(float),(dy,dx),order=0,mode='constant')>.5
   strength=np.linalg.norm(shifted-paper,axis=2)
   select=band&support&(strength>best);F[select]=shifted[select];best[select]=strength[select]
 D=F-paper;coverage=np.clip(np.sum((v-paper)*D,axis=2)/np.maximum(np.sum(D*D,axis=2),1),0,1)
 fringe=band&~dark
 alpha=mask.astype(float);alpha[fringe]=coverage[fringe];alpha[fringe&(coverage<.08)]=0
 cleaned=rgb.copy();boundary=fringe&(coverage>=.08)&(coverage<.999)
 a=coverage[boundary,None]
 cleaned[boundary]=np.rint(np.clip((v[boundary]-(1-a)*paper)/np.maximum(a,.08),0,255)).astype('uint8')
 cleaned[alpha==0]=0
 rgba=np.dstack((cleaned,np.rint(alpha*255).astype('uint8')))
 interior=mask&(inside>3)
 assert np.array_equal(rgba[interior,:3],rgb[interior])
 assert np.all(rgba[interior,3]==255)
 assert np.all(rgba[dark&mask,3]==255)
 return rgba,{'paperRGB':paper.tolist(),'boundaryRGBPixelsChanged':int(boundary.sum()),'interiorRGBChangedPixels':0,'originalDarkInkAlphaChangedPixels':0}


def main():
 records=[]
 for outfit,items in SPEC.items():
  for item in items:
   source=ROOT/item['source'];data=source.read_bytes();x,y,w,h=item['region']
   raw=np.array(Image.open(source).convert('RGB').crop((x,y,x+w,y+h)))
   cloth=raster_path(item['clothOutline'],np.array([x,y]),(h,w)) if item.get('clothOutline') else None
   rgba,stats=export(raw,cloth);slot=f'porco-{outfit}-{item["expression"]}'
   native=f'assets/portrait-porco-bust/{slot}.png';Image.fromarray(rgba,'RGBA').save(ROOT/native,optimize=True)
   records.append({'slot':slot,'portraitFormat':'bust','nativeSrc':native,'nativeCanvas':[w,h],
    'nativeSha256':hashlib.sha256((ROOT/native).read_bytes()).hexdigest(),
    'alphaSha256':hashlib.sha256(rgba[:,:,3].tobytes()).hexdigest(),
    'originalSource':item['source'],'originalSha256':hashlib.sha256(data).hexdigest(),
    'sourceRegion':[x,y,w,h],**stats})
   print(slot,w,h)
 proof={'version':'original-bust-expressions-v21','imageGenerationUsed':False,'neutralChanged':False,
  'method':'Complete original approved head-and-shoulder expression cells. No face patches, resampling, pose edits, recoloring or added outlines; only exterior transparency and original matte decontamination.',
  'bustSprites':20,'records':records}
 (ROOT/'docs/PORCO-BUST.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':main()
