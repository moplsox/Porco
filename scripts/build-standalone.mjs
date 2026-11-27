import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('src/app.js');
const names=[...app.match(/const files=\[([^\]]+)\]/)[1].matchAll(/['"]([^'"]+)['"]/g)].map(m=>m[1]);
const encoded=spawnSync('python3',[path.join(root,'scripts/encode-standalone-art.py')],{cwd:root,encoding:'utf8'});
if(encoded.status!==0)throw Error(encoded.stderr||'Unable to encode standalone art');
process.stdout.write(encoded.stdout);
const cache=JSON.parse(read('.cache/standalone-art/manifest.json'));
const art=JSON.parse(read('assets/manifest.json'));
const assetPaths=new Set(['assets/favicon.svg']);
function collect(value){if(typeof value==='string'&&/^assets\/[^?#]+\.(?:png|svg|webp)$/.test(value))assetPaths.add(value);else if(Array.isArray(value))value.forEach(collect);else if(value&&typeof value==='object')Object.values(value).forEach(collect)}
collect(art);
const assets={};
for(const original of [...assetPaths].sort()){
 const entry=cache[original];
 const relative=entry?.path||original;
 const bytes=fs.readFileSync(path.join(root,relative));
 const mime=entry?.mime||(original.endsWith('.svg')?'image/svg+xml':'image/png');
 assets[original]={mime,data:bytes.toString('base64')};
}
const payload={files:Object.fromEntries(names.map(n=>[n,JSON.parse(read(`data/${n}.json`))])),jobs:JSON.parse(read('data/jobs.json')),art,stats:JSON.parse(read('data/audit.json')),assets};
const moduleIds=['engine','storage','assets','portraits','audio','app'];
function moduleCode(name){
 let source=read(`src/${name}.js`);
 const exported=[...source.matchAll(/\bexport\s+(?:async\s+)?(?:const|let|var|function)\s+(\w+)/g)].map(m=>m[1]);
 source=source.replace(/^import\s+\{([^}]+)\}\s+from\s+['"]\.\/(\w+)\.js['"];?\s*$/gm,(_,bindings,id)=>`const {${bindings}}=__${id};`);
 source=source.replace(/\bexport\s+(?=(?:async\s+)?(?:const|let|var|function)\b)/g,'');
 if(/^\s*(?:import|export)\s/m.test(source))throw Error(`Unsupported module syntax in ${name}`);
 return name==='app'?`(()=>{\n${source}\n})();`:`const __${name}=(()=>{\n${source}\nreturn {${exported.map(n=>`get ${n}(){return ${n}}`).join(',')}};\n})();`;
}
let script=`'use strict';\nconst embeddedNode=document.getElementById('adriatic-data');window.__ADRIATIC_EMBEDDED__=JSON.parse(embeddedNode.textContent);embeddedNode.remove?.();\n${moduleIds.map(moduleCode).join('\n')}`;
// The standalone loader only reads the embedded payload. Remove the unused hosted
// network fallback entirely so the shipped script contains no fetch dependency.
script=script.replace(/const r=await Promise\.all\(files\.map\(f=>fetch\([\s\S]*?try\{stats=await fetch\('data\/audit\.json'\)[\s\S]*?\}catch\{\};render\(\)/, "throw Error('离线剧情数据缺失')");
if(/\bfetch\s*\(/.test(script))throw Error('Standalone still contains a fetch dependency');
script=script.replace(/<\/script/gi,'<\\/script');
const serialized=JSON.stringify(payload).replace(/</g,'\\u003c');
let html=read('src/index.template.html');
const favicon=assets['assets/favicon.svg'];
html=html.replace('<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">',`<link rel="icon" href="data:${favicon.mime};base64,${favicon.data}" type="image/svg+xml">`);
html=html.replace('<link rel="stylesheet" href="src/style.css">',()=>`<style>${read('src/style.css').replace(/<\/style/gi,'<\\/style')}</style>`);
html=html.replace('<script type="module" src="src/app.js"></script>',()=>`<script type="application/json" id="adriatic-data">${serialized}</script><script id="adriatic-runtime">${script}</script>`);
if(/<(?:script|link)\b[^>]*(?:src|href)=["'](?:src|assets|data)\//i.test(html))throw Error('Standalone contains an external code or asset reference');
const buffer=Buffer.from(html,'utf8');
if(buffer.length>=100*1024*1024)throw Error('Standalone exceeds GitHub single-file size limit');
fs.writeFileSync(path.join(root,'index.html'),buffer);
const report={bytes:buffer.length,sha256:crypto.createHash('sha256').update(buffer).digest('hex'),assets:assetPaths.size,scenes:Object.values(payload.files).flat().length,networkDependencies:0};
fs.writeFileSync(path.join(root,'.cache/standalone-art/build.json'),JSON.stringify(report,null,2)+'\n');
console.log(`Built standalone index.html: ${(buffer.length/1024/1024).toFixed(2)} MiB, ${report.assets} embedded images, ${report.scenes} scenes; no network dependencies.`);
