import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

// This is a classic-script/DOM-adapter smoke test, not a browser or layout test.
// Actual file:// Chromium navigation is tested separately by test-standalone.py.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const htmlFile=path.join(root,'index.html');
const html=fs.readFileSync(htmlFile,'utf8');
const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].map(m=>({attrs:m[1],text:m[2]}));
const payloadScript=scripts.find(s=>/\bid\s*=\s*["']adriatic-data["']/i.test(s.attrs));
if(!payloadScript){console.error('STANDALONE WAITING: index.html 尚无 id=adriatic-data 的真实内嵌包。');process.exit(2)}
const payload=JSON.parse(payloadScript.text);
const executable=scripts.filter(s=>!/(?:application\/json|application\/ld\+json)/i.test(s.attrs));
const results=[];
async function test(name,fn){try{const detail=await fn();results.push({name,status:'passed',...(detail===undefined?{}:{detail})});console.log('PASS '+name)}catch(e){results.push({name,status:'failed',error:e.stack||String(e)});console.error('FAIL '+name+'\n'+e.message)}}
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const decodeHTML=s=>String(s??'').replace(/<[^>]*>/g,'').replace(/&(?:amp|lt|gt|quot|#39);/g,e=>({'&amp;':'&','&lt;':'<','&gt;':'>','&quot;':'"','&#39;':"'"}[e]));
const extractAttr=(attrs,name)=>attrs.match(new RegExp('\\b'+name+'\\s*=\\s*["\']([^"\']*)["\']','i'))?.[1];
let embeddedBytes=0;
const assets=new Map();
function dimensions(buf,mime){
 if(mime==='image/png'){assert.ok(buf.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'PNG signature');return [buf.readUInt32BE(16),buf.readUInt32BE(20)]}
 if(mime==='image/webp'){
  assert.equal(buf.toString('ascii',0,4),'RIFF');assert.equal(buf.toString('ascii',8,12),'WEBP');
  let offset=12,canvas=null,lossless=false;
  while(offset+8<=buf.length){const type=buf.toString('ascii',offset,offset+4),size=buf.readUInt32LE(offset+4),start=offset+8;if(start+size>buf.length)throw Error('WebP chunk truncated');
   if(type==='VP8X'){canvas=[buf.readUIntLE(start+4,3)+1,buf.readUIntLE(start+7,3)+1]}
   if(type==='VP8L'){lossless=true;assert.equal(buf[start],0x2f);const b0=buf[start+1],b1=buf[start+2],b2=buf[start+3],b3=buf[start+4];canvas??=[1+(b0|((b1&63)<<8)),1+((b1>>6)|(b2<<2)|((b3&15)<<10))]}
   offset=start+size+(size%2);
  }
  assert.ok(canvas,'WebP dimensions missing');assert.ok(lossless,'WebP cache must be lossless');return canvas;
 }
 if(mime==='image/svg+xml'){const text=buf.toString('utf8');assert.match(text,/<svg\b/i);return null}
 if(mime==='image/jpeg'){assert.equal(buf[0],255);assert.equal(buf[1],216);return null}
 throw Error('Unsupported embedded image MIME '+mime);
}
await test('单个HTML没有外链脚本、样式或执行模块依赖',()=>{
 assert.ok(executable.length>0,'missing classic script');for(const s of scripts)assert.ok(!/\bsrc\s*=/i.test(s.attrs),'script src requires another file');
 for(const s of executable){assert.ok(!/\btype\s*=\s*["']module["']/i.test(s.attrs),'classic build still uses module');assert.ok(!/^\s*(?:import\s|export\s)/m.test(s.text),'classic build contains import/export')}
 const links=[...html.matchAll(/<link\b([^>]+)>/gi)];for(const [,attrs] of links){const href=extractAttr(attrs,'href');if(href)assert.match(href,/^(?:data:|blob:|#)/,'link needs external file: '+href)}
 const css=[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m=>m[1]).join('\n');assert.ok(!/@import\b/i.test(css),'CSS @import needs another file');
 return {htmlBytes:Buffer.byteLength(html),classicScripts:executable.length};
});
await test('全部实际故事、24委托、8结局与图像字节已内嵌',()=>{
 for(const name of ['common','fio','gina','quests','endings','port'])assert.ok(Array.isArray(payload.files?.[name])&&payload.files[name].length>0,'missing story '+name);
 assert.equal(payload.jobs.length,24);assert.equal(payload.files.endings.filter(s=>s.kind==='ending').length,8);assert.equal(Object.keys(payload.art.cgs).length,12);
 for(const [assetPath,value] of Object.entries(payload.assets||{})){assert.ok(value&&typeof value.mime==='string'&&typeof value.data==='string',assetPath+' missing MIME/base64');assert.match(value.data,/^[A-Za-z0-9+/]*={0,2}$/,'invalid base64 '+assetPath);const bytes=Buffer.from(value.data,'base64');assert.ok(bytes.length>0,assetPath+' empty');assert.equal(bytes.toString('base64'),value.data,'noncanonical/truncated base64 '+assetPath);const size=dimensions(bytes,value.mime);embeddedBytes+=bytes.length;assets.set(assetPath,{mime:value.mime,bytes:bytes.length,dimensions:size})}
 const references=[...Object.values(payload.art.backgrounds||{}),...Object.values(payload.art.portraits||{}),...Object.values(payload.art.cgs||{}).map(c=>typeof c==='string'?c:c.src)];for(const ref of references)assert.ok(assets.has(ref),'manifest resource not embedded: '+ref);
 for(const [id,cg] of Object.entries(payload.art.cgs)){const a=assets.get(typeof cg==='string'?cg:cg.src);assert.ok(a.bytes>1024,id+' CG has no substantial image bytes');if(a.dimensions)assert.ok(a.dimensions[0]>=400&&a.dimensions[1]>=400,id+' CG dimensions too small')}
 assert.ok(assets.has('assets/cover-generated.png'),'title cover missing');
 return {scenes:Object.values(payload.files).reduce((n,a)=>n+a.length,0),images:assets.size,imageBytes:embeddedBytes,cgs:12};
});

class Element{
 constructor(tag='div',attrs='',html='',harness){this.tagName=tag.toUpperCase();this.attrs=attrs;this._html=html;this.harness=harness;this.dataset={};for(const m of attrs.matchAll(/\bdata-([a-z-]+)\s*=\s*["']([^"']*)["']/g))this.dataset[m[1].replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=decodeHTML(m[2]);this.disabled=/\sdisabled(?:\s|=|$)/i.test(' '+attrs);this.className=extractAttr(attrs,'class')||'';this.value=extractAttr(attrs,'value')||'';this.type=extractAttr(attrs,'type')||'';this.id=extractAttr(attrs,'id')||'';this.checked=/\bchecked\b/.test(attrs);this.files=[];this.nextElementSibling={textContent:''}}
 get innerHTML(){return this._html}set innerHTML(v){this._html=String(v)}get textContent(){return this._text??decodeHTML(this._html)}set textContent(v){this._text=String(v)}
 setAttribute(k,v){this[k]=v}getAttribute(k){return extractAttr(this.attrs,k)}closest(sel){return sel==='[data-action]'&&this.dataset.action?this:null}remove(){const a=this.harness?.bodyChildren;const i=a?.indexOf(this);if(i>=0)a.splice(i,1)}
 click(){if(this.tagName==='A'&&this.download){const blob=this.harness.blobs.get(this.href);assert.ok(blob,'download Blob missing');this.harness.downloads.push({name:this.download,blob})}}
}
function createHarness({persisted=new Map(),denied=false,corrupt=false}={}){
 const h={persisted,bodyChildren:[],blobs:new Map(),downloads:[],fetches:[],warnings:[],logs:[],listeners:new Map(),windowListeners:new Map(),timerCallbacks:new Map(),nextTimer:1};
 if(corrupt)for(const key of ['adriatic-settings','adriatic-meta','adriatic-auto','adriatic-slot1'])persisted.set(key,'{broken');
 else if(!persisted.has('adriatic-settings'))persisted.set('adriatic-settings',JSON.stringify({speed:0,reduceMotion:true,muted:true}));
 h.app=new Element('div','id="app"','',h);
 h.find=(sel)=>{
  if(sel==='#app')return h.app;
  if(sel==='#adriatic-data')return {textContent:payloadScript.text};
  if(sel==='.toast')return h.bodyChildren.find(x=>x.className.split(/\s+/).includes('toast'))||null;
  if(sel.startsWith('#')){const id=sel.slice(1),re=new RegExp('<([a-z][a-z0-9]*)\\b([^>]*\\bid=["\']'+id+'["\'][^>]*)>([\\s\\S]*?)<\\/\\1>','i'),m=h.app.innerHTML.match(re);if(m)return new Element(m[1],m[2],m[3],h);const single=h.app.innerHTML.match(new RegExp('<(input)\\b([^>]*\\bid=["\']'+id+'["\'][^>]*)>','i'));if(single)return new Element(single[1],single[2],'',h);return null}
  return null;
 };
 const document={querySelector:h.find,getElementById:id=>h.find('#'+id),createElement:tag=>new Element(tag,'','',h),documentElement:{classList:{toggle(){},add(){},remove(){}}},body:{append:el=>h.bodyChildren.push(el),appendChild:el=>h.bodyChildren.push(el)},addEventListener:(name,fn)=>{if(!h.listeners.has(name))h.listeners.set(name,[]);h.listeners.get(name).push(fn)}};
 const security=()=>Object.assign(Error('Storage denied for QA'),{name:'SecurityError'});
 const localStore={getItem:key=>{if(denied)throw security();return persisted.has(key)?persisted.get(key):null},setItem:(key,value)=>{if(denied)throw security();persisted.set(key,String(value))},removeItem:key=>{if(denied)throw security();persisted.delete(key)},clear:()=>{if(denied)throw security();persisted.clear()}};
 const sessionStore=new Map();
 const sandbox={document,console:{log:(...a)=>h.logs.push(a.join(' ')),warn:(...a)=>h.warnings.push(a.map(String).join(' ')),error:(...a)=>h.warnings.push(a.map(String).join(' '))},JSON,Date,Math,Map,Set,Uint8Array,ArrayBuffer,TextDecoder,TextEncoder,Blob,Promise,structuredClone,
  URL:class extends URL{static createObjectURL(blob){const id='blob:vm-qa-'+h.blobs.size;h.blobs.set(id,blob);return id}static revokeObjectURL(){}},
  atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64'),
  fetch:async url=>{h.fetches.push(String(url));throw Error('Network/file fetch forbidden in standalone QA: '+url)},
  setTimeout:fn=>{const id=h.nextTimer++;h.timerCallbacks.set(id,fn);return id},clearTimeout:id=>h.timerCallbacks.delete(id),setInterval:fn=>{const id=h.nextTimer++;h.timerCallbacks.set(id,fn);return id},clearInterval:id=>h.timerCallbacks.delete(id),
  addEventListener:(name,fn)=>{if(!h.windowListeners.has(name))h.windowListeners.set(name,[]);h.windowListeners.get(name).push(fn)},location:{protocol:'file:',href:'file://'+htmlFile,reload(){}},navigator:{language:'zh-CN'},sessionStorage:{getItem:k=>sessionStore.get(k)||null,setItem:(k,v)=>sessionStore.set(k,String(v)),removeItem:k=>sessionStore.delete(k)},requestAnimationFrame:fn=>{fn();return 0},cancelAnimationFrame(){}};
 Object.defineProperty(sandbox,'localStorage',{get:()=>{if(denied)throw security();return localStore},configurable:true});sandbox.window=sandbox;sandbox.self=sandbox;
 h.context=vm.createContext(sandbox);
 h.dispatch=async(name,event)=>{for(const fn of h.listeners.get(name)||[])await fn({target:{tagName:'BODY'},stopPropagation(){},preventDefault(){},...event});await Promise.resolve();await new Promise(r=>setImmediate(r))};
 h.actions=()=>[...h.app.innerHTML.matchAll(/<([a-z][a-z0-9]*)\b([^>]*\bdata-action=["'][^"']+["'][^>]*)>/gi)].map(m=>new Element(m[1],m[2],'',h));
 h.click=async action=>{const el=h.actions().find(x=>x.dataset.action===action&&!x.disabled);assert.ok(el,'Rendered action not available: '+action);await h.dispatch('click',{target:el})};
 h.key=async key=>h.dispatch('keydown',{key,target:{tagName:'BODY'}});
 h.change=async target=>h.dispatch('change',{target});
 h.export=async()=>{await h.click('panel:saves');const n=h.downloads.length;await h.click('export');assert.equal(h.downloads.length,n+1,'UI did not create export download');const text=await h.downloads.at(-1).blob.text();return {text,data:JSON.parse(text)}};
 h.boot=async()=>{for(const [i,s] of executable.entries())vm.runInContext(s.text,h.context,{filename:'standalone-classic-'+i+'.js',timeout:30000});for(let i=0;i<5;i++){await Promise.resolve();await new Promise(r=>setImmediate(r))}assert.ok(h.app.innerHTML.includes('开始这个夏天'),'Title did not boot: '+h.app.innerHTML.slice(0,200));assert.equal(h.fetches.length,0,'Standalone boot performed fetch');return h};
 h.checkRenderedAssets=()=>{const urls=[...[...h.app.innerHTML.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m=>m[1]),...[...h.app.innerHTML.matchAll(/url\(["']?([^"')]+)["']?\)/gi)].map(m=>m[1])];assert.ok(urls.length,'No rendered image URLs');for(const url of urls){assert.match(url,/^(?:blob:|data:)/,'Rendered resource still depends on path: '+url);if(url.startsWith('blob:'))assert.ok(h.blobs.has(url),'Rendered Blob URL was not decoded')}return urls.length};
 h.firstChoice=async()=>{for(let i=0;i<250;i++){const choice=h.actions().find(x=>x.dataset.action?.startsWith('choice:')&&!x.disabled);if(choice)return choice.dataset.action;assert.ok(h.actions().some(x=>x.dataset.action==='advance'),'Expected dialogue advance before first choice');await h.click('advance')}throw Error('No first choice within 250 rendered advances')};
 return h;
}
let normalStore;
await test('实际classic脚本在禁止所有fetch时启动并展示波鲁克首句',async()=>{
 const h=await createHarness().boot();h.checkRenderedAssets();await h.click('new');h.checkRenderedAssets();const first=payload.files.common.find(s=>s.id==='opening').lines[0];assert.ok(h.app.innerHTML.includes(esc(first.text)),'Actual first story line not rendered');assert.equal(h.fetches.length,0);normalStore=h.persisted;return {firstSpeaker:first.speaker,firstLine:first.text};
});
await test('渲染事件推进、选择、手动存读档与导出导入精确恢复',async()=>{
 const h=await createHarness().boot();await h.click('new');const choice=await h.firstChoice();await h.click(choice);await h.click('quicksave');const saved=await h.export();assert.ok(saved.data.state.pending||saved.data.state.sceneId,'No current scene in export');await h.click('save:slot1');await h.click('close');await h.click('advance');
 await h.click('panel:saves');await h.click('load:slot1');const restored=await h.export();assert.deepEqual(restored.data.state,saved.data.state,'Manual slot changed scene/line/economy/flags');await h.click('close');await h.key('l');const quick=await h.export();assert.deepEqual(quick.data.state,saved.data.state,'Quickload not exact');await h.click('close');await h.click('advance');await h.click('panel:saves');
 const input=h.find('#import-save');assert.ok(input,'Rendered import input missing');input.files=[{text:async()=>saved.text}];await h.change(input);const imported=await h.export();assert.deepEqual(imported.data.state,saved.data.state,'UI import not exact');assert.equal(h.fetches.length,0);normalStore=h.persisted;
 return {scene:saved.data.state.sceneId,lineIndex:saved.data.state.lineIndex,day:saved.data.state.day,period:saved.data.state.period};
});
await test('新VM读取既有浏览器存储后可继续同一对白位置',async()=>{
 assert.ok(normalStore);const h=await createHarness({persisted:normalStore}).boot();const auto=JSON.parse(normalStore.get('adriatic-auto')).state;await h.click('continue');const exported=await h.export();assert.deepEqual(exported.data.state,auto,'Reload/continue differs from saved state');assert.equal(h.fetches.length,0);return {scene:auto.sceneId,lineIndex:auto.lineIndex};
});
await test('损坏的设置、meta与存档JSON不会阻止开局',async()=>{
 const h=await createHarness({corrupt:true}).boot();await h.click('new');assert.ok(h.app.innerHTML.includes(esc(payload.files.common.find(s=>s.id==='opening').lines[0].text)),'Corrupt storage prevents opening');const exported=await h.export();assert.equal(exported.data.state.sceneId,'opening');assert.equal(h.fetches.length,0);
});
await test('localStorage抛SecurityError时会话存档与导出仍可用',async()=>{
 const h=await createHarness({denied:true}).boot();await h.click('new');await h.click('panel:saves');await h.click('save:slot1');await h.click('close');const before=await h.export();await h.click('close');await h.click('advance');await h.click('panel:saves');await h.click('load:slot1');const restored=await h.export();assert.deepEqual(restored.data.state,before.data.state,'Denied-storage session fallback cannot restore');assert.equal(h.fetches.length,0);assert.ok(h.app.innerHTML.includes('浏览器未允许持久保存')&&h.app.innerHTML.includes('临时存档槽'),'Storage fallback guidance absent');
});
const failed=results.filter(r=>r.status==='failed');
console.log(JSON.stringify({kind:'standalone-classic-script-vm',status:failed.length?'failed':'passed',passed:results.length-failed.length,total:results.length,htmlBytes:Buffer.byteLength(html),embeddedImageBytes:embeddedBytes,images:assets.size,browserVerification:false,limitation:'Node VM + minimal DOM/storage adapters only. This is not Chromium/file:// rendering, layout, touch or audio verification.',checks:results},null,2));
if(failed.length)process.exitCode=1;
