import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {freshState,applyEffect,matches,tick,recovery,migrate,endingFor,dueMain,availableEvents,chapter,dateLabel,weekday,weather,LOCATION_GROUPS,sceneLines,scheduleConflict,affordable} from '../src/engine.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const names=['common','fio','gina','quests','endings','port'];
const missing=[...names.map(n=>`data/${n}.json`),'data/jobs.json'].filter(f=>!fs.existsSync(path.join(root,f)));
if(missing.length){console.error('TEST WAITING: 缺少 '+missing.join(', '));process.exit(1)}
const scenes=names.flatMap(n=>JSON.parse(fs.readFileSync(path.join(root,`data/${n}.json`),'utf8')));
const jobs=JSON.parse(fs.readFileSync(path.join(root,'data/jobs.json'),'utf8'));
const byId=new Map(scenes.map(s=>[s.id,s]));
const results=[],routeResults=[];
function test(name,fn){try{const detail=fn();results.push({name,status:'passed',...(detail===undefined?{}:{detail})});console.log('PASS '+name)}catch(e){results.push({name,status:'failed',error:e.stack||e.message});console.error('FAIL '+name+'\n'+e.message)}}
function clone(s){return JSON.parse(JSON.stringify(s))}

test('经济、机况和信任边界与账本',()=>{
 const s=freshState();applyEffect(s,{money:-20,fuel:10,condition:20,fioClose:3,ginaTrust:-2,flags:{sample:'value'}},'试飞准备');
 assert.equal(s.money,160);assert.equal(s.fuel,48);assert.equal(s.condition,100);assert.equal(s.fioClose,3);assert.equal(s.ginaTrust,-2);assert.equal(s.flags.sample,'value');assert.deepEqual(s.ledger[0],{day:1,period:0,source:'试飞准备',money:-20,fuel:10,condition:20});
 applyEffect(s,{money:-999,fuel:-999,condition:-999,fioClose:999,ginaTrust:-999});assert.equal(s.money,0);assert.equal(s.fuel,0);assert.equal(s.condition,0);assert.equal(s.fioClose,50);assert.equal(s.ginaTrust,-20);
});
test('约定不重复、准时兑现、逾时失信',()=>{
 const s=freshState(),p={id:'qa-weigh',person:'fio',day:1,period:1,title:'称量浮筒'};
 applyEffect(s,{promise:p});applyEffect(s,{promise:p});assert.equal(s.promises.length,1);tick(s);assert.equal(s.promises[0].status,'pending');applyEffect(s,{resolvePromise:p.id});tick(s);assert.equal(s.promises[0].status,'kept');assert.equal(s.fioTrust,0);
 const t=freshState();applyEffect(t,{promise:p});tick(t,2);assert.equal(t.promises[0].status,'missed');assert.equal(t.fioTrust,-2);assert.equal(t.flags['missed_qa-weigh'],true);tick(t,4);assert.equal(t.fioTrust,-2);
});
test('90天日历边界不会倒退',()=>{
 const s=freshState();tick(s,269);assert.deepEqual([s.day,s.period],[90,2]);tick(s,100);assert.deepEqual([s.day,s.period],[90,2]);assert.equal(chapter(1),1);assert.equal(chapter(16),2);assert.equal(chapter(90),6);assert.equal(weekday(1),'星期一');assert.equal(weekday(3),'星期三');assert.equal(weekday(4),'星期四');assert.equal(dateLabel(1),'6月1日');assert.equal(dateLabel(90),'8月29日');assert.equal(weather(63),'暴雨');
});
test('零现金零燃油仍可恢复起飞',()=>{
 const s=freshState();Object.assign(s,{money:0,fuel:0,condition:0});recovery(s);assert.deepEqual([s.money,s.fuel,s.condition,s.period],[45,6,2,1]);
 for(let i=0;i<11;i++)recovery(s);assert.equal(s.fuel,72);assert.equal(s.money,540);assert.equal(s.condition,24);assert.ok(s.ledger.every(x=>x.source.includes('水泵')));assert.ok(s.day>1);
 applyEffect(s,{money:-20,fuel:10,condition:0},'补油');assert.equal(s.fuel,80);assert.equal(s.money,520);
});
test('长委托和约会不能越过未读的周三邮袋，恰好结束时可继续主线',()=>{
 const mail=scenes.find(sc=>sc.id==='common_mailbag');assert.ok(mail);const s=freshState();Object.assign(s,{day:3,period:0});
 assert.equal(scheduleConflict(s,2,[mail])?.id,mail.id);assert.equal(scheduleConflict(s,1,[mail]),null);s.completed.push(mail.id);assert.equal(scheduleConflict(s,2,[mail]),null);
 const locked={...mail,id:'qa-locked-main',requires:{flag:'qa-main-open'}};s.completed=[];assert.equal(scheduleConflict(s,2,[locked]),null);s.flags['qa-main-open']=true;assert.equal(scheduleConflict(s,2,[locked]).id,locked.id);
 Object.assign(s,{day:2,period:2});assert.equal(scheduleConflict(s,2,[mail]),null);assert.equal(scheduleConflict(s,3,[mail]).id,mail.id);
});
test('现金不足不能透支，零现金在正式付费选择现场仍有免费行动',()=>{
 const s=freshState();s.money=0;assert.equal(affordable(s,{effects:{money:-1}}),false);assert.equal(affordable(s,{}),true);assert.equal(affordable(s,{effects:{money:20}}),true);s.money=6;assert.equal(affordable(s,{effects:{money:-6}}),true);assert.equal(affordable(s,{effects:{money:-7}}),false);
 const notice=scenes.find(sc=>sc.kind==='main'&&sc.day===59);assert.ok(notice);Object.assign(s,{day:59,period:notice.period,money:0});sceneLines(s,notice);const choices=notice.choices.filter(c=>matches(c.when,s));assert.ok(choices.some(c=>affordable(s,c)),'第59天停飞通知必须保留不花钱的负责行动');
});

test('存档往返保留对白、分支、经济、约定与所有标记',()=>{
 const s=freshState();Object.assign(s,{day:38,period:1,location:'hangar',money:237,fuel:17,condition:61,mail:8,fioClose:9,fioTrust:11,ginaClose:4,ginaTrust:6,route:'fio',sceneId:'fio_d02',lineIndex:4,pending:{reply:'让她自己回答。',next:'qa-branch'},context:{kind:'date',cost:2,promise:'qa-date',person:'fio'},ending:null,commitment:'fio'});
 s.flags={letterChoice:'message',yellowQuilt:true,fioCareer:true,logDebt:2,unused:false};s.promises=[{id:'qa-date',person:'fio',day:39,period:1,title:'晚餐',status:'pending',scene:'fio_d02'}];s.completed=['opening','qa-old'];s.jobs=['job_01'];s.ledger=[{day:37,period:0,source:'测绘',money:56,fuel:-4,condition:-1}];s.history=[{day:38,scene:'晚餐',speaker:'菲尔',text:'我的设计我来说明。'}];s.activeLines=[{speaker:'菲尔',text:'正文已过滤条件。'}];s.read=['opening:0'];s.cg=['letter','yellow-quilt'];s.dateCounts={fio:2};s.choiceHistory=[{scene:'qa-old',choice:'写下操纵记录',day:3,flags:{honestLog:true}}];
 const decoded=migrate(JSON.parse(JSON.stringify(s)));assert.deepEqual(decoded,s);decoded.flags.fioCareer=false;assert.equal(s.flags.fioCareer,true);assert.equal(decoded.lineIndex,4);assert.equal(decoded.pending.next,'qa-branch');
 for(const bad of [null,{}, {...clone(s),version:99},{...clone(s),day:0},{...clone(s),day:91},{...clone(s),completed:null}])assert.throws(()=>migrate(bad));
 const minimal=migrate({version:1,day:2,flags:{x:true},completed:[]});assert.equal(minimal.fuel,38);assert.deepEqual(minimal.promises,[]);
});
test('亲密与守信是独立关系',()=>{
 const close=freshState();Object.assign(close,{route:'fio',fioClose:20,fioTrust:-2});close.flags.fioCareer=true;assert.equal(endingFor(close),'fio_missed');
 const reliable=freshState();Object.assign(reliable,{route:'fio',fioClose:1,fioTrust:8});reliable.flags={fioCareer:true,fioDistancePlanned:true};assert.equal(endingFor(reliable),'fio_good');
 const quiet=freshState();Object.assign(quiet,{route:'gina',ginaClose:0,ginaTrust:8});quiet.flags.ginaKey=true;assert.equal(endingFor(quiet),'gina_good');
});
test('八个结局的条件与玩家最后表态均生效',()=>{
 const cases=[['fio_good','fio',8,{fioCareer:true,fioDistancePlanned:true}],['fio_open','fio',3,{}],['fio_missed','fio',2,{}],['gina_good','gina',8,{ginaKey:true}],['gina_open','gina',3,{}],['gina_missed','gina',2,{}],['friend','friend',0,{}],['solo','solo',0,{}]];
 for(const [expected,route,trust,flags] of cases){const s=freshState();s.route=route;s.fioTrust=s.ginaTrust=trust;s.flags={...flags,finalChoice:'accept'};assert.equal(endingFor(s),expected);assert.ok(byId.get(expected)?.ending)}
 for(const route of ['fio','gina']){const s=freshState();Object.assign(s,{route,fioTrust:50,ginaTrust:50});s.flags={fioCareer:true,ginaKey:true,finalChoice:'defer'};assert.equal(endingFor(s),route+'_open');s.flags.finalChoice='part';assert.equal(endingFor(s),route+'_missed')}
 const refusal=freshState();Object.assign(refusal,{route:'gina',ginaTrust:50});refusal.flags={ginaKey:true,ginaAutumnAlone:true,finalChoice:'accept'};assert.equal(endingFor(refusal),'gina_missed');
});
test('菲尔好结局必须有职业尊重与明确远距安排，数值不能代替行动',()=>{
 const s=freshState();Object.assign(s,{route:'fio',fioTrust:50,fioClose:50});s.flags.finalChoice='accept';
 assert.equal(endingFor(s),'fio_open');s.flags.fioCareer=true;assert.equal(endingFor(s),'fio_open');s.flags.fioDistancePlanned=true;assert.equal(endingFor(s),'fio_good');
 delete s.flags.fioDistancePlanned;s.flags.fioLongingSpoken=true;assert.equal(endingFor(s),'fio_good');s.flags.fioCareer=false;assert.equal(endingFor(s),'fio_open');
 s.flags.fioCareer=true;s.flags.finalChoice='part';assert.equal(endingFor(s),'fio_missed');s.flags.finalChoice='defer';assert.equal(endingFor(s),'fio_open');
});

test('强制场景排序、条件和已完成状态',()=>{
 const s=freshState(),sample=[{id:'later',kind:'main',day:2,period:0},{id:'second',kind:'main',day:1,period:1,order:2},{id:'first',kind:'main',day:1,period:1,order:1},{id:'locked',kind:'main',day:1,period:0,requires:{flag:'key'}}];
 assert.equal(dueMain(s,sample),undefined);tick(s);assert.equal(dueMain(s,sample).id,'first');s.completed.push('first');assert.equal(dueMain(s,sample).id,'second');s.completed.push('second');assert.equal(dueMain(s,sample),undefined);s.flags.key=true;assert.equal(dueMain(s,sample).id,'locked');
});
test('地图事件遵守章节、时段、路线与一次性限制',()=>{
 const sample=[{id:'a',kind:'event',day:2,period:1,chapter:1,location:'hangar',route:'fio'},{id:'b',kind:'date',day:2,period:1,chapter:1,location:'hotel',route:'gina'},{id:'c',kind:'event',day:0,period:1,chapter:1,location:'hangar'},{id:'d',kind:'event',day:2,period:1,chapter:1,location:'hangar',requires:{flag:'permit'}}];
 const s=freshState();Object.assign(s,{day:2,period:0});assert.deepEqual(availableEvents(s,sample),[]);s.period=1;assert.deepEqual(availableEvents(s,sample).map(x=>x.id),['a','b']);s.route='fio';assert.deepEqual(availableEvents(s,sample).map(x=>x.id),['a']);s.flags.permit=true;assert.deepEqual(availableEvents(s,sample,'hangar').map(x=>x.id),['a','d']);s.completed=['a'];assert.deepEqual(availableEvents(s,sample).map(x=>x.id),['d']);s.route='friend';assert.deepEqual(availableEvents(s,sample).map(x=>x.id),['b','d']);s.day=16;assert.deepEqual(availableEvents(s,sample),[]);
});

test('六个地图入口能访问全部可调度事件及约会',()=>{
 const pins=Object.keys(LOCATION_GROUPS);assert.equal(pins.length,6);
 for(const sc of scenes.filter(x=>['event','date'].includes(x.kind)&&x.day>0)){
  const s=freshState();Object.assign(s,{day:sc.day,period:sc.period,route:sc.day>=31?(sc.route||'friend'):null,fioClose:50,fioTrust:50,ginaClose:50,ginaTrust:50});
  const c=sc.requires||{};if(c.flag)s.flags[c.flag]=c.eq===undefined?true:c.eq;if(c.notFlag)delete s.flags[c.notFlag];if(c.route)s.route=c.route;
  assert.ok(pins.some(pin=>availableEvents(s,[sc],pin).some(x=>x.id===sc.id)),sc.id+'没有地图入口，地点为'+sc.location);
 }
});

test('四场重点约会的天气与信任分支由当日状态生成且互不混读',()=>{
 const ids=['fio_d01','fio_d02','gina_d01','gina_d02'];
 for(const id of ids){const sc=byId.get(id);assert.ok(sc);const conditional=sc.lines.filter(l=>['currentRain','currentTrusted'].includes(l.when?.flag));assert.ok(conditional.length>=4,id+'缺少四种状态的正式文本');
  const days=Array.from({length:sc.chapter*15-sc.day+1},(_,i)=>sc.day+i),wet=days.find(d=>weather(d).includes('雨')),dry=days.find(d=>!weather(d).includes('雨'));assert.ok(wet&&dry,id+'开放章内没有实际晴雨两种日期');
  const outputs=[];
  for(const rain of [false,true])for(const trusted of [false,true]){const s=freshState();Object.assign(s,{day:rain?wet:dry,period:sc.period,route:sc.route});s[sc.route+'Trust']=trusted?8:7;s.flags.currentRain=!rain;s.flags.currentTrusted=!trusted;
   const lines=sceneLines(s,sc);assert.equal(s.flags.currentRain,rain);assert.equal(s.flags.currentTrusted,trusted);
   for(const l of conditional){const expected=l.when.flag==='currentRain'?rain:trusted;assert.equal(lines.includes(l),l.when.eq===expected,id+'条件文本混入错误状态')}
   outputs.push(lines.map(x=>x.text).join('\n'));
  }
  assert.equal(new Set(outputs).size,4,id+'晴雨/守信状态应该产生四份不同可见文本');
 }
 const s=freshState();s.day=63;s.flags.currentTrusted=true;s.fioTrust=50;const lines=sceneLines(s,{lines:[{speaker:'旁白',text:'共通线不沿用上次约会的信任旗标。',when:{flag:'currentTrusted',eq:false}}]});assert.equal(s.flags.currentTrusted,false);assert.equal(s.flags.currentRain,true);assert.equal(lines.length,1);
});

function scoreChoice(c,route,letterChoice){
 const e=c.effects||{},f=e.flags||{};
 if(f.letterChoice!==undefined)return f.letterChoice===letterChoice?100000:-100000;
 let n=(e.mail||0)*2+(e.money||0)*.015+(e.fuel||0)*.1+(e.condition||0)*.1;
 for(const who of ['fio','gina']){const weight=route===who?4:route==='friend'?2:0.6;n+=(e[who+'Trust']||0)*weight*4+(e[who+'Close']||0)*weight;if(f[who==='fio'?'fioCareer':'ginaKey'])n+=40*weight}
 for(const k of ['honestLog','keptThursday','stormWait','dockRamp','voiceGiven','quietBoat','senderName'])if(f[k]===true)n+=5;
 if(e.resolvePromise)n+=8;
 if(e.promise)n+=1;
 return n;
}
function runScene(s,id,{route='friend',letterChoice='message',observed=[],trace=[]}={},depth=0){
 assert.ok(depth<40,'场景跳转发生循环');const sc=byId.get(id);assert.ok(sc,'不存在场景 '+id);assert.ok(matches(sc.requires,s),id+'条件不满足');
 s.sceneId=sc.id;s.lineIndex=0;s.activeLines=sceneLines(s,sc);s.location=sc.location;
 for(const l of s.activeLines){observed.push({scene:sc.id,day:s.day,text:l.text});s.history.push({day:s.day,scene:sc.title,speaker:l.speaker,text:l.text});s.lineIndex++}
 const visibleOptions=(sc.choices||[]).filter(c=>matches(c.when,s));const options=visibleOptions.filter(c=>affordable(s,c));assert.ok(!visibleOptions.length||options.length,sc.id+'没有负担得起的行动');let chosen;
 if(options.length){chosen=options.map((c,i)=>({c,i,score:scoreChoice(c,route,letterChoice)})).sort((a,b)=>b.score-a.score||a.i-b.i)[0].c;applyEffect(s,chosen.effects,sc.title);s.choiceHistory.push({scene:sc.id,choice:chosen.text,day:s.day,flags:{...chosen.effects?.flags}});if(chosen.reply)observed.push({scene:sc.id,day:s.day,text:chosen.reply})}
 if(!s.completed.includes(sc.id)){s.completed.push(sc.id);applyEffect(s,sc.effects,sc.title)}
 if(sc.cg&&!s.cg.includes(sc.cg))s.cg.push(sc.cg);
 trace.push({id:sc.id,day:s.day,period:s.period,kind:sc.kind,choice:chosen?.text});
 const next=chosen?.next||sc.next;
 if(next)return runScene(s,next,{route,letterChoice,observed,trace},depth+1);
 s.sceneId=null;s.lineIndex=0;s.activeLines=[];s.pending=null;s.context=null;if(sc.kind==='ending'||sc.ending)s.ending=sc.id;
 return {scene:sc,choice:chosen,observed,trace};
}
test('日历交试飞记录具有真实场景与履约效果，晚接任务不会立即逾期',()=>{
 const source=scenes.find(sc=>(sc.choices||[]).some(c=>c.effects?.promise?.id==='fio_log'));assert.ok(source);
 const choice=source.choices.find(c=>c.effects?.promise?.id==='fio_log');const s=freshState();Object.assign(s,{day:10,period:1});applyEffect(s,choice.effects,source.title);
 const p=s.promises.find(x=>x.id==='fio_log');assert.equal(p.day,11);assert.equal(p.status,'pending');tick(s,2);assert.deepEqual([s.day,s.period],[11,0]);assert.equal(p.status,'pending');
 const app=fs.readFileSync(path.join(root,'src/app.js'),'utf8');assert.ok(app.includes("launch('fio_log_delivery'"));assert.ok(app.includes("p.id==='fio_log'"));
 runScene(s,'fio_log_delivery',{route:'fio'});assert.equal(p.status,'kept');assert.equal(s.flags.fioLogsDelivered,true);assert.equal(s.flags.honestLog,true);assert.ok(s.completed.includes('fio_log_delivery'));assert.equal(s.fioTrust,2);
});

const mailScene=scenes.find(s=>(s.choices||[]).some(c=>c.effects?.flags?.letterChoice));
test('周三掉信的三个行动具有不同而可恢复的经济后果',()=>{
 assert.ok(mailScene,'缺少正式掉信事件');assert.equal(mailScene.day,3);assert.equal(mailScene.period,1);
 const snapshots=[];
 for(const letterChoice of ['return','search','message']){const s=freshState();s.day=3;s.period=1;applyEffect(s,{promise:{id:'weigh',person:'fio',day:3,period:2,title:'称量新浮筒'}});const observed=[];runScene(s,mailScene.id,{letterChoice,observed});assert.equal(s.flags.letterChoice,letterChoice);const expected={return:{money:208,fuel:32,trust:2,status:'kept',flag:'weighedOnTime'},search:{money:220,fuel:25,trust:-2,status:'missed',flag:'missedWeigh'},message:{money:214,fuel:28,trust:1,status:'rescheduled',flag:'weighRescheduled'}}[letterChoice];assert.equal(s.money,expected.money);assert.equal(s.fuel,expected.fuel);assert.equal(s.fioTrust,expected.trust);assert.equal(s.promises[0].status,expected.status);assert.equal(s.flags[expected.flag],true);tick(s,1);assert.deepEqual([s.day,s.period],[3,2],'正式邮袋委托占用一个下午');tick(s,1);assert.deepEqual([s.day,s.period],[4,0]);assert.equal(s.fioTrust,expected.trust,'失信不得重复扣罚');assert.equal(s.money,expected.money);assert.equal(s.fuel,expected.fuel);snapshots.push({choice:letterChoice,money:s.money,fuel:s.fuel,fioTrust:s.fioTrust,promiseStatus:s.promises[0].status,flags:s.flags});
 const nextLines=scenes.filter(sc=>sc.day===4).flatMap(sc=>sc.lines).filter(l=>l.when?.flag==='letterChoice'&&l.when.eq===letterChoice);assert.ok(nextLines.length>0,letterChoice+'缺少次日条件反馈');assert.ok(nextLines.every(l=>matches(l.when,s)));
 const lateLines=scenes.filter(sc=>sc.day===76).flatMap(sc=>sc.lines).filter(l=>l.when?.flag==='letterChoice'&&l.when.eq===letterChoice);assert.ok(lateLines.length>0,letterChoice+'缺少第76天回响');assert.ok(lateLines.every(l=>matches(l.when,s)));
 const wrong=scenes.filter(sc=>sc.day===4||sc.day===76).flatMap(sc=>sc.lines).filter(l=>l.when?.flag==='letterChoice'&&l.when.eq!==letterChoice);assert.ok(wrong.every(l=>!matches(l.when,s)));
 }
 assert.equal(new Set(snapshots.map(s=>s.money+':'+s.fuel)).size,3);assert.ok(snapshots.find(s=>s.choice==='return').fioTrust>snapshots.find(s=>s.choice==='search').fioTrust);return snapshots;
});

function simulateRoute(route,letterChoice){
 const s=freshState(),observed=[],trace=[],budget={recoveries:0,refuels:0};let steps=0;
 while(++steps<700){
  let due;while((due=dueMain(s,scenes))){runScene(s,due.id,{route,letterChoice,observed,trace});if(due.id==='common_mailbag')tick(s,1);assert.ok(trace.length<500,'主线反复执行')}
  if(s.day>=31&&!s.route)s.route=route;
  if(s.day>=89&&!s.flags.finalChoice)s.flags.finalChoice='accept';
  if(s.day>=90&&s.period>=2){runScene(s,endingFor(s),{route,letterChoice,observed,trace});break}
  const events=availableEvents(s,scenes).filter(sc=>(!sc.route||route==='friend'||route==='solo'||sc.route===route)&&(sc.kind!=='date'||!scheduleConflict(s,sc.duration||1,scenes))).sort((a,b)=>a.day-b.day||(a.order||0)-(b.order||0)||a.id.localeCompare(b.id));
  const event=events[0];
  if(event){
   if(s.money<(event.cost||0)){recovery(s);budget.recoveries++;continue}
   if(event.cost)applyEffect(s,{money:-event.cost},event.title+' 花费');
   runScene(s,event.id,{route,letterChoice,observed,trace});tick(s,event.kind==='date'?(event.duration||1):1);continue;
  }
  const job=jobs.find(j=>j.day<=s.day&&!s.jobs.includes(j.id)&&matches(j.requires,s)&&!scheduleConflict(s,j.duration,scenes));
  if(job){
   if(s.condition<Math.max(20,job.wear)||s.fuel<job.fuel){if(s.money>=20&&s.fuel<job.fuel){applyEffect(s,{money:-20,fuel:10},'航前补给');budget.refuels++;continue}if(s.money>=10&&s.condition<Math.max(20,job.wear)){applyEffect(s,{money:-10,condition:20},'航前维修');continue}recovery(s);budget.recoveries++;continue}
   applyEffect(s,{fuel:-job.fuel,condition:-job.wear},job.title+' 航前');runScene(s,job.scene,{route,letterChoice,observed,trace});s.jobs.push(job.id);tick(s,job.duration);continue;
  }
  tick(s);
 }
 assert.ok(steps<700,'路线模拟没有抵达结局');assert.equal(s.day,90);assert.equal(s.flags.letterChoice,letterChoice);assert.ok(s.jobs.length>=1,'没有实际完成委托');
 const expected=route==='friend'?'friend':route+'_good';assert.equal(s.ending,expected,route+' 没有通过实际行动达到好结局');
 const applicableMain=scenes.filter(sc=>sc.kind==='main'&&sc.day>0&&matches(sc.requires,s));assert.ok(applicableMain.every(sc=>s.completed.includes(sc.id)),'存在未走到的强制主线');
 const ownEvents=scenes.filter(sc=>sc.route===route&&sc.kind==='event'&&sc.day>0);const ownDates=scenes.filter(sc=>sc.route===route&&sc.kind==='date'&&sc.day>0);
 if(route!=='friend'){assert.ok(ownEvents.every(sc=>s.completed.includes(sc.id)),route+' 未实际走完所有专属事件：'+ownEvents.filter(sc=>!s.completed.includes(sc.id)).map(x=>x.id));assert.ok(ownDates.every(sc=>s.completed.includes(sc.id)),route+' 未实际走完所有不同约会：'+ownDates.filter(sc=>!s.completed.includes(sc.id)).map(x=>x.id))}
 for(const day of [4,76]){const expected=scenes.filter(sc=>sc.day===day).flatMap(sc=>sc.lines).filter(l=>l.when?.flag==='letterChoice'&&l.when.eq===letterChoice);assert.ok(expected.length>0);assert.ok(expected.some(l=>observed.some(o=>o.text===l.text)),route+' 在第'+day+'天未看到其掉信回响')}
 const yellow=observed.filter(o=>/马泰奥|黄.{0,8}(铁盒|饼干)/u.test(o.text));assert.ok(yellow.length>0,'实际路线没有收件人与铁盒识别');
 const restored=migrate(clone(s));assert.deepEqual(restored,s,'完整路线的存档不能恢复');
 return {route,mailChoice:letterChoice,ending:s.ending,days:s.day,mainScenes:trace.filter(x=>x.kind==='main').length,playedScenes:s.completed.length,heroineEvents:scenes.filter(x=>x.day>0&&x.kind==='event'&&['fio','gina'].includes(x.route)&&s.completed.includes(x.id)).length,dates:scenes.filter(x=>x.day>0&&x.kind==='date'&&['fio','gina'].includes(x.route)&&s.completed.includes(x.id)).length,jobs:s.jobs.length,finalMoney:s.money,finalFuel:s.fuel,fioTrust:s.fioTrust,ginaTrust:s.ginaTrust,...budget};
}
for(const [route,choice] of [['fio','message'],['gina','return'],['friend','search']])test('完整时间顺序实跑：'+route+' / 掉信 '+choice,()=>{const result=simulateRoute(route,choice);routeResults.push(result);return result});

const failed=results.filter(t=>t.status==='failed');
const summary={generatedAt:new Date().toISOString(),status:failed.length?'failed':'passed',passed:results.length-failed.length,total:results.length,routes:routeResults,checks:results};
const auditFile=path.join(root,'data/audit.json');
if(fs.existsSync(auditFile)){const audit=JSON.parse(fs.readFileSync(auditFile,'utf8'));audit.testStatus=summary.status;audit.tests=summary;fs.writeFileSync(auditFile,JSON.stringify(audit,null,2)+'\n')}
const acceptance=path.join(root,'docs/ACCEPTANCE.md');
if(fs.existsSync(acceptance)){
 const routeRows=routeResults.map(r=>`| ${r.route} | ${r.mailChoice} | ${r.playedScenes} | ${r.heroineEvents} | ${r.dates} | ${r.jobs} | ${r.ending} |`).join('\n');
 const report=`<!-- TEST_RESULTS_START -->\n## 引擎与路线实跑\n\n\`node scripts/test.mjs\`：${summary.passed}/${summary.total} 项通过。生成时间：${summary.generatedAt}。\n\n使用正式引擎按上午、下午、夜晚顺序推进90天，读取正式场景、正式选项与真实效果，不直接赋予好结局标记。完成委托、支付约会费用与油耗；资金不足时使用正式恢复动作。以下为确定性策略模拟，浏览器手动交互另行验收。\n\n| 路线 | 周三决定 | 已玩场景 | 专属事件 | 约会 | 委托 | 抵达结局 |\n|---|---|---:|---:|---:|---:|---|\n${routeRows}\n\n检查覆盖存档当前场景与对白位置往返、约定兑现和失约、90天上限、零油零钱恢复、八结局条件、夏末明确表态、地图事件时段、主线排序、长委托/约会冲突拦截、零现金选择保护、职业与远距关键行动、四场约会的晴雨和信任文本差异、掉信三种经济后果及第4天/第76天条件回响。\n\n${failed.length?'失败项：\n\n'+failed.map(t=>'- '+t.name+'：'+t.error.split('\n')[0]).join('\n'):'引擎与三条路线模拟均通过。'}\n<!-- TEST_RESULTS_END -->`;
 fs.writeFileSync(acceptance,fs.readFileSync(acceptance,'utf8').replace(/<!-- TEST_RESULTS_START -->[\s\S]*?<!-- TEST_RESULTS_END -->/,report));
}
console.log(JSON.stringify({status:summary.status,passed:summary.passed,total:summary.total,routes:routeResults},null,2));
if(failed.length)process.exitCode=1;
