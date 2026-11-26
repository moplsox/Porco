import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const standalone=spawnSync(process.execPath,['scripts/build-standalone.mjs'],{stdio:'inherit'});
if(standalone.status!==0)process.exit(standalone.status||1);
const manifest=JSON.parse(fs.readFileSync('assets/manifest.json','utf8'));
const cache=JSON.parse(fs.readFileSync('.cache/standalone-art/manifest.json','utf8'));
// Source PNGs remain the editable masters. Hosted output uses the very same
// lossless encodings as the offline file, without shipping duplicate originals.
fs.rmSync('dist',{recursive:true,force:true});
fs.mkdirSync('dist/assets',{recursive:true});
fs.copyFileSync('src/index.template.html','dist/index.html');
for(const p of ['src','data'])fs.cpSync(p,`dist/${p}`,{recursive:true});
const copied=new Set();
function outputAsset(source){
 const entry=cache[source];
 const target=entry?.mime==='image/webp'?source.replace(/\.png$/i,'.webp'):source;
 if(!copied.has(target)){
  fs.mkdirSync(path.dirname(`dist/${target}`),{recursive:true});
  fs.copyFileSync(entry?.path||source,`dist/${target}`);copied.add(target);
 }
 return target;
}
function rewrite(value){
 if(typeof value==='string'&&/^assets\/[^?#]+\.(?:png|svg|webp)$/.test(value))return outputAsset(value);
 if(Array.isArray(value))return value.map(rewrite);
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v)]));
 return value;
}
const hosted=rewrite(manifest);outputAsset('assets/favicon.svg');
fs.writeFileSync('dist/assets/manifest.json',JSON.stringify(hosted,null,2)+'\n');
console.log(`Built hosted game into dist/ with ${copied.size} optimized images; direct-open standalone is index.html.`);
