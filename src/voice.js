/** Optional browser Chinese speech synthesis; no recordings or voice cloning. */
export function createVoicePlayer({getSettings=()=>({}),onVoicesChanged=()=>{},onError=()=>{},runtime=globalThis}={}) {
  const synth=runtime?.speechSynthesis;
  const Utterance=runtime?.SpeechSynthesisUtterance;
  const setTimer=typeof runtime?.setTimeout==='function'?runtime.setTimeout.bind(runtime):null;
  const clearTimer=typeof runtime?.clearTimeout==='function'?runtime.clearTimeout.bind(runtime):null;
  let voices=[],active=null,rememberedKey=null,token=0,timer=null,lastError=null;
  const capable=()=>!!(synth&&typeof synth.getVoices==='function'&&typeof synth.speak==='function'&&typeof synth.cancel==='function'&&typeof Utterance==='function'&&setTimer&&clearTimer);
  const settings=()=>{try{return getSettings()||{}}catch{return {}}};
  const clamp=(value,min,max,fallback)=>{const n=Number(value);return Number.isFinite(n)?Math.min(max,Math.max(min,n)):fallback};
  const narration=speaker=>speaker==='旁白'||speaker==='行动以后'||speaker==='航行日志';
  const allowed=(s,speaker,preview)=>!s.muted&&clamp(s.master??1,0,1,1)>0&&clamp(s.voiceVolume??.9,0,1,.9)>0&&(preview||!!s.voiceEnabled)&&(preview||!narration(speaker)||!!s.voiceNarration);
  const clearWatchdog=()=>{if(timer!==null){clearTimer?.(timer);timer=null}};

  function finish({cancel=false,forget=false,error=null}={}) {
    const previous=active;
    // Invalidate before native cancel: some browsers synchronously fire errors.
    token++;
    active=null;
    clearWatchdog();
    if(forget)rememberedKey=null;
    if(cancel&&previous){try{synth.cancel()}catch{}}
    if(error&&previous){lastError=error;try{onError(error)}catch{}}
  }
  function stop(){finish({cancel:true,forget:true})}
  function syncPermissions(){if(active&&!allowed(settings(),active.speaker,active.preview))stop()}

  function refreshVoices() {
    const seen=new Set();
    let available=[];
    try{available=capable()?synth.getVoices():[]}catch{}
    voices=(Array.isArray(available)?available:[]).filter(v=>{
      if(!v||! /^(?:zh|cmn)(?:[-_]|$)/i.test(String(v.lang||'')))return false;
      const id=String(v.voiceURI||String(v.lang)+':'+String(v.name));
      if(seen.has(id))return false;
      seen.add(id);
      return true;
    });
  }
  const voiceId=v=>String(v.voiceURI||String(v.lang)+':'+String(v.name));
  const publicVoices=()=>voices.map(v=>({id:voiceId(v),name:String(v.name||''),lang:String(v.lang||''),local:!!v.localService}));
  function listVoices(){syncPermissions();refreshVoices();return publicVoices()}
  function voicesChanged(){
    refreshVoices();
    syncPermissions();
    if(!voices.length&&active)stop();
    try{onVoicesChanged(publicVoices())}catch{}
  }
  refreshVoices(); // Do not synchronously call the UI during construction.
  if(typeof synth?.addEventListener==='function'){
    synth.addEventListener('voiceschanged',voicesChanged);
  }else if(synth&&'onvoiceschanged' in synth){
    const previous=synth.onvoiceschanged;
    synth.onvoiceschanged=event=>{try{if(typeof previous==='function')previous.call(synth,event)}finally{voicesChanged()}};
  }

  function role(speaker) {
    if(/波鲁克|罗梭|porco/i.test(speaker))return {setting:'voicePorco',rate:.9,pitch:.88};
    if(/菲尔|菲儿|fio/i.test(speaker))return {setting:'voiceFio',rate:1.04,pitch:1.04};
    if(/吉娜|gina/i.test(speaker))return {setting:'voiceGina',rate:.96,pitch:.97};
    return {setting:'voiceOther',rate:1,pitch:1};
  }
  function chooseVoice(s,profile) {
    return voices.find(v=>voiceId(v)===s[profile.setting])||voices.find(v=>v.default)||voices.find(v=>/^(?:zh[-_]CN|cmn(?:[-_]Hans)?[-_]CN)$/i.test(v.lang))||voices[0];
  }
  function segments(text) {
    const maximum=120,result=[];
    const sentences=text.match(/[^。！？!?；;]+(?:[。！？!?；;]+|$)|[。！？!?；;]+/gu)||[text];
    for(const sentence of sentences){
      let chars=Array.from(sentence);
      while(chars.length){
        let cut=Math.min(maximum,chars.length);
        if(chars.length>maximum){
          for(let i=maximum-1;i>=maximum/2;i--){if(/[，、,:：]/u.test(chars[i])){cut=i+1;break}}
        }
        const part=chars.slice(0,cut).join('');
        chars=chars.slice(cut);
        const last=result.length-1;
        if(last>=0&&Array.from(result[last]+part).length<=maximum)result[last]+=part;
        else result.push(part);
      }
    }
    return result;
  }
  const current=(session,utterance)=>active===session&&session.token===token&&session.utterance===utterance;
  function armWatchdog(session,utterance,text) {
    clearWatchdog();
    const delay=Math.min(75000,Math.max(12000,7000+Array.from(text).length*350/utterance.rate));
    timer=setTimer(()=>{
      if(current(session,utterance))finish({cancel:true,error:'这句朗读等待过久，已停止。可以继续阅读字幕，或重听本句。'});
    },delay);
  }
  function queueSegment(session) {
    if(active!==session||session.token!==token)return false;
    const s=settings();
    if(!allowed(s,session.speaker,session.preview)){stop();return false}
    refreshVoices();
    const selected=chooseVoice(s,session.profile);
    if(!selected){finish({cancel:true});return false}
    try{
      const text=session.parts[session.index],utterance=new Utterance(text);
      session.utterance=utterance;
      session.voiceId=voiceId(selected);
      session.phase='queued';
      utterance.voice=selected;
      utterance.lang=selected.lang;
      utterance.volume=clamp(s.master??1,0,1,1)*clamp(s.voiceVolume??.9,0,1,.9);
      utterance.rate=clamp(clamp(s.voiceRate??1,.5,2,1)*session.profile.rate,.5,2,1);
      utterance.pitch=session.profile.pitch;
      utterance.onstart=()=>{
        if(!current(session,utterance))return;
        if(!allowed(settings(),session.speaker,session.preview)){stop();return}
        session.phase='speaking';
        armWatchdog(session,utterance,text);
      };
      utterance.onend=()=>{
        if(!current(session,utterance))return;
        clearWatchdog();
        session.index++;
        if(session.index<session.parts.length)queueSegment(session);
        else finish();
      };
      utterance.onerror=event=>{
        if(!current(session,utterance))return;
        const reason=String(event?.error||'');
        const error=/^(?:canceled|interrupted)$/.test(reason)?null:reason==='not-allowed'?'浏览器未允许朗读，请点击重听本句后再试。':'这句浏览器朗读未能完成。可以继续阅读字幕，或重听本句。';
        finish({cancel:true,error});
      };
      // Busy already includes this queued phase; never enqueue every segment.
      armWatchdog(session,utterance,text);
      synth.speak(utterance);
      return true;
    }catch{
      finish({cancel:true,error:'浏览器暂时无法开始朗读。可以继续阅读字幕，或稍后重听。'});
      return false;
    }
  }

  function play({key,text,speaker='旁白'}={},{force=false,preview=false}={}) {
    const s=settings(),who=String(speaker||'旁白'),content=String(text??'').replace(/\s+/gu,' ').trim();
    if(!capable()||!allowed(s,who,preview)||!content){stop();return false}
    refreshVoices();
    if(!voices.length){stop();return false} // Never silently select English.
    const nextKey=key==null?who+'\u0000'+content:String(key);
    if(!force&&nextKey===rememberedKey)return false;
    finish({cancel:true});
    rememberedKey=nextKey;
    lastError=null;
    const session={token,key:nextKey,speaker:who,preview:!!preview,profile:role(who),parts:segments(content),index:0,utterance:null,voiceId:'',phase:'queued'};
    active=session;
    return queueSegment(session);
  }
  function isBusy(){syncPermissions();return active!==null}
  function status(){
    syncPermissions();
    const s=settings(),supported=capable();
    return {supported,busy:active!==null,state:active?.phase||(!supported?'unsupported':s.muted?'muted':!s.voiceEnabled?'disabled':!voices.length?'no-voice':'ready'),voiceCount:voices.length,key:active?.key??rememberedKey,speaker:active?.speaker||'',voiceId:active?.voiceId||'',error:lastError};
  }
  return {supported:capable,listVoices,play,stop,isBusy,status};
}
