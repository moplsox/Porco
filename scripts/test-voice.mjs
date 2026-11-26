import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoicePlayer} from '../src/voice.js';

const CHINESE={voiceURI:'voice:mandarin',name:'中文普通话',lang:'zh-CN',localService:true,default:false};
const ENGLISH={voiceURI:'voice:english',name:'English',lang:'en-US',localService:true,default:true};

function harness({voices=[ENGLISH,CHINESE],prefs={}}={}){
  const settings={voiceEnabled:true,voiceNarration:false,voiceVolume:.9,voiceRate:1,master:.5,muted:false,...prefs};
  const spoken=[],errors=[],notifications=[],timers=new Map(),listeners=new Map();
  let available=voices,nextTimer=1,cancels=0,throwSpeak=false,cancelCallback=null;
  const synth={
    pending:false,speaking:false,
    getVoices:()=>available,
    addEventListener:(name,fn)=>listeners.set(name,fn),
    speak:utterance=>{if(throwSpeak)throw Error('Native speech failure');spoken.push(utterance);synth.pending=true},
    cancel:()=>{cancels++;synth.pending=false;synth.speaking=false;cancelCallback?.()},
  };
  const runtime={speechSynthesis:synth,SpeechSynthesisUtterance:class{constructor(text){this.text=text}},setTimeout:(fn,delay)=>{const id=nextTimer++;timers.set(id,{fn,delay});return id},clearTimeout:id=>timers.delete(id)};
  const player=createVoicePlayer({runtime,getSettings:()=>settings,onError:message=>errors.push(message),onVoicesChanged:list=>notifications.push(list)});
  return {player,runtime,settings,spoken,errors,notifications,timers,synth,
    cancels:()=>cancels,setVoices:list=>{available=list},voicesChanged:()=>listeners.get('voiceschanged')?.(),
    throwOnSpeak:value=>{throwSpeak=value},onCancel:fn=>{cancelCallback=fn},
    start:(u=spoken.at(-1))=>{synth.pending=false;synth.speaking=true;u.onstart?.()},
    end:(u=spoken.at(-1))=>{synth.pending=false;synth.speaking=false;u.onend?.()},
    fireWatchdog:()=>{const [id,entry]=timers.entries().next().value;timers.delete(id);entry.fn()},
  };
}
const line=(key='line:1',text='浮筒进了水。',speaker='波鲁克')=>({key,text,speaker});

test('Chinese voice filter, stable URI IDs, deduplication and fallback IDs',()=>{
  const h=harness({voices:[ENGLISH,CHINESE,{...CHINESE,name:'duplicate URI'},
    {voiceURI:'voice:cmn',name:'普通话',lang:'cmn-Hans-CN',localService:false},
    {name:'中文备用',lang:'zh_TW',localService:true},
    {voiceURI:'not-chinese',name:'Similar prefix',lang:'zhx'},
    {voiceURI:'voice:yue',name:'Different language tag',lang:'yue-HK'}]});
  assert.equal(h.player.supported(),true);
  assert.deepEqual(h.player.listVoices(),[
    {id:'voice:mandarin',name:'中文普通话',lang:'zh-CN',local:true},
    {id:'voice:cmn',name:'普通话',lang:'cmn-Hans-CN',local:false},
    {id:'zh_TW:中文备用',name:'中文备用',lang:'zh_TW',local:true},
  ]);
  assert.equal(h.notifications.length,0,'construction must not synchronously call UI');
});

test('Empty initial voices never use English; voiceschanged enables a retry',()=>{
  const h=harness({voices:[ENGLISH]});
  assert.equal(h.player.play(line()),false);
  assert.equal(h.spoken.length,0);
  assert.equal(h.errors.length,0);
  h.setVoices([ENGLISH,CHINESE]);h.voicesChanged();
  assert.equal(h.notifications.length,1);
  assert.equal(h.notifications[0][0].id,CHINESE.voiceURI);
  assert.equal(h.player.play(line()),true,'unavailable first attempt must not mark key read');
  assert.equal(h.spoken[0].voice,CHINESE);
  assert.equal(h.spoken[0].lang,'zh-CN');
});

test('Busy includes queued utterance and clears on normal completion',()=>{
  const h=harness();assert.equal(h.player.play(line()),true);
  assert.equal(h.synth.speaking,false);
  assert.equal(h.player.isBusy(),true);
  assert.equal(h.player.status().state,'queued');
  h.start();assert.equal(h.player.status().state,'speaking');
  h.end();assert.equal(h.player.isBusy(),false);
  assert.equal(h.timers.size,0);
});

test('Same-key rerenders are silent; force replays; explicit stop permits restart',()=>{
  const h=harness();h.player.play(line());
  assert.equal(h.player.play(line()),false);assert.equal(h.spoken.length,1);
  h.end();assert.equal(h.player.play(line()),false);
  assert.equal(h.player.play(line(),{force:true}),true);
  assert.equal(h.spoken.length,2);
  h.player.stop();assert.equal(h.player.isBusy(),false);
  assert.equal(h.player.play(line()),true);
});

test('New line cancels old audio; stale callbacks cannot finish the replacement',()=>{
  const h=harness();h.player.play(line('old'));const old=h.spoken[0];
  h.onCancel(()=>old.onerror?.({error:'canceled'}));
  assert.equal(h.player.play(line('new','这是新的一句。','菲尔')),true);
  const current=h.spoken[1];assert.equal(h.cancels(),1);
  old.onstart?.();old.onend?.();old.onerror?.({error:'network'});
  assert.equal(h.player.isBusy(),true);assert.equal(h.player.status().key,'new');
  assert.equal(h.errors.length,0);assert.equal(h.timers.size,1);
  h.end(current);assert.equal(h.player.isBusy(),false);
});

test('Forced replay also isolates callbacks from the prior identical key',()=>{
  const h=harness();h.player.play(line());const old=h.spoken[0];
  h.player.play(line(),{force:true});old.onend();old.onerror({error:'network'});
  assert.equal(h.player.isBusy(),true);assert.equal(h.errors.length,0);
  h.player.stop();h.spoken[1].onend();assert.equal(h.player.isBusy(),false);
});

test('Master and independent volume multiply; requested voice falls back to Chinese',()=>{
  const second={...CHINESE,voiceURI:'voice:second',name:'第二中文声',lang:'zh-TW'};
  const h=harness({voices:[ENGLISH,CHINESE,second],prefs:{master:.6,voiceVolume:.5,voiceFio:second.voiceURI,voiceRate:1.2}});
  h.player.play(line('fio','明天再试一次。','菲尔'));
  assert.equal(h.spoken[0].volume,.3);assert.equal(h.spoken[0].voice,second);
  assert.equal(h.spoken[0].rate,1.2*1.04);assert.equal(h.spoken[0].pitch,1.04);
  h.settings.voiceGina='missing-id';h.player.play(line('gina','请把账本留下。','吉娜'));
  assert.equal(h.spoken[1].voice,CHINESE,'never fall back to default English');
  assert.equal(h.spoken[1].rate,1.2*.96);
  h.settings.voicePorco=second.voiceURI;h.player.play(line('porco','天气还行。'));
  assert.equal(h.spoken[2].voice,second);assert.equal(h.spoken[2].pitch,.88);
});

test('Default settings and explicit disable refuse speech even with force',()=>{
  const h=harness({prefs:{voiceEnabled:false}});
  assert.equal(h.player.play(line(),{force:true}),false);
  const defaults=createVoicePlayer({runtime:h.runtime});
  assert.equal(defaults.play(line()),false);
  h.settings.voiceEnabled=true;h.player.play(line());
  h.settings.voiceEnabled=false;assert.equal(h.player.isBusy(),false);
  assert.equal(h.timers.size,0);assert.equal(h.errors.length,0);
});

test('Muted and zero master/voice volume prevent or terminate silent busy time',()=>{
  for(const setting of ['master','voiceVolume']){
    const h=harness();h.settings[setting]=0;
    assert.equal(h.player.play(line(),{force:true,preview:true}),false);
    assert.equal(h.player.isBusy(),false);assert.equal(h.spoken.length,0);
    h.settings[setting]=.5;h.player.play(line());assert.equal(h.player.isBusy(),true);
    h.settings[setting]=0;assert.equal(h.player.isBusy(),false);assert.equal(h.timers.size,0);
  }
  const h=harness();h.player.play(line());h.settings.muted=true;
  assert.equal(h.player.isBusy(),false);
  assert.equal(h.player.play(line('preview'),{force:true,preview:true}),false);
});

test('Narration is optional, including post-choice action text',()=>{
  const h=harness();
  assert.equal(h.player.play(line('n1','海风翻过一页。','旁白')),false);
  assert.equal(h.player.play(line('n2','他把账付了。','行动以后')),false);
  assert.equal(h.spoken.length,0);
  h.settings.voiceNarration=true;
  assert.equal(h.player.play(line('n1','海风翻过一页。','旁白')),true);
  h.settings.voiceNarration=false;assert.equal(h.player.isBusy(),false);
});

test('Explicit preview works while disabled and narration off without bypassing mute',()=>{
  const h=harness({prefs:{voiceEnabled:false,voiceNarration:false}});
  assert.equal(h.player.play(line('sample','海风翻过一页。','旁白'),{force:true,preview:true}),true);
  assert.equal(h.player.isBusy(),true,'preview remains permitted with normal speech disabled');
  h.settings.muted=true;assert.equal(h.player.isBusy(),false);
  assert.equal(h.player.play(line('sample'),{force:true,preview:true}),false);
});

test('No Web Speech API degrades quietly without throwing',()=>{
  const errors=[];const p=createVoicePlayer({runtime:{},getSettings:()=>({voiceEnabled:true}),onError:e=>errors.push(e)});
  assert.equal(p.supported(),false);assert.deepEqual(p.listVoices(),[]);
  assert.equal(p.play(line()),false);p.stop();assert.equal(p.isBusy(),false);
  assert.equal(p.status().state,'unsupported');assert.deepEqual(errors,[]);
});

test('Long lines split at punctuation, queue one segment, and ignore duplicate old ends',()=>{
  const h=harness();const text='海风很轻，明天按时到。'.repeat(45);
  assert.equal(h.player.play(line('long',text,'菲尔')),true);
  assert.equal(h.spoken.length,1,'do not enqueue all segments');
  const first=h.spoken[0];h.end(first);
  assert.equal(h.spoken.length,2);first.onend();assert.equal(h.spoken.length,2);
  let remaining=100;
  while(h.player.isBusy()&&remaining-->0)h.end();
  assert(remaining>0);assert(h.spoken.length>2);
  assert.equal(h.spoken.map(u=>u.text).join(''),text);
  assert(h.spoken.every(u=>Array.from(u.text).length<=120));
  assert.equal(h.timers.size,0);
});

test('Long text without punctuation is bounded without breaking Unicode characters',()=>{
  const h=harness();const text='海🌊'.repeat(150);h.player.play(line('unicode',text));
  let remaining=20;while(h.player.isBusy()&&remaining-->0)h.end();
  assert(remaining>0);assert.equal(h.spoken.map(u=>u.text).join(''),text);
  assert(h.spoken.every(u=>Array.from(u.text).length<=120));
});

test('Actual native error reports one readable message and releases all state',()=>{
  const h=harness();h.player.play(line());const u=h.spoken[0];
  u.onerror({error:'network'});u.onerror({error:'network'});u.onend();
  assert.equal(h.player.isBusy(),false);assert.equal(h.timers.size,0);
  assert.equal(h.errors.length,1);assert.equal(typeof h.errors[0],'string');
  assert.match(h.errors[0],/朗读/);assert.equal(h.player.play(line()),false);
});

test('A throwing native speak degrades without an exception or stuck busy state',()=>{
  const h=harness();h.throwOnSpeak(true);
  assert.equal(h.player.play(line()),false);assert.equal(h.player.isBusy(),false);
  assert.equal(h.timers.size,0);assert.equal(h.errors.length,1);
  assert.equal(h.player.play(line()),false);assert.equal(h.errors.length,1);
});

test('Watchdog bounds queued/speaking hangs by text length and ignores late events',()=>{
  const short=harness();short.player.play(line());const shortDelay=[...short.timers.values()][0].delay;
  const long=harness();long.player.play(line('watchdog','海'.repeat(120)));const u=long.spoken[0];
  const longDelay=[...long.timers.values()][0].delay;
  assert(longDelay>shortDelay);assert(longDelay<=75000);
  long.fireWatchdog();assert.equal(long.player.isBusy(),false);
  assert.equal(long.errors.length,1);assert.equal(long.timers.size,0);
  u.onend();u.onerror({error:'network'});assert.equal(long.errors.length,1);
  short.start();assert.equal(short.timers.size,1);short.fireWatchdog();
  assert.equal(short.player.isBusy(),false);
});

test('Empty text stops prior speech; losing all Chinese voices cancels gracefully',()=>{
  const h=harness();h.player.play(line());assert.equal(h.player.play(line('empty','  ')),false);
  assert.equal(h.player.isBusy(),false);h.player.play(line('again'));
  h.setVoices([ENGLISH]);h.voicesChanged();assert.equal(h.player.isBusy(),false);
  assert.equal(h.errors.length,0);assert.deepEqual(h.player.listVoices(),[]);
});
