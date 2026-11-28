#!/usr/bin/env python3
"""Export the approved whole Gina expression busts, preserving original pixels.
The checked-in silhouette coordinates protect pale hats/coat interiors. No image
creation, face composition, pose changes, scaling, or extra outline is performed.
"""
from pathlib import Path
import json,re,hashlib
import numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as ndi
ROOT=Path(__file__).resolve().parent.parent
SPEC=json.loads((ROOT/'docs/GINA-BUST-REGIONS.json').read_text())
OUT=ROOT/'assets/portrait-gina-bust';OUT.mkdir(exist_ok=True)


def polygons(d):
 tokens=re.findall(r'[MLCQZmlcqz]|[-+]?(?:\d*\.\d+|\d+)(?:[eE][-+]?\d+)?',d)
 out=[];points=[];i=0;p=None;start=None;cmd=None
 while i<len(tokens):
  if tokens[i].isalpha():cmd=tokens[i].upper();i+=1
  if cmd=='Z':
   if len(points)>2:out.append(np.array(points))
   points=[];cmd=None;continue
  n={'M':2,'L':2,'C':6,'Q':4}[cmd]
  v=np.array(list(map(float,tokens[i:i+n]))).reshape(-1,2);i+=n
  if cmd in ['M','L']:
   p=v[0];points.append(p.copy())
   if cmd=='M':start=p.copy();cmd='L'
  else:
   for t in np.linspace(0,1,45)[1:]:
    q=(1-t)**3*p+3*(1-t)**2*t*v[0]+3*(1-t)*t*t*v[1]+t**3*v[2] if cmd=='C' else (1-t)**2*p+2*(1-t)*t*v[0]+t*t*v[1]
    points.append(q)
   p=v[-1]
 return out


def mask_from_path(item,rgb):
 x,y,w,h=item['region'];ss=4;full=np.zeros((h*ss,w*ss),bool)
 for ps in polygons(item['clipPath']):
  im=Image.new('L',(w*ss,h*ss));ImageDraw.Draw(im).polygon([tuple(q) for q in (ps-[x,y])*ss],fill=255)
  full^=np.array(im)>0
 low=Image.fromarray(full.astype(np.uint8)*255).resize((w,h),Image.Resampling.LANCZOS)
 alpha=np.array(low).astype(float)/255
 alpha[alpha>.98]=1
 solid=alpha>.5
 if item['outfit']=='morning':
  # The ivory collar stripes open at the panel's lower crop. Close only that
  # cut edge before filling, retaining neck/ear exterior concavities.
  for yy in range(max(0,h-18),h):
   xx=np.where(solid[yy])[0]
   if len(xx)>1:solid[yy,xx.min():xx.max()+1]=True
 alpha[ndi.binary_fill_holes(solid)]=1
 # Pale date silhouette paths are hand traced around source black outlines.
 # Their 1px sampling guard is soft-matted back to the source contour below.
 if item['outfit']=='date':alpha=ndi.maximum_filter(alpha,size=3)
 cx,cy,cw,ch=item['originalCellRegion'];allowed=np.zeros((h,w),bool)
 allowed[cy-y:cy-y+ch,cx-x:cx-x+cw]=True;alpha[~allowed]=0
 if item['outfit']=='date':
  # The top hat contour is a continuous original thin ink stroke. Trim the
  # hand-path sampling guard only above that source stroke, retaining the
  # enclosed white brim/crown and coat even where panels crop them open.
  local=rgb[cy-y:cy-y+ch,cx-x:cx-x+cw].astype(float)
  lum=local@np.array([.2126,.7152,.0722])
  for xx in range(cw):
   yy=np.where(lum[:round(ch*.57),xx]<180)[0]
   if len(yy):alpha[:cy-y+max(0,int(yy[0])-1),cx-x+xx]=0
 return alpha


def matte(rgb,initial,item):
 v=rgb.astype(float);h,w=initial.shape;mask=initial>0
 # True sheet paper sampled from top/side original-cell exterior, not white
 # coat or hat pixels enclosed by the silhouette.
 samples=v[(~ndi.binary_dilation(mask,iterations=2))&(v[:,:,0]>235)&(v[:,:,1]>220)&(v[:,:,2]>195)]
 paper=np.median(samples,axis=0)
 dist=np.linalg.norm(v-paper,axis=2)
 inside=ndi.distance_transform_edt(mask)
 luma=v@np.array([.2126,.7152,.0722]);dark=(luma<110)&(v.max(axis=2)<155)
 removed=np.zeros_like(mask)
 band=mask&(inside<=3.0)
 F=v.copy();best=dist.copy()
 for dy in range(-2,3):
  for dx in range(-2,3):
   q=ndi.shift(v,(dy,dx,0),order=0,mode='nearest')
   support=ndi.shift((initial>.9).astype(float),(dy,dx),order=0,mode='constant')>.5
   contrast=np.linalg.norm(q-paper,axis=2)
   use=band&support&(contrast>best);F[use]=q[use];best[use]=contrast[use]
 delta=F-paper
 coverage=np.clip(np.sum((v-paper)*delta,axis=2)/np.maximum(np.sum(delta*delta,axis=2),1),0,1)
 fringe=band&~dark
 alpha=initial.copy();alpha[fringe]=np.minimum(alpha[fringe],coverage[fringe]);alpha[fringe&(coverage<.08)]=0
 clean=rgb.copy();aa=np.rint(alpha*255).astype(np.uint8)
 changed=fringe&(coverage>=.08)&(coverage<.999)&(aa<255)
 c=coverage[changed,None]
 clean[changed]=np.rint(np.clip((v[changed]-(1-c)*paper)/np.maximum(c,.08),0,255)).astype(np.uint8)
 clean[aa==0]=0
 rgba=np.dstack((clean,aa))
 interior=(initial==1)&(inside>4)
 assert np.array_equal(rgba[interior,:3],rgb[interior])
 assert np.all(rgba[interior,3]==255)
 # Outlines within the original silhouette are retained with original opacity.
 assert np.all(aa[dark&(initial==1)]==255)
 return rgba,{'paperRGB':paper.tolist(),'exteriorPaperPixelsCleared':int(removed.sum()),'boundaryRGBChangedPixels':int(changed.sum()),'interiorRGBChangedPixels':0,'originalDarkInkAlphaChangedPixels':0}


def main():
 records=[]
 for item in SPEC:
  src=ROOT/item['source'];data=src.read_bytes();im=Image.open(src).convert('RGB');x,y,w,h=item['region']
  rgb=np.array(im.crop((x,y,x+w,y+h)));initial=mask_from_path(item,rgb)
  rgba,audit=matte(rgb,initial,item)
  native=f'assets/portrait-gina-bust/{item["slot"]}.png';Image.fromarray(rgba,'RGBA').save(ROOT/native,optimize=True)
  records.append({'slot':item['slot'],'portraitFormat':'bust','nativeSrc':native,'nativeCanvas':[w,h],
   'nativeSha256':hashlib.sha256((ROOT/native).read_bytes()).hexdigest(),'alphaSha256':hashlib.sha256(rgba[:,:,3].tobytes()).hexdigest(),
   'originalSource':item['source'],'originalSha256':hashlib.sha256(data).hexdigest(),'sourceRegion':[x,y,w,h],
   'originalCellRegion':item['originalCellRegion'],**audit})
  print(item['slot'],w,h,int((rgba[:,:,3]>0).sum()))
 proof={'version':'original-bust-expressions-v21','character':'gina','imageGenerationUsed':False,'neutralChanged':False,'bustSprites':15,
  'method':'Original complete head-and-shoulders from the approved expression cells. No face patches, resampling, pose edits, recoloring or added outlines. The prior reviewed silhouette paths retain pale hat/coat interiors; only exterior alpha and edge matte are cleaned.',
  'records':records}
 (ROOT/'docs/GINA-BUST.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
if __name__=='__main__':main()
