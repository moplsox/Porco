import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

// This is a classic-script/DOM-adapter smoke test, not a browser or layout test.
// It does not claim Chromium/file:// rendering, layout, touch or audio coverage.
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
const assetSource=entry=>typeof entry==='string'?entry:entry?.src;
function validateAtlasRegion(entry,label){
 assert.ok(entry&&typeof entry==='object',label+' missing atlas entry');
 assert.ok(Array.isArray(entry.region)&&entry.region.length===4,label+' missing region');assert.ok(Array.isArray(entry.canvas)&&entry.canvas.length===2,label+' missing canvas');
 const [x,y,w,h]=entry.region,[cw,ch]=entry.canvas;assert.ok([...entry.region,...entry.canvas].every(Number.isInteger),label+' noninteger region');assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=cw&&y+h<=ch,label+' region outside atlas');
 const asset=assets.get(entry.src);assert.ok(asset,label+' atlas not embedded');assert.deepEqual(asset.dimensions,entry.canvas,label+' atlas canvas mismatch');
}
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
 assert.equal(payload.jobs.length,24);assert.equal(payload.files.endings.filter(s=>s.kind==='ending').length,8);assert.equal(Object.keys(payload.art.cgs).length,13);assert.equal(payload.art.styleVersion,'film-review-v10');assert.equal(payload.art.portraitStyleVersion,'fullbody-parts-v12');
 for(const [assetPath,value] of Object.entries(payload.assets||{})){assert.ok(value&&typeof value.mime==='string'&&typeof value.data==='string',assetPath+' missing MIME/base64');assert.match(value.data,/^[A-Za-z0-9+/]*={0,2}$/,'invalid base64 '+assetPath);const bytes=Buffer.from(value.data,'base64');assert.ok(bytes.length>0,assetPath+' empty');assert.equal(bytes.toString('base64'),value.data,'noncanonical/truncated base64 '+assetPath);const size=dimensions(bytes,value.mime);embeddedBytes+=bytes.length;assets.set(assetPath,{mime:value.mime,bytes:bytes.length,dimensions:size,sha256:crypto.createHash('sha256').update(bytes).digest('hex')})}
 const references=[payload.art.title,...Object.values(payload.art.backgrounds||{}),...Object.values(payload.art.portraits||{}),...Object.values(payload.art.cgs||{})].flatMap(entry=>[assetSource(entry),...(entry?.layers||[]).map(layer=>layer.src)]);for(const ref of references)assert.ok(assets.has(ref),'manifest resource not embedded: '+ref);
 for(const [id,cg] of Object.entries(payload.art.cgs)){const a=assets.get(typeof cg==='string'?cg:cg.src);assert.ok(a.bytes>1024,id+' CG has no substantial image bytes');if(a.dimensions)assert.ok(a.dimensions[0]>=400&&a.dimensions[1]>=400,id+' CG dimensions too small')}
 assert.ok(assets.has(assetSource(payload.art.title)),'active title cover missing');
 return {scenes:Object.values(payload.files).reduce((n,a)=>n+a.length,0),images:assets.size,imageBytes:embeddedBytes,cgs:13};
});
await test('90人物槽与33背景视区的源图、几何和标题均完整内嵌',()=>{
 const portraits=Object.entries(payload.art.portraits),backgrounds=Object.entries(payload.art.backgrounds);
 assert.equal(portraits.length,90);assert.equal(new Set(portraits.map(([,v])=>v.src)).size,13);assert.equal(new Set(portraits.map(([,v])=>JSON.stringify(v))).size,78);
 assert.equal(backgrounds.length,44);assert.equal(new Set(backgrounds.map(([,v])=>v.src)).size,11);assert.equal(new Set(backgrounds.map(([,v])=>JSON.stringify(v))).size,33);
 for(const [slot,entry] of portraits){
  validateAtlasRegion(entry,slot);assert.ok(entry.region[3]>entry.region[2],slot+' is still cropped to the head');assert.ok(entry.layers?.length,slot+' missing body layers');
  assert.equal(entry.layers[0].src,entry.src);assert.deepEqual(entry.layers[0].canvas,entry.canvas);assert.ok(!entry.layers[0].transform,slot+' original body transformed');
  assert.equal(entry.layers.length===1,slot.endsWith('-neutral'),slot+' neutral/donor layer count mismatch');
  for(const [i,layer] of entry.layers.entries()){assert.equal(typeof layer.clipPath,'string',slot+' missing SVG layer cutout');assert.match(layer.clipPath,/^M[\s\S]+Z$/);assert.ok(assets.has(layer.src),slot+' donor source not embedded');assert.deepEqual(assets.get(layer.src).dimensions,layer.canvas,slot+' donor canvas mismatch');if(i&&layer.transform)assert.match(layer.transform,/^matrix\([\d+eE.,\s-]+\)$/);}
 }
 for(const [slot,entry] of backgrounds){validateAtlasRegion(entry,slot);assert.equal(entry.region[2]*9,entry.region[3]*16,slot+' background must be 16:9')}
 assert.deepEqual(payload.art.title,payload.art.backgrounds['cove-day']);
 return {portraitSlots:portraits.length,bodySourceSheets:13,independentBodyExpressionCombinations:78,backgroundViews:33,backgroundBoards:11};
});

await test('原认可sheet的SHA凭据、内嵌编码与clipPath字符串完整保留',()=>{
 const sourceArt=JSON.parse(fs.readFileSync(path.join(root,'assets/manifest.json'),'utf8'));
 assert.deepEqual(payload.art,sourceArt,'Standalone altered source geometry, clip paths or non-portrait artwork');
 const proof=JSON.parse(fs.readFileSync(path.join(root,'docs/APPROVED-PORTRAITS.json'),'utf8'));
 const cache=JSON.parse(fs.readFileSync(path.join(root,'.cache/standalone-art/manifest.json'),'utf8'));
 assert.equal(proof.portraitStyleVersion,'fullbody-parts-v12');assert.equal(proof.sources.length,13);
 assert.ok(!proof.sources.some(v=>v.src.endsWith('/fio-strawhat-unified.png')),'Reverted unified strawhat remains active');const hat=proof.sources.find(v=>v.src==='assets/portrait-approved/fio-strawhat.png');assert.ok(hat,'Original approved strawhat missing');assert.equal(hat.kind,'approved-original');assert.equal(hat.sha256,'a4b7ac16bbb564dc269c08d8176594373852c98cee32c02eaa901f6c091578ad','Original strawhat is not the previously approved image');
 assert.deepEqual(new Set(proof.sources.map(v=>v.src)),new Set(Object.values(payload.art.portraits).map(v=>v.src)),'Proof and embedded original sheets differ');
 for(const row of proof.sources){
  assert.match(row.src,/^assets\/portrait-approved\/[^/]+\.png$/);
  const sha=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,row.src))).digest('hex');
  assert.equal(sha,row.sha256,'Approved PNG source changed: '+row.src);if(row.kind==='approved-original'&&row.reviewSourceSha256)assert.equal(sha,row.reviewSourceSha256,'Approved review SHA mismatch: '+row.src);
  const optimized=cache[row.src],embedded=assets.get(row.src);assert.ok(embedded,'Approved sheet missing from embedded assets');assert.equal(optimized.sourceSha256,sha,'Cache came from a different face sheet');assert.equal(embedded.sha256,optimized.sha256,'Embedded bytes differ from verified lossless sheet cache');
 }
 assert.equal(proof.sources.filter(v=>v.kind==='approved-original').length,12);assert.equal(proof.sources.filter(v=>v.kind==='targeted-edit').length,1);
 const proven=new Set(proof.sources.map(v=>v.src));
 for(const [slot,entry] of Object.entries(payload.art.portraits))for(const [i,layer] of entry.layers.entries()){assert.ok(proven.has(layer.src),'Unproven body/expression source: '+layer.src);assert.equal(layer.clipPath,sourceArt.portraits[slot].layers[i].clipPath,'Runtime clip was rewritten as an asset path');assert.equal(layer.transform,sourceArt.portraits[slot].layers[i].transform,'Runtime expression matrix changed');assert.ok(!assets.has(layer.clipPath),'An SVG outline was embedded as an external asset');}
 return {sourcePngHashesVerified:13,originalPngsUnchanged:12,targetedEditPngs:1,losslessEmbeddedSourcesVerified:13,layerGeometryPreserved:true};
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
 h.checkRenderedAssets=()=>{const urls=[...[...h.app.innerHTML.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/gi)].map(m=>m[1]),...[...h.app.innerHTML.matchAll(/<image\b[^>]*\b(?:href|xlink:href)=["']([^"']+)["']/gi)].map(m=>m[1]),...[...h.app.innerHTML.matchAll(/url\(["']?([^"')]+)["']?\)/gi)].map(m=>m[1])];assert.ok(urls.length,'No rendered image URLs');const ids=new Set([...h.app.innerHTML.matchAll(/\bid=["']([^"']+)["']/g)].map(m=>m[1]));for(const url of urls){if(url.startsWith('#')){assert.ok(ids.has(url.slice(1)),'SVG cutout fragment has no definition: '+url);continue}assert.match(url,/^(?:blob:|data:)/,'Rendered resource still depends on path: '+url);if(url.startsWith('blob:'))assert.ok(h.blobs.has(url),'Rendered Blob URL was not decoded')}return urls.length};
 h.firstChoice=async()=>{for(let i=0;i<250;i++){const choice=h.actions().find(x=>x.dataset.action?.startsWith('choice:')&&!x.disabled);if(choice)return choice.dataset.action;assert.ok(h.actions().some(x=>x.dataset.action==='advance'),'Expected dialogue advance before first choice');await h.click('advance')}throw Error('No first choice within 250 rendered advances')};
 return h;
}

await test('实际runtime绘制90全身人物槽的全部原图基底和局部表情层',async()=>{
 const h=await createHarness().boot(),ids=new Set();let renderedLayers=0;
 for(const [slot,entry] of Object.entries(payload.art.portraits)){
  const markup=vm.runInContext(`__assets.artMarkup(${JSON.stringify(entry)},'portrait','${slot}','meet')`,h.context);
  assert.match(markup,/<svg\b[^>]*class="portrait art-viewport portrait-fullbody"/,'Full-body portrait layout class lost: '+slot);
  assert.ok(markup.includes(`viewBox="${entry.region.join(' ')}"`),'Original body region not rendered: '+slot);
  const groups=[...markup.matchAll(/<g\b([^>]*)>([\s\S]*?)<\/g>/gi)];assert.equal(groups.length,entry.layers.length,'Runtime omitted original body or expression layers: '+slot);
  for(const [i,group] of groups.entries()){
   const layer=entry.layers[i],definition=group[2].match(/<clipPath\b([^>]*)>([\s\S]*?)<\/clipPath>/i);assert.ok(definition,'No layer cutout definition: '+slot);
   assert.equal(extractAttr(group[1],'transform'),layer.transform,'Layer affine transform not preserved: '+slot);
   assert.equal(extractAttr(definition[1],'clipPathUnits'),'userSpaceOnUse','Outline does not use absolute source coordinates');
   const id=extractAttr(definition[1],'id');assert.ok(id&&!ids.has(id),'Duplicate/missing layer clip id: '+slot);ids.add(id);
   assert.equal(extractAttr(definition[2].match(/<path\b([^>]*)/i)?.[1]||'','d'),layer.clipPath,'Renderer changed layer cutout path');
   const image=group[2].match(/<image\b([^>]*)/i);assert.ok(image,'No original source image for layer: '+slot);
   assert.equal(extractAttr(image[1],'clip-path'),`url(#${id})`,'Layer image uses wrong cutout id: '+slot);
   assert.equal(Number(extractAttr(image[1],'width')),layer.canvas[0]);assert.equal(Number(extractAttr(image[1],'height')),layer.canvas[1]);
   assert.match(extractAttr(image[1],'href')||'',/^blob:/,'Source layer is not decoded from embedded bytes');renderedLayers++;
  }
  assert.ok(!/<filter\b|feColorMatrix|feComponentTransfer|mix-blend-mode/i.test(markup),'Runtime modifies face colors');
 }
 return {renderedSlots:90,renderedLayers,uniqueClipIds:ids.size,bodyBasePlusLocalExpressionParts:true,browserVerification:false};
});
let normalStore;
await test('实际classic脚本在禁止所有fetch时启动并展示波鲁克首句',async()=>{
 const h=await createHarness().boot();h.checkRenderedAssets();assert.ok(h.app.innerHTML.includes(`viewBox="${payload.art.title.region.join(' ')}"`),'Title did not render the declared single atlas region');assert.match(h.app.innerHTML,/<image\b[^>]*\bhref=["']blob:/i,'Atlas title did not use an embedded Blob URL');await h.click('new');h.checkRenderedAssets();const first=payload.files.common.find(s=>s.id==='opening').lines[0];assert.ok(h.app.innerHTML.includes(esc(first.text)),'Actual first story line not rendered');assert.equal(h.fetches.length,0);normalStore=h.persisted;return {firstSpeaker:first.speaker,firstLine:first.text};
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
