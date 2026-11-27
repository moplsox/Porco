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
assert.deepEqual(art,rewritten(sourceArt),'Hosted rewrite changed content or atlas regions');
assert.equal(Object.keys(art.portraits).length,78);assert.equal(new Set(Object.values(art.portraits).map(source)).size,12);assert.equal(new Set(Object.values(art.portraits).map(signature)).size,72);
assert.equal(Object.keys(art.backgrounds).length,44);assert.equal(new Set(Object.values(art.backgrounds).map(source)).size,11);assert.equal(new Set(Object.values(art.backgrounds).map(signature)).size,33);
assert.equal(Object.keys(art.cgs).length,13);
for(const [slot,entry] of Object.entries(art.portraits))validateRegion(entry,slot);
for(const [slot,entry] of Object.entries(art.backgrounds)){validateRegion(entry,slot);assert.equal(entry.region[2]*9,entry.region[3]*16,slot+' must be 16:9')}
assert.deepEqual(art.title,art.backgrounds['cove-day']);
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
for(const f of ['index.html','src/app.js','src/engine.js','src/assets.js','src/storage.js','src/audio.js','src/style.css','data/common.json','data/fio.json','data/gina.json','data/jobs.json'])assert.ok(fs.statSync('dist/'+f).size>0,'Missing hosted file: '+f);
const total=[...paths].reduce((n,p)=>n+fs.statSync('dist/'+p).size,0);
console.log(`PASS Hosted package: ${paths.size} complete lossless image resources, 78 portrait slots / 12 atlases, 33 background views, 13 CGs, ${(total/1048576).toFixed(2)} MiB of image data; all atlas regions preserved.`);
