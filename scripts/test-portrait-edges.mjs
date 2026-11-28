import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
const art=JSON.parse(fs.readFileSync('assets/manifest.json','utf8'));
const proof=JSON.parse(fs.readFileSync('docs/PORTRAIT-EDGES.json','utf8'));
const before=JSON.parse(execFileSync('git',['show',proof.baseline+':assets/manifest.json'],{encoding:'utf8'}));
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const clone=value=>JSON.parse(JSON.stringify(value));
function contains(path,x,y){
 let inside=false;
 for(const part of path.split('M').slice(1)){
  assert.ok(!/[^MLZ\d.,\s+-]/.test('M'+part),'Cleaned body outline is not an absolute polygon');
  const n=part.match(/[-+]?\d+(?:\.\d+)?/g).map(Number),points=[];
  for(let i=0;i<n.length;i+=2)points.push([n[i],n[i+1]]);
  for(let i=0,j=points.length-1;i<points.length;j=i++){
   const [xi,yi]=points[i],[xj,yj]=points[j];
   if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;
  }
 }
 return inside;
}
assert.equal(art.portraitEdgesVersion,'paper-edge-v13');assert.equal(proof.items.length,13);
const currentCopy=clone(art),beforeCopy=clone(before);delete currentCopy.portraitEdgesVersion;
for(const [slot,entry] of Object.entries(currentCopy.portraits)){
 delete entry.layers[0].clipPath;const previous=beforeCopy.portraits[slot];delete previous.layers[0].clipPath;
}
assert.deepEqual(currentCopy,beforeCopy,'Edge cleanup changed expression pixels, matrices, poses, outfits, framing, BG or CG');
console.log('PASS 90个立绘槽仅调整身体遮罩，其他表情层、姿势、站位和资源不变');
let holes=0,protectedPoints=0;
for(const record of proof.items){
 const bytes=fs.readFileSync(record.src),oldBytes=execFileSync('git',['show',proof.baseline+':'+record.src],{maxBuffer:8*1024*1024});
 assert.equal(sha(bytes),record.sourceSha256);assert.deepEqual(bytes,oldBytes,'Original PNG pixels changed: '+record.src);
 const entries=Object.entries(art.portraits).filter(([,e])=>e.src===record.src);assert.ok(entries.length>=6);
 for(const [slot,entry]of entries){
  const path=entry.layers[0].clipPath,oldPath=before.portraits[slot].layers[0].clipPath;
  assert.equal(sha(path),record.newClipPathSha256);assert.equal(sha(oldPath),record.oldClipPathSha256);assert.notEqual(path,oldPath,'Unchanged rough edge: '+slot);
  for(const p of record.holes)assert.ok(!contains(path,p.x+.5,p.y+.5),'Background pocket filled: '+slot+' '+JSON.stringify(p));
  for(const p of record.preservePoints)assert.ok(contains(path,p.x+.5,p.y+.5),'White clothing/skin/hair clipped: '+slot+' '+JSON.stringify(p));
 }
 holes+=record.holes.length;protectedPoints+=record.preservePoints.length;
}
console.log(`PASS 13张源PNG逐字节保留，${holes}处纸底间隙透明、${protectedPoints}个白衣/帽/肤色保留点可见`);
globalThis.window={};const {artMarkup}=await import('../src/assets.js');
for(const record of proof.items){
 const entry=Object.values(art.portraits).find(e=>e.src===record.src),markup=artMarkup(entry,'portrait','edge-check','meet');
 const body=markup.match(/<clipPath id="(portrait-body-\d+)"[^>]*><path d="([^"]+)" clip-rule="evenodd" fill-rule="evenodd"\/><\/clipPath>/);
 assert.ok(body,'No even-odd body clip');assert.equal(body[2],entry.layers[0].clipPath);assert.ok(markup.includes(`<g clip-path="url(#${body[1]})">`),'Expression layers escape body contour');
}
console.log('PASS 所有表情层受同一精确外轮廓限制，内孔采用evenodd规则');
console.log(JSON.stringify({status:'passed',checks:3,sources:13,slots:90,transparentPockets:holes,protectedPoints,browserVerification:false}));
