// Local files can have storage disabled by browser policy; gameplay still works.
const memory=new Map();
let backend=null;
try{const candidate=window.localStorage,key='adriatic-storage-probe';candidate.setItem(key,'1');candidate.removeItem(key);backend=candidate}catch{}
export const storage={
 get persistent(){return backend!==null},
 getItem(key){if(memory.has(key))return memory.get(key);try{return backend?.getItem(key)??null}catch{backend=null;return null}},
 setItem(key,value){value=String(value);memory.set(key,value);if(backend)try{backend.setItem(key,value)}catch{backend=null}},
 removeItem(key){memory.delete(key);if(backend)try{backend.removeItem(key)}catch{backend=null}}
};
