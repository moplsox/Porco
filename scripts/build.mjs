import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const standalone=spawnSync(process.execPath,['scripts/build-standalone.mjs'],{stdio:'inherit'});
if(standalone.status!==0)process.exit(standalone.status||1);
fs.mkdirSync('dist',{recursive:true});
fs.copyFileSync('src/index.template.html','dist/index.html');
for(const p of ['src','data','assets'])fs.cpSync(p,`dist/${p}`,{recursive:true,filter:source=>!source.includes('__pycache__')});
console.log('Built hosted game into dist/ and direct-open standalone into index.html');
