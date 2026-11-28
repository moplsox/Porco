import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {resolvePortrait} from '../src/portraits.js';
import {artMarkup} from '../src/assets.js';
import {CHAPTERS,LOCATIONS} from '../src/engine.js';

// Exercise the real dialogue renderer with authored lines and old cached saves.
// This is a source/VM regression test, not a browser or visual assessment.
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const files=[...app.match(/const files=\[([^\]]+)\]/)[1].matchAll(/['"]([^'"]+)['"]/g)].map(m=>m[1]);
const scenes=files.flatMap(f=>JSON.parse(fs.readFileSync(new URL('../data/'+f+'.json',import.meta.url),'utf8')));
const art=JSON.parse(fs.readFileSync(new URL('../assets/manifest.json',import.meta.url),'utf8'));
const people={'菲尔':'fio','吉娜':'gina','波鲁克':'porco'};
const expressions=['neutral','smile','serious','sad','surprise','tired'];
const counts={},visibleCounts={},examples={};
for(const who of Object.values(people)){
 counts[who]=Object.fromEntries(expressions.map(e=>[e,0]));
 visibleCounts[who]=Object.fromEntries(expressions.map(e=>[e,0]));
 examples[who]={};
}
for(const sc of scenes)for(const [i,line] of sc.lines.entries()){
 const who=people[line.speaker];if(!who)continue;
 const resolved=resolvePortrait(sc,line,sc.day||1),expression=resolved.expression;
 assert.ok(expressions.includes(expression),sc.id+':'+i+' has unknown expression');
 const slot=`${who}-${resolved.outfit}-${expression}`;
 assert.ok(art.portraits[slot],sc.id+':'+i+' silently falls back from missing '+slot);
 counts[who][expression]++;
 if(!sc.cg&&!sc.hidePortraits?.includes(who)){
  visibleCounts[who][expression]++;
  if(!line.when&&!examples[who][expression])examples[who][expression]={sc,i,line};
 }
}
for(const who of Object.values(people))for(const expression of expressions){
 assert.ok(visibleCounts[who][expression]>=2,`${who} ${expression} not used in actual non-CG dialogue`);
 assert.ok(examples[who][expression],`${who} ${expression} has no unconditional non-CG example`);
}
console.log('PASS 三位角色的六种表情均有非CG实际台词，所有服装/表情资源直接命中');

const renderSource=app.split('\n').find(l=>l.startsWith('function renderScene('));
assert.ok(renderSource,'Actual dialogue renderer missing');
const realCgVisible=app.split('\n').find(l=>l.startsWith('function cgVisible('));
globalThis.window={};
function render(sc,cachedLine,day){
 const calls=[];
 const state={day,lineIndex:0,activeLines:[cachedLine],pending:null};
 const context=vm.createContext({
  state,art,resolvePortrait,CHAPTERS,LOCATIONS,auto:false,skip:false,
  artMarkup:(entry,...args)=>{calls.push(entry);return artMarkup(entry,...args)},
  unlockCG(){},sceneArt:()=>art.backgrounds['cove-day'],header:()=>'',
  esc:s=>String(s??''),icon:()=>'',btn:()=>''
 });
 vm.runInContext(realCgVisible+'\n'+renderSource,context);
 context.sc=sc;
 return {markup:vm.runInContext('renderScene(sc)',context),calls,state};
}
let cacheCases=0;
for(const who of Object.values(people))for(const expression of expressions){
 const {sc,line}=examples[who][expression];
 for(const stale of [undefined,'neutral']){
  const cached=structuredClone(line);delete cached.expression;
  if(stale!==undefined)cached.expression=stale;
  const before=JSON.stringify({sc,cached});
  const resolved=resolvePortrait(sc,cached,sc.day||1);
  assert.equal(resolved.expression,expression,`${who} old save kept stale expression`);
  const expected=art.portraits[`${who}-${resolved.outfit}-${expression}`];
  const {markup,calls,state}=render(sc,cached,sc.day||1);
  assert.equal(calls.length,2,'Expected background and speaking character');
  assert.equal(calls[1],expected,'Actual renderScene chose a different expression');
  assert.ok(markup.includes(expected.portraitFormat==='bust'?'portrait-bust':'portrait-fullbody'),'Dialogue uses the wrong portrait framing');
  if(expected.nativeSrc){assert.ok(markup.includes('portrait-native-alpha'),'Original expression sprite was not rendered');assert.ok(markup.includes(expected.nativeSrc),'Wrong repaired expression image');}
  else for(const layer of expected.layers)assert.ok(markup.includes(layer.clipPath),'Donor expression layer was not rendered');
  assert.equal(JSON.stringify({sc,cached}),before,'Presentation refresh changed saved text/metadata or authored scene');
  assert.equal(state.lineIndex,0,'Presentation refresh moved dialogue progress');
  cacheCases++;
 }
}
console.log(`PASS 实际renderScene通过${cacheCases}个缺省/旧平静表情存档恢复案例，台词和位置不变`);
const {sc,line}=examples.fio.smile;
const cg=render({...sc,cg:'fio-swimming'},line,42);
assert.equal(cg.calls.length,1,'CG should hide character sprites');
assert.ok(!/portrait-(?:fullbody|bust)/.test(cg.markup),'CG has unexpected sprite over fixed illustration');
delete globalThis.window;
console.log('PASS CG按原规则显示固定插画，不叠加对话人物');
console.log(JSON.stringify({kind:'authored-expression-runtime-vm',browserVerification:false,counts,nonCgVisibleAuthoredLines:visibleCounts,oldCachedSaveCases:cacheCases},null,2));
