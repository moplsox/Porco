import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const art=JSON.parse(fs.readFileSync('dist/assets/manifest.json','utf8'));
const sourceArt=JSON.parse(fs.readFileSync('assets/manifest.json','utf8'));
const cache=JSON.parse(fs.readFileSync('.cache/standalone-art/manifest.json','utf8'));
const source=v=>typeof v==='string'?v:v.src;
const signature=v=>JSON.stringify(v);
const paths=new Set();
function visit(v){if(typeof v==='string'&&/^assets\/[^?#]+\.(?:png|svg|webp)$/.test(v))paths.add(v);else if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')Object.values(v).forEach(visit)}
function hostedPath(src){return cache[src]?.mime==='image/webp'?src.replace(/\.png$/i,'.webp'):src}
function rewritten(value){if(typeof value==='string'&&/^assets\/[^?#]+\.(?:png|svg|webp)$/.test(value))return hostedPath(value);if(Array.isArray(value))return value.map(rewritten);if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewritten(v)]));return value}
function dimensions(bytes,src){
 if(/\.png$/i.test(src)){assert.ok(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Invalid PNG '+src);return [bytes.readUInt32BE(16),bytes.readUInt32BE(20)]}
 if(/\.webp$/i.test(src)){
  assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');let result=null,lossless=false;
  for(let offset=12;offset+8<=bytes.length;){const type=bytes.toString('ascii',offset,offset+4),size=bytes.readUInt32LE(offset+4),start=offset+8;assert.ok(start+size<=bytes.length,'Truncated WebP '+src);if(type==='VP8X')result=[bytes.readUIntLE(start+4,3)+1,bytes.readUIntLE(start+7,3)+1];if(type==='VP8L'){lossless=true;assert.equal(bytes[start],0x2f);result??=[1+(bytes[start+1]|((bytes[start+2]&63)<<8)),1+((bytes[start+2]>>6)|(bytes[start+3]<<2)|((bytes[start+4]&15)<<10))]}offset=start+size+(size%2)}
  assert.ok(lossless,'Hosted WebP must use lossless encoding: '+src);assert.ok(result,'Missing dimensions '+src);return result;
 }
 return null;
}
function validateRegion(entry,label){
 assert.ok(entry&&typeof entry==='object'&&entry.src,label+' missing source');assert.ok(Array.isArray(entry.region)&&entry.region.length===4,label+' missing region');assert.ok(Array.isArray(entry.canvas)&&entry.canvas.length===2,label+' missing canvas');
 const [x,y,w,h]=entry.region,[cw,ch]=entry.canvas;assert.ok([...entry.region,...entry.canvas].every(Number.isInteger),label+' noninteger geometry');assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=cw&&y+h<=ch,label+' region out of bounds');
 assert.deepEqual(dimensions(fs.readFileSync('dist/'+entry.src),entry.src),entry.canvas,label+' declared canvas mismatch');
}

assert.equal(art.styleVersion,'film-review-v10');
assert.equal(art.portraitStyleVersion,'fullbody-parts-v12');
assert.deepEqual(art,rewritten(sourceArt),'Hosted rewrite changed content or atlas regions');
assert.equal(Object.keys(art.portraits).length,90);assert.equal(new Set(Object.values(art.portraits).map(source)).size,13);assert.equal(new Set(Object.values(art.portraits).map(signature)).size,78);
assert.equal(Object.keys(art.backgrounds).length,44);assert.equal(new Set(Object.values(art.backgrounds).map(source)).size,11);assert.equal(new Set(Object.values(art.backgrounds).map(signature)).size,33);
assert.equal(Object.keys(art.cgs).length,13);assert.equal(art.fioPortraitVersion,'native-bust-expressions-v20');assert.equal(art.characterPortraitVersion,'original-bust-expressions-v21');const nativeEntries=Object.values(art.portraits).filter(e=>e.nativeSrc);assert.equal(nativeEntries.length,82);assert.equal(new Set(nativeEntries.map(e=>e.nativeSrc)).size,71);assert.equal(nativeEntries.filter(e=>e.portraitFormat==='bust').length,75);assert.equal(Object.values(art.portraits).filter(e=>!e.nativeSrc).length,8);
for(const [slot,entry] of Object.entries(art.portraits)){
 if(entry.nativeSrc){assert.deepEqual(dimensions(fs.readFileSync('dist/'+entry.nativeSrc),entry.nativeSrc),entry.nativeCanvas,slot+' repaired native canvas mismatch');if(entry.portraitFormat==='bust'){assert.ok(entry.nativeCanvas[0]/entry.nativeCanvas[1]>.6,slot+' bust is not a head-and-shoulder canvas');assert.ok(!slot.endsWith('-neutral'),slot+' neutral lost its original full body');}else assert.deepEqual(entry.nativeCanvas,entry.region.slice(2));}
 validateRegion(entry,slot);assert.ok(entry.region[3]>entry.region[2],slot+' provenance body region is not full body');assert.ok(entry.layers?.length,slot+' missing full-body layers');
 assert.equal(entry.layers[0].src,entry.src);assert.deepEqual(entry.layers[0].canvas,entry.canvas);assert.ok(!entry.layers[0].transform,slot+' body base was transformed');
 assert.equal(entry.layers.length===1,slot.endsWith('-neutral'),slot+' expression donor missing or neutral is repainted');
 for(const [i,layer] of entry.layers.entries()){
  assert.equal(typeof layer.clipPath,'string',slot+' missing original-sheet cutout');assert.match(layer.clipPath,/^M[\s\S]+Z$/);assert.equal(layer.clipPath,sourceArt.portraits[slot].layers[i].clipPath,slot+' clipPath was treated as an asset path');
  assert.deepEqual(dimensions(fs.readFileSync('dist/'+layer.src),layer.src),layer.canvas,slot+' layer canvas mismatch');
  if(i){if(layer.transform)assert.match(layer.transform,/^matrix\([\d+eE.,\s-]+\)$/);assert.equal(layer.transform,sourceArt.portraits[slot].layers[i].transform,slot+' expression matrix changed during packaging');}
 }
}
for(const [slot,entry] of Object.entries(art.backgrounds)){validateRegion(entry,slot);assert.equal(entry.region[2]*9,entry.region[3]*16,slot+' must be 16:9')}
assert.deepEqual(art.title,art.backgrounds['cove-day']);
const proof=JSON.parse(fs.readFileSync('docs/APPROVED-PORTRAITS.json','utf8'));
assert.equal(proof.portraitStyleVersion,'fullbody-parts-v12');assert.equal(proof.sources.length,13);
 assert.ok(!proof.sources.some(v=>v.src.endsWith('/fio-strawhat-unified.png')),'Reverted unified strawhat remains active');const hat=proof.sources.find(v=>v.src==='assets/portrait-approved/fio-strawhat.png');assert.ok(hat,'Original approved strawhat missing');assert.equal(hat.kind,'approved-original');assert.equal(hat.sha256,'a4b7ac16bbb564dc269c08d8176594373852c98cee32c02eaa901f6c091578ad','Original strawhat is not the previously approved image');
assert.deepEqual(new Set(proof.sources.map(v=>v.src)),new Set(Object.values(sourceArt.portraits).map(source)),'Approved original sheet list differs from source manifest');
for(const row of proof.sources){assert.match(row.src,/^assets\/portrait-approved\/[^/]+\.png$/);const sha=crypto.createHash('sha256').update(fs.readFileSync(row.src)).digest('hex');assert.equal(sha,row.sha256,'Original approved PNG changed: '+row.src);if(row.kind==='approved-original'&&row.reviewSourceSha256)assert.equal(sha,row.reviewSourceSha256,'Review proof mismatch: '+row.src);}
assert.equal(proof.sources.filter(v=>v.kind==='approved-original').length,13);assert.equal(proof.sources.filter(v=>v.kind==='targeted-edit').length,0);
const provenSources=new Set(proof.sources.map(v=>v.src));for(const entry of Object.values(sourceArt.portraits))for(const layer of entry.layers)assert.ok(provenSources.has(layer.src),'Unproven donor PNG: '+layer.src);
const renderer=fs.readFileSync('dist/src/assets.js','utf8');
assert.ok(renderer.includes('if(value.nativeSrc)')&&renderer.includes('portrait-native-alpha'),'Hosted renderer omits original expression sprites');assert.match(renderer,/<clipPath/);assert.match(renderer,/clipPathUnits="userSpaceOnUse"/);assert.match(renderer,/clip-path="url\(#/);assert.ok(renderer.includes('value.layers.map')&&renderer.includes('layer.clipPath')&&renderer.includes('layer.transform'),'Hosted renderer does not consume body and expression layers');
assert.deepEqual(art.backgrounds,rewritten(sourceArt.backgrounds),'Backgrounds changed during portrait packaging');assert.deepEqual(art.cgs,rewritten(sourceArt.cgs),'CGs changed during portrait packaging');

visit(art);paths.add('assets/favicon.svg');
for(const p of paths){const raw=fs.readFileSync('dist/'+p);assert.ok(raw.length>0,'Missing hosted image: '+p);dimensions(raw,p)}
// PNG is kept when its lossless original is smaller. WebP is never mandatory.
const sourcePaths=new Set();function visitSource(v){if(typeof v==='string'&&/^assets\/[^?#]+\.(?:png|svg|webp)$/.test(v))sourcePaths.add(v);else if(Array.isArray(v))v.forEach(visitSource);else if(v&&typeof v==='object')Object.values(v).forEach(visitSource)}
visitSource(sourceArt);sourcePaths.add('assets/favicon.svg');
for(const src of sourcePaths){
 const output=fs.readFileSync('dist/'+hostedPath(src)),entry=cache[src];
 assert.ok(output.equals(fs.readFileSync(entry?.path||src)),'Hosted bytes differ from verified lossless source/cache: '+src);
 if(entry?.sourceSha256)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex'),entry.sourceSha256,'Stale optimization cache: '+src);
 if(entry?.sha256)assert.equal(crypto.createHash('sha256').update(output).digest('hex'),entry.sha256,'Corrupt hosted encoding: '+src);
}
for(const f of ['index.html','src/app.js','src/engine.js','src/portraits.js','src/assets.js','src/storage.js','src/audio.js','src/style.css','data/common.json','data/fio.json','data/gina.json','data/jobs.json'])assert.ok(fs.statSync('dist/'+f).size>0,'Missing hosted file: '+f);
const total=[...paths].reduce((n,p)=>n+fs.statSync('dist/'+p).size,0);
console.log(`PASS Hosted package: ${paths.size} complete lossless image resources, 90 portrait slots: 82 native bindings (75 expression busts / 7 Fio neutral full-body slots) / 71 transparent sprites and 8 unchanged legacy neutral bindings; 13 verified provenance sheets, 33 background views, 13 CGs, ${(total/1048576).toFixed(2)} MiB of image data; native PNGs included; original source regions and legacy SVG cutout paths preserved.`);
