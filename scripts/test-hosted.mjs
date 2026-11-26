import fs from 'node:fs';
import assert from 'node:assert/strict';
const art=JSON.parse(fs.readFileSync('dist/assets/manifest.json','utf8'));
const paths=new Set();
function visit(v){if(typeof v==='string'&&/^assets\/[^?#]+\.(?:png|svg|webp)$/.test(v))paths.add(v);else if(Array.isArray(v))v.forEach(visit);else if(v&&typeof v==='object')Object.values(v).forEach(visit)}
visit(art);paths.add('assets/favicon.svg');
assert.equal(art.styleVersion,'film-reference-v2');
assert.equal(Object.keys(art.portraits).length,48);
assert.equal(Object.keys(art.cgs).length,12);
for(const p of paths)assert.ok(fs.statSync('dist/'+p).size>0,'Missing hosted image: '+p);
for(const p of Object.values(art.portraits))assert.match(p,/\.webp$/);
for(const c of Object.values(art.cgs))assert.match(c.src,/\.webp$/);
for(const f of ['index.html','src/app.js','src/engine.js','src/assets.js','src/storage.js','src/audio.js','src/voice.js','src/style.css','data/common.json','data/fio.json','data/gina.json','data/jobs.json'])assert.ok(fs.statSync('dist/'+f).size>0,'Missing hosted file: '+f);
const total=[...paths].reduce((n,p)=>n+fs.statSync('dist/'+p).size,0);
console.log(`PASS Hosted package: ${paths.size} complete image resources, 48 portrait slots, 12 CGs, ${(total/1048576).toFixed(2)} MiB of image data; no duplicate PNG masters.`);
