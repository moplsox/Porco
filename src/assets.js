// Decode each embedded image only when it is first displayed. DOM nodes use short
// Blob URLs instead of duplicating megabytes of base64 on every dialogue advance.
const assetCache=new Map();
export function assetUrl(path){
 const entry=window.__ADRIATIC_EMBEDDED__?.assets?.[path];
 if(!entry)return path;
 if(assetCache.has(path))return assetCache.get(path);
 const binary=atob(entry.data),bytes=new Uint8Array(binary.length);
 for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
 const url=URL.createObjectURL(new Blob([bytes],{type:entry.mime}));
 assetCache.set(path,url);return url;
}
