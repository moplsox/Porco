import assert from 'node:assert/strict';
import fs from 'node:fs';
import {freshState,applyEffect,tick,sceneLines,dueMain,migrate,weather,matches} from '../src/engine.js';
const all=JSON.parse(fs.readFileSync(new URL('../data/fio.json',import.meta.url),'utf8'));
const scenes=all.filter(s=>s.id.startsWith('fio_swim_'));
const byId=new Map(scenes.map(s=>[s.id,s]));
const visit=byId.get('fio_swim_shore');
const invitation=byId.get('fio_swim_invitation');
function stateAt(day,period=0,route='fio'){return Object.assign(freshState(),{day,period,route});}
function finish(s,sc){applyEffect(s,sc.effects,sc.title);s.completed.push(sc.id);}
function choose(s,sc,index){const c=sc.choices.filter(c=>matches(c.when,s))[index];assert.ok(c);applyEffect(s,c.effects,sc.title);finish(s,sc);return c;}
let passed=0;
function test(name,fn){fn();passed++;console.log('PASS '+name)}
test('菲尔主动邀请，有接受、改约和拒绝的正式选择',()=>{
 assert.equal(invitation.kind,'main');assert.equal(invitation.day,40);assert.ok(invitation.lines.some(l=>l.speaker==='菲尔'&&/我找你/.test(l.text)));
 for(const [index,expectedDay] of [[0,42],[1,44]]){const s=stateAt(40);choose(s,invitation,index);assert.equal(s.promises.length,1);assert.equal(s.promises[0].day,expectedDay);assert.equal(s.promises[0].scene,visit.id);assert.equal(s.money,180);assert.equal(s.fuel,38)}
 const s=stateAt(40);choose(s,invitation,2);assert.equal(s.promises.length,0);assert.equal(s.flags.fioSwimPlan,'declined');assert.equal(s.fioTrust,0);
});
test('邀请不会在夏末或已有明确感情答复后迟到冒出',()=>{
 assert.equal(dueMain(stateAt(85),[invitation]),undefined);
 const s=stateAt(80);s.flags.finalChoice='accept';assert.equal(dueMain(s,[invitation]),undefined);
 assert.equal(dueMain(stateAt(90),[invitation]),undefined);
 const last=stateAt(84);choose(last,invitation,1);assert.equal(last.promises[0].day,88,'最后可邀约日的四天后仍在90天内');
});
test('旧存档晚于原定日期时约定顺延，不会立即过期；赴约状态存档往返',()=>{
 const s=stateAt(58,2);choose(s,invitation,0);const p=s.promises[0];assert.equal(p.day,60);assert.equal(p.period,1);assert.equal(p.status,'pending');
 const changed=stateAt(58,2);choose(changed,invitation,1);assert.equal(changed.promises[0].day,62);assert.equal(changed.promises[0].day-p.day,2,'接受与改约必须保留两天实质差异');
 const legacy=stateAt(58,2);applyEffect(legacy,{promise:{id:'legacy',person:'fio',day:42,period:1,title:'旧约定'}});assert.equal(legacy.promises[0].day,59,'无相对日期字段的旧约定沿用既有规则');
 tick(s,5);assert.deepEqual([s.day,s.period],[60,1]);assert.equal(p.status,'pending');
 s.sceneId=visit.id;s.lineIndex=3;s.activeLines=sceneLines(s,visit);s.context={kind:'date',cost:1,promise:p.id,person:'fio'};
 const restored=migrate(JSON.parse(JSON.stringify(s)));assert.deepEqual(restored,s);assert.equal(restored.activeLines[3].text,s.activeLines[3].text);assert.equal(restored.context.promise,'fio_swim_plan');
});
test('原定两个下午都是晴天，零现金零油仍可赴约',()=>{
 for(const day of [42,44]){assert.equal(weather(day).includes('雨'),false);const s=stateAt(day,1);s.money=s.fuel=0;assert.equal(visit.cost,0);assert.equal(visit.duration,1);sceneLines(s,visit);const options=visit.choices.filter(c=>matches(c.when,s));assert.equal(options.length,2);assert.ok(options.some(c=>c.next==='fio_swim_water'));assert.ok(options.every(c=>!c.effects?.money&&!c.effects?.fuel))}
});
test('改约遇雨只能去雨棚；雨棚链不会解锁晴天游泳CG',()=>{
 const s=stateAt(61,1);assert.ok(weather(s.day).includes('雨'));sceneLines(s,visit);const options=visit.choices.filter(c=>matches(c.when,s));assert.equal(options.length,1);assert.equal(options[0].next,'fio_swim_rain');assert.ok(!byId.get(options[0].next).cg);assert.ok(!byId.get(options[0].next).next);assert.ok(sceneLines(s,visit).some(l=>/今天不下水/.test(l.text)));
});
test('泳装与CG在正式链可见，亲密与职业信任分别回话',()=>{
 const s=stateAt(42,1);sceneLines(s,visit);const c=choose(s,visit,0);const water=byId.get(c.next);assert.equal(water.cg,'fio-swimming');assert.ok(water.lines.some(l=>l.speaker==='菲尔'&&l.outfit==='swim'));
 const after=byId.get('fio_swim_after');for(const trust of [0,8]){s.fioTrust=trust;const text=sceneLines(s,after).map(l=>l.text).join('');assert.equal(text.includes('验证班仍按工期表由艾达带'),trust<8);assert.equal(text.includes('那份载重记录，我愿意先听你的'),trust>=8)}
});
test('浪漫须菲尔线主动表态，吉娜/友情/独处不会被强制改线',()=>{
 const after=byId.get('fio_swim_after');for(const route of ['fio','gina','friend','solo']){const s=stateAt(42,1,route);const choices=after.choices.filter(c=>matches(c.when,s));assert.equal(choices.some(c=>c.next==='fio_swim_romance'),route==='fio');const friendly=choices.find(c=>c.next==='fio_swim_friend');applyEffect(s,friendly.effects);assert.equal(s.route,route);assert.equal(s.flags.fioSwimRomance,false);assert.ok(s.flags.fioSwimFriend)}
});
test('回响按实际赴约5天后出现，未赴约和拒绝不会提前回忆',()=>{
 const echo=byId.get('fio_swim_echo'),s=stateAt(58,1);assert.equal(dueMain(s,[echo]),undefined);finish(s,visit);finish(s,byId.get('fio_swim_romance'));assert.equal(s.flags.fioSwimVisitDay,58);s.day=62;assert.equal(dueMain(s,[echo]),undefined);s.day=63;assert.equal(dueMain(s,[echo]).id,echo.id);
 const copy=migrate(JSON.parse(JSON.stringify(s)));assert.equal(dueMain(copy,[echo]).id,echo.id);const original=stateAt(42,1);finish(original,visit);finish(original,byId.get('fio_swim_friend'));original.day=48;assert.equal(dueMain(original,[echo]),undefined);original.day=49;assert.equal(dueMain(original,[echo]).id,echo.id);
});
test('草帽在正式约会中使用，游泳分支跳转目标均存在',()=>{
 for(const id of ['fio_d01','fio_d03'])assert.equal(all.find(s=>s.id===id).portraitOutfits.fio,'strawhat');
 for(const suffix of ['water','splash','quiet','after','romance','friend','bankside','rain'])assert.ok(byId.get('fio_swim_'+suffix).hidePortraits.includes('porco'),'下水前后以第一人称保持摘镜与服装连贯：'+suffix);
 for(const sc of scenes)for(const target of [sc.next,...(sc.choices||[]).map(c=>c.next)].filter(Boolean))assert.ok(byId.has(target),target);
});
console.log(JSON.stringify({status:'passed',passed,newScenes:scenes.length},null,2));
