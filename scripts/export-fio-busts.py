#!/usr/bin/env python3
"""Export original approved head/shoulders with a real alpha channel.
No image generation, face composition, scaling, recoloring or new outlines.
Only verified exterior matte pixels are decontaminated; original interior is exact.
"""
from pathlib import Path
import json,hashlib
import numpy as np
from scipy import ndimage as ndi
from scipy.spatial import ConvexHull
from PIL import Image,ImageDraw
ROOT=Path(__file__).resolve().parent.parent
SPEC=json.loads((ROOT/'docs/FIO-BUST-REGIONS.json').read_text())
OUT=ROOT/'assets/portrait-fio-bust';OUT.mkdir(exist_ok=True)


def biggest(mask):
 lab,_=ndi.label(mask);sizes=np.bincount(lab.ravel());sizes[0]=0
 return lab==sizes.argmax()


def export(rgb,outfit):
 v=rgb.astype(float);h,w=v.shape[:2]
 border=np.concatenate((v[:3].reshape(-1,3),v[-3:].reshape(-1,3),v[:,:3].reshape(-1,3),v[:,-3:].reshape(-1,3)))
 paper=np.median(border[(border[:,0]>235)&(border[:,1]>220)&(border[:,2]>195)],axis=0)
 distance=np.linalg.norm(v-paper,axis=2)
 r0,g0,b0=[v[:,:,i] for i in range(3)]
 paperish=(r0>238)&(g0>230)&(b0>213)&((r0-b0)<40)
 seed=ndi.binary_closing(~paperish,iterations=1)
 labels,n=ndi.label(seed);sizes=np.bincount(labels.ravel());sizes[0]=0
 main=labels==sizes.argmax();mask=ndi.binary_fill_holes(main)
 # Pale garment bottoms blend into the sheet's ivory paper. Keep the closed
 # lower torso silhouette; never treat its white cloth as global background.
 start=round(h*({'swim-dry':.64,'swim-wet':.68}.get(outfit,.70)))
 if outfit in ('work','date'):
  for yy in range(start,h):
   xx=np.where(mask[yy])[0]
   if len(xx)>1:mask[yy,xx.min():xx.max()+1]=True
 if outfit in ('swim-dry','swim-wet'):
  yy,xx=np.where(mask & (np.arange(h)[:,None]>=start))
  if len(xx)>20:
   left,right=xx.min(),xx.max()
   points=np.vstack((np.column_stack((xx,yy)),[[left+(right-left)*.30,h-8],[left+(right-left)*.55,h-5],[left+(right-left)*.78,h-8]]))
   hull=ConvexHull(points);garment=Image.new('L',(w,h));ImageDraw.Draw(garment).polygon([tuple(q) for q in points[hull.vertices]],fill=255)
   mask|=(np.array(garment)>0)&(np.arange(h)[:,None]>=round(h*.80))
   mask=ndi.binary_fill_holes(mask)
 # Actual detached water-drop outlines are close to the wet hair and shoulders.
 # Numbering and source labels remain separate, distant components.
 drops=np.zeros((h,w),bool)
 if outfit=='swim-wet':
  near=ndi.distance_transform_edt(~main)
  for k in range(1,n+1):
   comp=labels==k;area=int(comp.sum())
   if 2<=area<=180 and np.min(near[comp])<=10:
    ys,xs=np.where(comp)
    if xs.max()-xs.min()<18 and ys.max()-ys.min()<25:
     closed=ndi.binary_fill_holes(ndi.binary_closing(comp,iterations=1));drops|=closed;mask|=closed
  # Original droplets attached by hair strings are included in main; protect
  # their gray/white contours below the lowest continuous hair mass as well.
  bright=(v[:,:,0]>205)&(v[:,:,1]>195)&(v[:,:,2]>180)&mask
  drop_labels,n=ndi.label(bright)
  for k in range(1,n+1):
   comp=drop_labels==k;ys,xs=np.where(comp)
   if 2<=len(xs)<=130 and ys.mean()>h*.35 and xs.max()-xs.min()<12 and ys.max()-ys.min()<23:
    drops|=ndi.binary_dilation(comp,iterations=1)
 # Protect the entire original face and eye whites from any background key.
 r,g,b=[v[:,:,i] for i in range(3)]
 skin=(r>175)&(g>115)&(r-g>27)&(g-b>20)
 skin=ndi.binary_fill_holes(biggest(ndi.binary_closing(skin,iterations=2)))
 guard=ndi.binary_dilation(skin,iterations=2)
 # Remove only exterior paper reclosed between original brown hair locks.
 brown=(r<220)&(g<145)&(r-g>30)&(g-b>10)
 hair=biggest(brown);ys,xs=np.where(hair)
 cleared=np.zeros_like(mask)
 if len(xs)>20:
  coords=np.column_stack((xs,ys));hull=ConvexHull(coords)
  hm=Image.new('L',(w,h));ImageDraw.Draw(hm).polygon([tuple(p) for p in coords[hull.vertices]],fill=255)
  hair_hull=np.array(hm)>0
  papers,pn=ndi.label(distance<70)
  border_ids=np.unique(np.r_[papers[0],papers[-1],papers[:,0],papers[:,-1]])
  exterior=np.isin(papers,border_ids[border_ids>0])
  cleared=exterior&hair_hull&mask&~guard&~drops
  mask[cleared]=False
 # A 2px antialias band samples existing local outline pigment. The RGB/alpha
 # of the opaque interior and original dark ink are never changed.
 inside=ndi.distance_transform_edt(mask);band=mask&(inside<=2.5)&~drops
 luma=v@np.array([.2126,.7152,.0722]);dark=(luma<100)&(v.max(axis=2)<145)
 F=v.copy();best=distance.copy()
 for dy in range(-2,3):
  for dx in range(-2,3):
   shifted=ndi.shift(v,(dy,dx,0),order=0,mode='nearest')
   support=ndi.shift(mask.astype(float),(dy,dx),order=0,mode='constant')>.5
   strength=np.linalg.norm(shifted-paper,axis=2)
   change=band&support&(strength>best);F[change]=shifted[change];best[change]=strength[change]
 D=F-paper
 cov=np.clip(np.sum((v-paper)*D,axis=2)/np.maximum(np.sum(D*D,axis=2),1),0,1)
 fringe=band&~dark&~drops
 alpha=mask.astype(float);alpha[fringe]=cov[fringe]
 alpha[fringe&(cov<.08)]=0
 clean=rgb.copy();decontam=fringe&(cov>=.08)&(cov<.999)
 c=cov[decontam,None]
 clean[decontam]=np.rint(np.clip((v[decontam]-(1-c)*paper)/np.maximum(c,.08),0,255)).astype(np.uint8)
 clean[alpha==0]=0
 rgba=np.dstack((clean,np.rint(alpha*255).astype(np.uint8)))
 interior=mask&(inside>3)
 assert np.array_equal(rgba[interior,:3],rgb[interior])
 assert np.all(rgba[interior,3]==255)
 assert np.all(rgba[dark&mask,3]==255)
 return rgba,{'paperRGB':paper.tolist(),'hairPaperPixelsCleared':int(cleared.sum()),'boundaryRGBPixelsChanged':int(decontam.sum()),'interiorRGBChangedPixels':0,'originalDarkInkAlphaChangedPixels':0,'protectedDropPixels':int(drops.sum())}


def main():
 records=[]
 for outfit,items in SPEC.items():
  for item in items:
   exp=item['expression']
   if exp=='neutral':continue
   source=ROOT/item['source'];raw=source.read_bytes();im=Image.open(source).convert('RGB')
   x,y,w,h=item['region'];rgb=np.array(im.crop((x,y,x+w,y+h)))
   rgba,audit=export(rgb,outfit)
   slot=f'fio-{outfit}-{exp}';native=f'assets/portrait-fio-bust/{slot}.png'
   Image.fromarray(rgba,'RGBA').save(ROOT/native,optimize=True)
   records.append({'slot':slot,'portraitFormat':'bust','nativeSrc':native,'nativeCanvas':[w,h],
    'nativeSha256':hashlib.sha256((ROOT/native).read_bytes()).hexdigest(),
    'alphaSha256':hashlib.sha256(rgba[:,:,3].tobytes()).hexdigest(),
    'originalSource':item['source'],'originalSha256':hashlib.sha256(raw).hexdigest(),
    'sourceRegion':[x,y,w,h],**audit})
   print(slot,w,h,audit['hairPaperPixelsCleared'])
 proof={'version':'native-bust-expressions-v20','imageGenerationUsed':False,
  'method':'Original complete head-and-shoulders from each approved expression cell. No face patches, resampling, pose edits, recoloring or added outlines. Only exterior transparency and edge matte cleanup.',
  'neutralChanged':False,'bustSprites':30,'records':records}
 (ROOT/'docs/FIO-BUST.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')

if __name__=='__main__':main()
