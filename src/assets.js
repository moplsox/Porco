// Decode each embedded image only when it is first displayed. DOM nodes use short
// Blob URLs instead of duplicating megabytes of base64 on every dialogue advance.
const assetCache=new Map();
let viewportSerial=0;
export function assetUrl(path){
 const entry=window.__ADRIATIC_EMBEDDED__?.assets?.[path];
 if(!entry)return path;
 if(assetCache.has(path))return assetCache.get(path);
 const binary=atob(entry.data),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 const url=URL.createObjectURL(new Blob([bytes],{type:entry.mime}));
 assetCache.set(path,url);return url;
}

// A reviewed atlas is decoded once. SVG viewports expose only the requested
// illustration, so labels, neighbouring expressions and review panels stay out.
export function artMarkup(entry,className='',alt='',fit='slice'){
 if(!entry)return '';
 const value=typeof entry==='string'?{src:entry}:entry;
 const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 // Fio's reviewed expressions are finished transparent sprites. Draw each once;
 // the retained sheet/layer metadata records provenance, not runtime face parts.
 if(value.nativeSrc){
  const [nw,nh]=value.nativeCanvas,format=value.portraitFormat==='bust'?'bust':'fullbody',alignment=format==='bust'?'xMidYMax':'xMidYMid';
  return `<svg class="${escape(className)} art-viewport portrait-${format} portrait-native-alpha" viewBox="0 0 ${nw} ${nh}" preserveAspectRatio="${alignment} ${fit}" role="img" aria-label="${escape(alt)}" style="aspect-ratio:${nw}/${nh}" xmlns="http://www.w3.org/2000/svg"><image href="${escape(assetUrl(value.nativeSrc))}" width="${nw}" height="${nh}"/></svg>`;
 }
 const url=escape(assetUrl(value.src));
 if(!value.region)return `<img class="${escape(className)} art-image" src="${url}" alt="${escape(alt)}" style="object-fit:${fit==='meet'?'contain':'cover'}" draggable="false">`;
 const [x,y,w,h]=value.region,[cw,ch]=value.canvas;
 if(value.layers){
  const bodyId=`portrait-body-${++viewportSerial}`;
  const bodyClip=`<defs><clipPath id="${bodyId}" clipPathUnits="userSpaceOnUse"><path d="${escape(value.layers[0].clipPath)}" clip-rule="evenodd" fill-rule="evenodd"/></clipPath></defs>`;
  const content=value.layers.map(layer=>{
   const id=`portrait-layer-${++viewportSerial}`,[lw,lh]=layer.canvas||value.canvas;
   return `<g${layer.transform?` transform="${escape(layer.transform)}"`:''}><defs><clipPath id="${id}" clipPathUnits="userSpaceOnUse"><path d="${escape(layer.clipPath)}" clip-rule="evenodd" fill-rule="evenodd"/></clipPath></defs><image href="${escape(assetUrl(layer.src||value.src))}" width="${lw}" height="${lh}" clip-path="url(#${id})"/></g>`;
  }).join('');
  return `<svg class="${escape(className)} art-viewport portrait-fullbody" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="xMidYMid ${fit}" role="img" aria-label="${escape(alt)}" style="aspect-ratio:${w}/${h}" xmlns="http://www.w3.org/2000/svg">${bodyClip}<g clip-path="url(#${bodyId})">${content}</g></svg>`;
 }
 const clipId=value.clipPath?`approved-portrait-${++viewportSerial}`:null;
 const clipping=clipId?`<defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><path d="${escape(value.clipPath)}"/></clipPath></defs>`:'';
 return `<svg class="${escape(className)} art-viewport${clipId?' portrait-original':''}" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="xMidYMid ${fit}" role="img" aria-label="${escape(alt)}" style="aspect-ratio:${w}/${h}" xmlns="http://www.w3.org/2000/svg">${clipping}<image href="${url}" width="${cw}" height="${ch}"${clipId?` clip-path="url(#${clipId})"`:''}/></svg>`;
}
