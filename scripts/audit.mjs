import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {freshState,matches,weather,CHAPTERS,LOCATIONS} from '../src/engine.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const errors=[],warnings=[];
const fail=(message)=>errors.push(message);
const readJSON=(p)=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const loaded=app.match(/const files=\[([^\]]+)\]/);
const contentFiles=loaded?[...loaded[1].matchAll(/['"]([^'"]+)['"]/g)].map(m=>m[1]):[];
if(!contentFiles.length)fail('无法从实际应用载入器解析剧情文件。');
const required=[...contentFiles.map(n=>`data/${n}.json`),'data/jobs.json','assets/manifest.json'];
const missing=required.filter(f=>!fs.existsSync(path.join(root,f)));
if(missing.length){console.error('AUDIT WAITING: 缺少实际接入文件：'+missing.join(', '));process.exit(1)}
let scenes=[],jobs=[],art={};
try{scenes=contentFiles.flatMap(n=>readJSON(`data/${n}.json`));jobs=readJSON('data/jobs.json');art=readJSON('assets/manifest.json')}catch(e){console.error('AUDIT FAILED: '+e.message);process.exit(1)}
if(!Array.isArray(scenes)||!Array.isArray(jobs)){console.error('AUDIT FAILED: 剧情和公告须为数组。');process.exit(1)}
const byId=new Map(),jobById=new Map();
const statKeys=['money','fuel','condition','mail','fioClose','fioTrust','ginaClose','ginaTrust'];
const relationKeys=['fioClose','fioTrust','ginaClose','ginaTrust'];
const routes=['fio','gina','friend','solo'];
const conditionKeys=['flag','eq','notFlag','route',...relationKeys];
const effectKeys=[...statKeys,'flags','promise','resolvePromise','rememberDay'];
const promiseIds=new Set();
function condition(c,where){
 if(c===undefined)return;
 if(!c||typeof c!=='object'||Array.isArray(c)){fail(`${where} 条件格式错误。`);return}
 for(const k of Object.keys(c))if(!conditionKeys.includes(k))fail(`${where} 未实现的条件字段 ${k}`);
 if(c.route&&!routes.includes(c.route))fail(`${where} 路线 ${c.route} 不存在。`);
 if(c.eq!==undefined&&!c.flag)fail(`${where} eq 缺少 flag。`);
 if(c.flag===c.notFlag&&c.flag&&c.eq!==false)fail(`${where} 条件自相矛盾。`);
 for(const k of relationKeys)if(c[k]!==undefined&&(!Number.isFinite(c[k])||c[k]>50))fail(`${where} ${k} 阈值不可达。`);
}
function effect(e,where){
 if(e===undefined)return;
 if(!e||typeof e!=='object'||Array.isArray(e)){fail(`${where} 效果格式错误。`);return}
 for(const k of Object.keys(e))if(!effectKeys.includes(k))fail(`${where} 未实现的效果字段 ${k}`);
 for(const k of statKeys)if(e[k]!==undefined&&!Number.isFinite(e[k]))fail(`${where} ${k} 不是有限数值。`);
 if(e.flags&&(!e.flags||typeof e.flags!=='object'||Array.isArray(e.flags)))fail(`${where} flags 格式错误。`);
 for(const [k,v] of Object.entries(e.flags||{}))if(!['boolean','number','string'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v))fail(`${where} 标记 ${k} 不是可保存的标量。`);
 if(e.rememberDay!==undefined&&(typeof e.rememberDay!=='string'||!e.rememberDay))fail(`${where} rememberDay 必须是记忆标记名称。`);
 if(e.promise){const p=e.promise;promiseIds.add(p.id);if(p.daysFromNow!==undefined&&(!Number.isInteger(p.daysFromNow)||p.daysFromNow<1||p.daysFromNow>89))fail(`${where} 邀约相对日期无效。`);if(!p.id||!['fio','gina'].includes(p.person)||!Number.isInteger(p.day)||p.day<1||p.day>90||![0,1,2].includes(p.period)||!p.title)fail(`${where} 邀约信息无效。`)}
}
for(const s of scenes){
 if(!s.id||byId.has(s.id))fail(`重复或缺失的场景 ID：${s.id}`);else byId.set(s.id,s);
 if(!s.title||!s.lines?.length)fail(`${s.id} 缺少标题或正文。`);
 if(!['main','event','date','quest','ending'].includes(s.kind))fail(`${s.id} kind 无效。`);
 if(!Number.isInteger(s.day)||s.day<0||s.day>90||!Number.isInteger(s.chapter)||s.chapter<1||s.chapter>6||![0,1,2].includes(s.period))fail(`${s.id} 日期、章节或时段无效。`);
 if(s.day>0&&Math.min(6,Math.floor((s.day-1)/15)+1)!==s.chapter)fail(`${s.id} 日期不属于其章节。`);
 if(!LOCATIONS[s.location])fail(`${s.id} 地点未接入：${s.location}`);
 if(s.route&&!routes.includes(s.route))fail(`${s.id} 路线无效。`);
 if(s.expiresDay!==undefined&&(!Number.isInteger(s.expiresDay)||s.expiresDay<s.day||s.expiresDay>90))fail(`${s.id} 截止日期无效。`);
 if(s.afterMemory&&(!s.afterMemory.flag||!Number.isInteger(s.afterMemory.days)||s.afterMemory.days<0))fail(`${s.id} 延迟回响无效。`);
 condition(s.requires,`${s.id}.requires`);effect(s.effects,`${s.id}.effects`);
 for(const [i,l] of (s.lines||[]).entries()){if(!l.speaker||typeof l.text!=='string'||!l.text.trim())fail(`${s.id} 第${i+1}行无效。`);condition(l.when,`${s.id}.lines[${i}]`)}
 for(const [i,c] of (s.choices||[]).entries()){if(!c.text)fail(`${s.id} 选项${i+1}缺少文字。`);if(c.reply!==undefined&&typeof c.reply!=='string')fail(`${s.id} 选后对白格式错误。`);condition(c.when,`${s.id}.choices[${i}]`);effect(c.effects,`${s.id}.choices[${i}]`)}
 if(s.kind==='date'){if(!Number.isFinite(s.cost)||s.cost<0||![1,2].includes(s.duration)||!s.invitation)fail(`${s.id} 约会缺少花费、时长或邀约说明。`)}
}
for(const s of scenes)for(const e of [s.effects,...(s.choices||[]).map(c=>c.effects)])if(e?.promise?.scene&&!byId.has(e.promise.scene))fail(`${s.id} 约定指向不存在的 ${e.promise.scene}`);
for(const s of scenes)for(const target of [s.next,...(s.choices||[]).map(c=>c.next)].filter(Boolean))if(!byId.has(target))fail(`${s.id} 跳转到不存在的 ${target}`);
for(const s of scenes)for(const [where,e] of [[s.id,s.effects],...(s.choices||[]).map((c,i)=>[`${s.id}选项${i+1}`,c.effects])])if(e?.resolvePromise&&!promiseIds.has(e.resolvePromise))warnings.push(`${where} 兑现的 ${e.resolvePromise} 不在静态邀约表，需由界面邀约建立。`);
for(const j of jobs){
 if(!j.id||jobById.has(j.id))fail(`重复或缺失委托 ID：${j.id}`);else jobById.set(j.id,j);
 if(!byId.has(j.scene))fail(`${j.id} 入口场景 ${j.scene} 不存在。`);
 if(!j.title||!j.client||!j.reason||!['recovery','rescue','escort','mail','survey','pirates'].includes(j.type))fail(`${j.id} 委托说明不完整。`);
 for(const k of ['reward','fuel','wear'])if(!Number.isFinite(j[k])||j[k]<0)fail(`${j.id} ${k} 无效。`);
 if(![1,2].includes(j.duration)||!Number.isInteger(j.day)||j.day<1||j.day>90)fail(`${j.id} 日期或时长无效。`);
 condition(j.requires,`${j.id}.requires`);
}

// Abstract reachability uses only roots really exposed by the app. Flag values are
// acquired from reachable choices/effects; unreferenced draft text is not counted.
const flagValues=new Map();
const acquiredPromises=new Map();
const promisedScenes=new Map();
const manualLaunches=[...new Set([...app.matchAll(/\blaunch\(['"]([^'"]+)['"]/g)].map(m=>m[1]))];
for(const id of manualLaunches)if(!byId.has(id))fail(`界面手动入口指向不存在的 ${id}`);
const putFlag=(k,v,d)=>{if(!flagValues.has(k))flagValues.set(k,new Map());const a=flagValues.get(k),key=JSON.stringify(v),old=a.get(key);if(!old||d<old.day){a.set(key,{value:v,day:d});return true}return false};
for(const value of ['accept','defer','part'])putFlag('finalChoice',value,89);
for(const flag of ['currentRain','currentTrusted'])for(const value of [true,false])putFlag(flag,value,1);
function availableDay(c,minDay=1,maxDay=90){
 if(!c)return minDay;
 let d=minDay;
 if(c.route)d=Math.max(d,31);
 for(const k of relationKeys)if(c[k]>50)return null;
 if(c.flag){const values=[...(flagValues.get(c.flag)?.values()||[])].filter(x=>c.eq===undefined?Boolean(x.value):x.value===c.eq);if(!values.length)return null;d=Math.max(d,Math.min(...values.map(x=>x.day)))}
 if(c.flag===c.notFlag&&c.flag&&c.eq!==false)return null;
 return d<=maxDay?d:null;
}
function acquire(e,day){
 let changed=false;
 if(e?.flags)for(const [k,v] of Object.entries(e.flags))changed=putFlag(k,v,day)||changed;
 if(e?.rememberDay)changed=putFlag(e.rememberDay,day,day)||changed;
 if(e?.promise){
  const p=e.promise,pday=Number.isInteger(p.daysFromNow)&&p.daysFromNow>0?Math.min(90,day+p.daysFromNow):p.day<day?Math.min(90,day+1):p.day;
  changed=putFlag('missed_'+p.id,true,pday)||changed;
  if(!acquiredPromises.has(p.id)||acquiredPromises.get(p.id)>pday){acquiredPromises.set(p.id,pday);changed=true}
  if(p.scene&&(!promisedScenes.has(p.scene)||promisedScenes.get(p.scene)>pday)){promisedScenes.set(p.scene,pday);changed=true}
 }
 return changed;
}
const reached=new Map();
const candidates=new Map();
for(const s of scenes){
 if(s.kind==='main'&&s.day>0)candidates.set(s.id,{day:s.day,end:s.expiresDay??90});
 if(['event','date'].includes(s.kind)&&s.day>0)candidates.set(s.id,{day:s.day,end:Math.min(90,s.chapter*15)});
 if(s.kind==='ending'&&s.day===90)candidates.set(s.id,{day:90,end:90});
}
let changed=true,rounds=0;
while(changed&&rounds++<scenes.length*4){
 changed=false;
 for(const [id,d] of promisedScenes){const old=candidates.get(id);if(!old||d<old.day){candidates.set(id,{day:d,end:90});changed=true}}
 for(const id of manualLaunches){const sc=byId.get(id);if(sc?.day===0&&sc.effects?.resolvePromise&&acquiredPromises.has(sc.effects.resolvePromise)){const d=acquiredPromises.get(sc.effects.resolvePromise),old=candidates.get(id);if(!old||d<old.day){candidates.set(id,{day:d,end:90});changed=true}}}
 for(const j of jobs){const d=availableDay(j.requires,j.day,90);if(d!==null){const prev=candidates.get(j.scene);if(!prev||d<prev.day){candidates.set(j.scene,{day:d,end:90});changed=true}}}
 for(const [id,window] of [...candidates]){
  const s=byId.get(id);if(!s)continue;
  let earliest=window.day;
  if(s.afterMemory){const records=[...(flagValues.get(s.afterMemory.flag)?.values()||[])].filter(v=>typeof v.value==='number');if(!records.length)continue;earliest=Math.max(earliest,Math.min(...records.map(v=>v.value+s.afterMemory.days)))}
  const d=availableDay(s.requires,earliest,Math.min(window.end,s.expiresDay??90));if(d===null)continue;
  const old=reached.get(id);if(!old||d<old.day){reached.set(id,{day:d,end:window.end});changed=true}
  changed=acquire(s.effects,d)||changed;
  const edges=[];if(s.next)edges.push({target:s.next,day:d});
  for(const c of s.choices||[]){const cd=availableDay(c.when,d,window.end);if(cd===null)continue;changed=acquire(c.effects,cd)||changed;if(c.next)edges.push({target:c.next,day:cd})}
  for(const edge of edges){const prev=candidates.get(edge.target);if(!prev||edge.day<prev.day){candidates.set(edge.target,{day:edge.day,end:window.end});changed=true}}
 }
}
const unreachable=scenes.filter(s=>!reached.has(s.id)).map(s=>s.id);
for(const id of unreachable)fail(`实际入口不可达或条件永不满足：${id}`);
for(const s of scenes){const w=reached.get(s.id);if(!w)continue;const choices=(s.choices||[]).filter(c=>availableDay(c.when,w.day,w.end)!==null);if(choices.length&&choices.every(c=>c.effects?.money<0))fail(`${s.id} 所有可见选择都要求现金，会在零现金时卡住。`)}
const textSet=new Set(),hanSet=new Set(),chapterSets=Array.from({length:6},()=>new Set());
let excludedConditionalLines=0,visibleEntries=0;
function addText(text,s,c){if(typeof text!=='string')return;const w=reached.get(s.id);if(!w)return;let possible=availableDay(c,w.day,w.end)!==null;if(c?.flag==='currentRain'){const desired=c.eq===undefined?true:c.eq;possible=possible&&Array.from({length:w.end-w.day+1},(_,i)=>w.day+i).some(d=>weather(d).includes('雨')===desired)}if(c?.flag==='currentTrusted'){const desired=c.eq===undefined?true:c.eq;if(desired&&!['fio','gina'].includes(s.route))possible=false;if(!desired&&(s.requires?.[s.route+'Trust']||0)>=8)possible=false}if(!possible){excludedConditionalLines++;return}const normalized=text.replace(/\s+/gu,'');if(!normalized)return;textSet.add(normalized);chapterSets[s.chapter-1].add(normalized);visibleEntries++}
for(const s of scenes){for(const l of s.lines||[])addText(l.text,s,l.when);for(const c of s.choices||[])if(c.reply)addText(c.reply,s,c.when)}
const length=t=>[...t].length;
const hanCount=t=>(t.match(/\p{Script=Han}/gu)||[]).length;
const uniqueCharacters=[...textSet].reduce((n,t)=>n+length(t),0);
const uniqueHanziCharacters=[...textSet].reduce((n,t)=>n+hanCount(t),0);
const perChapter=chapterSets.map((set,i)=>({chapter:i+1,title:CHAPTERS[i],uniqueCharacters:[...set].reduce((n,t)=>n+length(t),0),uniqueHanziCharacters:[...set].reduce((n,t)=>n+hanCount(t),0),scenes:scenes.filter(s=>s.chapter===i+1&&reached.has(s.id)).length}));
const heroineCounts=Object.fromEntries(['fio','gina'].map(route=>[route,{events:scenes.filter(s=>s.route===route&&s.kind==='event'&&s.day>0&&reached.has(s.id)).length,dates:scenes.filter(s=>s.route===route&&s.kind==='date'&&(s.day>0||promisedScenes.has(s.id))&&reached.has(s.id)).length}]));
const usedCG=new Set(scenes.filter(s=>reached.has(s.id)&&s.cg).map(s=>s.cg));
const referencedAssets=[];
for(const [key,value] of Object.entries(art.backgrounds||{}))referencedAssets.push({where:`backgrounds.${key}`,src:typeof value==='string'?value:value?.src});
for(const [key,value] of Object.entries(art.portraits||{}))referencedAssets.push({where:`portraits.${key}`,src:typeof value==='string'?value:value?.src});
for(const [key,value] of Object.entries(art.cgs||{}))referencedAssets.push({where:`cgs.${key}`,src:typeof value==='string'?value:value?.src});
for(const [key,value] of Object.entries(art.portraits||{}))if(value?.nativeSrc)referencedAssets.push({where:`portraits.${key}.nativeSrc`,src:value.nativeSrc});
for(const {where,src} of referencedAssets){if(typeof src!=='string'||!src){fail(`美术清单 ${where} 路径无效。`);continue}const p=path.resolve(root,src);if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile())fail(`美术文件缺失：${where} → ${src}`)}
for(const id of usedCG)if(!art.cgs?.[id])fail(`场景 CG ${id} 未在美术清单中接入。`);
for(const id of Object.keys(art.cgs||{}))if(!usedCG.has(id))fail(`相册 CG ${id} 没有可达剧情解锁。`);
for(const s of scenes){if(!reached.has(s.id))continue;if(!art.backgrounds?.[s.location]&&!art.backgrounds?.[s.location+'-day'])fail(`${s.id} 地点背景未接入：${s.location}`)}
const backgroundFiles=new Set(Object.values(art.backgrounds||{}).map(value=>JSON.stringify(typeof value==='string'?{src:value}:value)));
const endings=scenes.filter(s=>s.kind==='ending'&&s.day===90);
const baseJobs=jobs.filter(j=>!j.followup&&!j.requires);
const multiBaseJobs=baseJobs.filter(j=>j.multi);
const requirements=[];
function requirement(id,label,actual,min,max){const pass=actual>=min&&(max===undefined||actual<=max);requirements.push({id,label,actual,min,...(max!==undefined?{max}:{}),pass});if(!pass)fail(`${label}：实际 ${actual}，要求 ${max===undefined?'至少 '+min:min+'—'+max}。`)}
requirement('story-volume','可见正文去重字符',uniqueCharacters,80000,120000);
if(uniqueHanziCharacters<80000)warnings.push(`去重汉字为 ${uniqueHanziCharacters}，尚未达到按纯汉字计算的8万字目标。`);
requirement('fio-events','菲尔专属事件',heroineCounts.fio.events,12);
requirement('fio-dates','菲尔不同约会',heroineCounts.fio.dates,6);
requirement('gina-events','吉娜专属事件',heroineCounts.gina.events,12);
requirement('gina-dates','吉娜不同约会',heroineCounts.gina.dates,6);
requirement('base-jobs','手工初始委托',baseJobs.length,18);
requirement('multi-jobs','多阶段初始委托',multiBaseJobs.length,6);
requirement('endings','专属及共同结局',endings.length,8,8);
requirement('backgrounds','不同背景资源',backgroundFiles.size,10);
requirement('cgs','实际可解锁CG',usedCG.size,12);
for(const who of ['fio','gina']){
 const outfits=new Map();for(const key of Object.keys(art.portraits||{})){const m=key.match(new RegExp(`^${who}-(.+)-(neutral|smile|serious|sad|surprise|tired)$`));if(m){if(!outfits.has(m[1]))outfits.set(m[1],new Set());outfits.get(m[1]).add(m[2])}}
 requirement(who+'-outfits',who+' 至少六表情的服装套数',[...outfits.values()].filter(s=>s.size>=6).length,2);
}
const output={schemaVersion:1,generatedAt:new Date().toISOString(),sourceFiles:contentFiles.map(n=>`data/${n}.json`),countingMethod:'仅统计应用载入、入口可达且条件可满足的 lines.text 与 choices.reply；按整段去重并去空白，排除选项标签、界面、代码和未引用场景。条件互斥的原创段落分别计入。',uniqueCharacters,uniqueHanziCharacters,visibleEntries,distinctVisibleEntries:textSet.size,excludedConditionalLines,sceneCount:scenes.length,reachableSceneCount:reached.size,unreachable,manualLaunches,perChapter,heroineCounts,jobs:{total:jobs.length,base:baseJobs.length,multiBase:multiBaseJobs.length,followups:jobs.length-baseJobs.length},endings:endings.map(s=>({id:s.id,title:s.ending||s.title})),assets:{backgroundFiles:backgroundFiles.size,portraitVariants:Object.keys(art.portraits||{}).length,cgs:Object.keys(art.cgs||{}).length,referencedFiles:new Set(referencedAssets.map(x=>x.src)).size},requirements,warnings,errors,status:errors.length?'failed':'passed',testStatus:'not-yet-run'};
fs.writeFileSync(path.join(root,'data/audit.json'),JSON.stringify(output,null,2)+'\n');
const rows=perChapter.map(c=>`| ${c.chapter} · ${c.title} | ${c.scenes} | ${c.uniqueCharacters.toLocaleString('en-US')} | ${c.uniqueHanziCharacters.toLocaleString('en-US')} |`).join('\n');
const reqRows=requirements.map(r=>`| ${r.label} | ${r.actual} | ${r.pass?'通过':'未达到'} |`).join('\n');
const doc=`# 实际内容与验收记录\n\n本记录由 \`node scripts/audit.mjs\` 从游戏实际载入的文件生成。生成时间：${output.generatedAt}。\n\n## 正文统计\n\n去重可见正文 **${uniqueCharacters.toLocaleString('en-US')} 字符**，其中汉字 **${uniqueHanziCharacters.toLocaleString('en-US')} 字**。${output.countingMethod} 同一结局或路线的多次访问不重复计数；表内各章单独去重，跨章若出现相同整段，全局只计一次。\n\n| 章节 | 可达场景 | 正文字符 | 汉字 |\n|---|---:|---:|---:|\n${rows}\n\n## 内容与资源检查\n\n${reached.size}/${scenes.length} 个场景有实际入口；${jobs.length} 个公告包含 ${baseJobs.length} 个初始委托与 ${jobs.length-baseJobs.length} 个延后续单。检查了所有跳转、条件字段、数值效果、日期、时段、邀约及实际美术路径。\n\n| 要求 | 实际 | 状态 |\n|---|---:|---|\n${reqRows}\n\n## 限制与待办\n\n${warnings.length?warnings.map(w=>'- '+w).join('\n'):'静态审计未发现额外警告。'}\n\n${errors.length?'未通过项：\n\n'+errors.map(e=>'- '+e).join('\n'):'静态检查通过。'}\n\n临时插画及美术制作状态见 [ART.md](ART.md)。真实浏览器检查单独记录于 BROWSER-QA.md；本脚本检查剧情与资源，不替代画面、声音或触屏验证。\n\n<!-- TEST_RESULTS_START -->\n引擎与三条路线模拟测试尚未运行。执行 \`node scripts/test.mjs\` 更新此段。\n<!-- TEST_RESULTS_END -->\n`;
fs.writeFileSync(path.join(root,'docs/ACCEPTANCE.md'),doc);
console.log(JSON.stringify({status:output.status,scenes:reached.size,uniqueCharacters,uniqueHanziCharacters,heroineCounts,jobs:output.jobs,assets:output.assets,errors,warnings},null,2));
if(errors.length)process.exitCode=1;
