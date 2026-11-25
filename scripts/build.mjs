import fs from 'node:fs';
fs.mkdirSync('dist',{recursive:true});
for(const p of ['index.html','src','data','assets'])fs.cpSync(p,`dist/${p}`,{recursive:true});
console.log('Built static game into dist/');
