// Switch the game to the reviewed film-reference artwork only after every file exists.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(new URL('..',import.meta.url).pathname);
const file=path.join(root,'assets/manifest.json');
const art=JSON.parse(fs.readFileSync(file,'utf8'));
const expressions=['neutral','smile','serious','sad','surprise','tired'];
const portraits={};
for(const [who,outfits] of Object.entries({fio:['work','date','flight'],gina:['morning','work','date','stage'],porco:['work']})){
 for(const outfit of outfits)for(const expression of expressions){
  const actual=who==='gina'&&outfit==='work'?'morning':outfit;
  const src=`assets/portrait-${who}-${actual}-${expression}.png`;
  if(!fs.existsSync(path.join(root,src)))throw Error(`Missing reviewed portrait ${src}`);
  portraits[`${who}-${outfit}-${expression}`]=src;
 }
}
art.portraits=portraits;
art.styleVersion='film-reference-v2';
art.referencePolicy='角色外观以用户提供的三份电影参考集为依据；新CG采用原创剧情构图。参考PDF及个人设备路径不随游戏公开。';
// The obsolete first-generation model sheet is not used or embedded anymore.
delete art.setting;
for(const [id,cg]of Object.entries(art.cgs)){
 if(!fs.existsSync(path.join(root,cg.src)))throw Error(`Missing story CG ${id}`);
 cg.placeholder=false;cg.styleVersion='film-reference-v2';
}
art.cgs.storm.unlock='common_d66_gap';
art.cgs['first-flight'].unlock='common_d81_firstflight / friend';
art.cgs.garden.composition='第51天夜，旅馆暖窗光落在花园的旧椅、两杯咖啡和相邻的帽子上；不展示波鲁克的人脸，不替赌约标日期。';
fs.writeFileSync(file,JSON.stringify(art,null,2)+'\n');
console.log(`Integrated ${Object.keys(portraits).length} portrait slots / ${new Set(Object.values(portraits)).size} reviewed images, 12 story CGs.`);
