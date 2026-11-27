import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {portraitPlacement,resolvePortrait} from '../src/portraits.js';

// Settings/metadata checks use actual source functions and event handlers.
// This is not browser, layout or touch verification.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const audio=fs.readFileSync(path.join(root,'src/audio.js'),'utf8');
const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'src/style.css'),'utf8');
const fio=JSON.parse(fs.readFileSync(path.join(root,'data/fio.json'),'utf8'));
const byId=new Map(fio.map(s=>[s.id,s]));
const results=[];
async function test(name,fn){try{await fn();results.push({name,status:'passed'});console.log('PASS '+name)}catch(e){results.push({name,status:'failed',error:e.stack});console.error('FAIL '+name+' · '+e.message)}}
function harness(saved){
 const stored=new Map(saved===undefined?[]:[['adriatic-settings',JSON.stringify(saved)]]),variables=new Map(),listeners=new Map();
 const context=vm.createContext({storage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)},document:{documentElement:{style:{setProperty:(k,v)=>variables.set(k,v)},classList:{toggle(){}}},addEventListener:(type,callback)=>listeners.set(type,callback)},console,render(){}});
 const source=audio.replace(/^import\s+[^\n]+\n/gm,'').replace(/\bexport\s+(?=(?:let|const|function)\b)/g,'');
 vm.runInContext(source,context,{filename:'src/audio.js'});
 return {context,stored,variables,listeners,read:expr=>JSON.parse(vm.runInContext('JSON.stringify('+expr+')',context)),run:script=>vm.runInContext(script,context)};
}
function functionLine(prefix){const line=app.split('\n').find(l=>l.startsWith(prefix));assert.ok(line,'Actual source function/handler missing: '+prefix);return line;}

await test('旧设置没有新字段时默认94%，旧声音与阅读偏好保留',()=>{
 const h=harness({master:.4,speed:16,muted:true,reduceMotion:true});
 assert.equal(h.read('settings.dialogueOpacity'),.94);assert.equal(h.variables.get('--dialogue-opacity'),'0.94');
 assert.equal(h.read('settings.master'),.4);assert.equal(h.read('settings.speed'),16);assert.equal(h.read('settings.muted'),true);
 assert.ok(!h.read('Object.keys(settings)').some(k=>/voice|speech/i.test(k)),'Cancelled voice feature was restored');
});
await test('不透明度只接受有限数值，越界限制在0%至100%，损坏值恢复默认',()=>{
 const h=harness();
 for(const [input,expected] of [['-1',0],['0',0],['2',1],['.37',.37],['NaN',.94],['Infinity',.94],["'0.3'",.94],['null',.94]])assert.equal(h.read(`normalizeSettings({dialogueOpacity:${input}}).dialogueOpacity`),expected,input);
 for(const bad of [null,[],true,'broken'])assert.equal(harness(bad).read('settings.dialogueOpacity'),.94);
});
await test('实际input事件实时更新百分比、CSS背景与持久设置，重开仍恢复同值',async()=>{
 const h=harness();h.run(functionLine("document.addEventListener('input'"));
 const output={textContent:''};await h.listeners.get('input')({target:{dataset:{setting:'dialogueOpacity'},type:'range',value:'0.37',nextElementSibling:output}});
 assert.equal(h.read('settings.dialogueOpacity'),.37);assert.equal(output.textContent,'37%');assert.equal(h.variables.get('--dialogue-opacity'),'0.37');
 const saved=JSON.parse(h.stored.get('adriatic-settings'));assert.equal(saved.dialogueOpacity,.37);assert.equal(harness(saved).variables.get('--dialogue-opacity'),'0.37');
 h.run('globalThis.heldSettings=settings;settings.dialogueOpacity=.61;saveSettings()');assert.equal(h.run('heldSettings===settings'),true,'Classic bundle readers would retain stale settings after replacement');
});
await test('实际change事件保存设置，界面提供0—100%滑块及清晰文字预览',async()=>{
 const h=harness();h.run(functionLine("document.addEventListener('change'"));await h.listeners.get('change')({target:{dataset:{setting:'dialogueOpacity'},type:'range',value:'0.52'}});
 assert.equal(JSON.parse(h.stored.get('adriatic-settings')).dialogueOpacity,.52);assert.equal(h.variables.get('--dialogue-opacity'),'0.52');
 for(const prefix of ['function range(','function toggle(','function renderSettings('])h.run(functionLine(prefix));
 const markup=h.run('renderSettings()');assert.match(markup,/<input[^>]+min="0"[^>]+max="1"[^>]+step="0.01"[^>]+data-setting="dialogueOpacity"/);assert.ok(markup.includes('52%'));assert.ok(markup.includes('对白框预览'));assert.ok(markup.includes('background:rgba(250,245,232,var(--dialogue-opacity,.94))'));assert.ok(!/style="[^\"]*(?:^|;)\s*opacity\s*:/i.test(markup),'Settings preview fades its text instead of its background');
});
await test('实际对白背景使用alpha变量且不模糊人物，文字不套整体透明度',()=>{
 const blocks=[...css.matchAll(/\.dialogue-box\{([^}]*)\}/g)].map(m=>m[1]);assert.ok(blocks.length);
 assert.ok(blocks[0].includes('background:rgba(250,245,232,var(--dialogue-opacity,.94))'));assert.ok(blocks[0].includes('backdrop-filter:none'));
 for(const block of blocks)assert.ok(!/(?:^|;)\s*opacity\s*:/.test(block),'Dialogue container opacity would fade text');
 assert.deepEqual([...harness().variables.keys()],['--dialogue-opacity'],'Reading settings should not assign opacity to root/body/text');
});
await test('下水前已有换装对白展示dry，首次入水后及上岸对白展示wet，雨天保持工装',()=>{
 const shore=byId.get('fio_swim_shore'),water=byId.get('fio_swim_water');assert.equal(shore.portraitOutfits.fio,'work');assert.equal(byId.get('fio_swim_rain').portraitOutfits.fio,'work');
 assert.equal(water.lines[2].speaker,'菲尔');assert.equal(water.lines[2].text,'它自己住在口袋里。今天已经放它假了。');assert.equal(water.lines[2].portraitOutfit,'swim-dry');assert.match(water.lines[0].text,/换好衣服/);assert.match(water.lines[3].text,/走入水中/);
 for(const [i,line] of water.lines.entries())if(line.speaker==='菲尔'&&i>2)assert.equal(line.portraitOutfit,'swim-wet');
 for(const suffix of ['splash','quiet','after','romance','friend']){const sc=byId.get('fio_swim_'+suffix);assert.equal(sc.portraitOutfits.fio,'swim-wet');for(const line of sc.lines)if(line.speaker==='菲尔')assert.equal(line.portraitOutfit,'swim-wet');}
 const bank=byId.get('fio_swim_bankside');assert.equal(bank.lines[0].portraitOutfit,'work');for(const [i,line] of bank.lines.entries())if(i>0&&line.speaker==='菲尔')assert.equal(line.portraitOutfit,'swim-wet');
 assert.equal(water.cg,'fio-swimming');assert.equal(water.lines.length,12,'Existing dialogue indices must stay unchanged');assert.equal(shore.lines.length,12);
});
await test('两人对话采用相对站位，换场可轮换且读档恢复不会随机跳边',()=>{
 const scene={id:'blocking-a',location:'hangar',lines:[{speaker:'波鲁克'},{speaker:'菲尔'}]};
 assert.notEqual(portraitPlacement(scene,'porco'),portraitPlacement(scene,'fio'));
 const cloned=JSON.parse(JSON.stringify(scene));for(const who of ['fio','porco'])assert.equal(portraitPlacement(cloned,who),portraitPlacement(scene,who));
 const changed={...scene,id:'blocking-b'};assert.notEqual(portraitPlacement(scene,'fio'),portraitPlacement(changed,'fio'));
 assert.equal(portraitPlacement({...scene,portraitSides:{fio:'left'}},'fio'),'left');
 assert.equal(portraitPlacement({...scene,portraitSides:{fio:'left'}},'fio',{portraitSide:'right'}),'right');
});
await test('临时衣装优先于雨天/场景衣装，dry只在入水前，读档元数据可重复解析',()=>{
 const scene={id:'outfit-priority',location:'cove',lines:[{speaker:'菲尔'}],portraitOutfits:{fio:'flight'},portraitOutfitsRain:{fio:'work'}};
 assert.equal(resolvePortrait(scene,{speaker:'菲尔',outfit:'date',portraitOutfit:'swim-dry'},61).outfit,'swim-dry');
 assert.equal(resolvePortrait(scene,{speaker:'菲尔',outfit:'date'},61).outfit,'work');
 assert.equal(resolvePortrait(scene,{speaker:'菲尔',outfit:'date'},42).outfit,'flight');
 assert.equal(resolvePortrait({...scene,portraitOutfits:{}},{speaker:'菲尔',outfit:'date'},42).outfit,'date');
 const water=byId.get('fio_swim_water');assert.equal(resolvePortrait(water,water.lines[2],42).outfit,'swim-dry');assert.equal(resolvePortrait(water,water.lines[4],42).outfit,'swim-wet');
 const restored=JSON.parse(JSON.stringify({scene:water,line:water.lines[2],day:42}));assert.deepEqual(resolvePortrait(restored.scene,restored.line,restored.day),resolvePortrait(water,water.lines[2],42));
 assert.equal(resolvePortrait(byId.get('fio_swim_shore'),byId.get('fio_swim_shore').lines[1],61).outfit,'work');assert.equal(resolvePortrait(scene,{speaker:'旁白'},42),null);
});
await test('旧存档缓存对白缺少新展示元数据时仍按原文匹配干湿装，缓存不被修改',()=>{
 const scene=byId.get('fio_swim_water');
 for(const [index,expected] of [[2,'swim-dry'],[4,'swim-wet']]){
  const oldCached=JSON.parse(JSON.stringify(scene.lines[index]));delete oldCached.portraitOutfit;delete oldCached.portraitSide;
  oldCached.outfit='swim';const before=JSON.stringify({scene,line:oldCached,lineIndex:index});
  assert.equal(resolvePortrait(scene,oldCached,42).outfit,expected,'Old cached dialogue uses the wrong swimming outfit at index '+index);
  assert.equal(JSON.stringify({scene,line:oldCached,lineIndex:index}),before,'Presentation migration altered scene, cached dialogue or index');
 }
});
console.log(JSON.stringify({status:results.some(r=>r.status==='failed')?'failed':'passed',passed:results.filter(r=>r.status==='passed').length,total:results.length,browserVerification:false,checks:results},null,2));
if(results.some(r=>r.status==='failed'))process.exitCode=1;
