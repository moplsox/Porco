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
 const url=escape(assetUrl(value.src));
 if(!value.region)return `<img class="${escape(className)} art-image" src="${url}" alt="${escape(alt)}" style="object-fit:${fit==='meet'?'contain':'cover'}" draggable="false">`;
 const [x,y,w,h]=value.region,[cw,ch]=value.canvas;
 const clipId=value.clipPath?`approved-portrait-${++viewportSerial}`:null;
 const clipping=clipId?`<defs><clipPath id="${clipId}" clipPathUnits="userSpaceOnUse"><path d="${escape(value.clipPath)}"/></clipPath></defs>`:'';
 return `<svg class="${escape(className)} art-viewport${clipId?' portrait-original':''}" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="xMidYMid ${fit}" role="img" aria-label="${escape(alt)}" style="aspect-ratio:${w}/${h}" xmlns="http://www.w3.org/2000/svg">${clipping}<image href="${url}" width="${cw}" height="${ch}"${clipId?` clip-path="url(#${clipId})"`:''}/></svg>`;
}
