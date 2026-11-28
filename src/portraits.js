import {weather} from './engine.js';

const people={'菲尔':'fio','吉娜':'gina','波鲁克':'porco'};
// The same scene/save always gives the same blocking. Different speakers take
// opposite sides; a new scene may reverse the arrangement without random jumps.
export function portraitPlacement(scene,who,line={}){
 const explicit=line.portraitSide||scene.portraitSides?.[who];
 if(['left','right'].includes(explicit))return explicit;
 const cast=[...new Set((scene.lines||[]).map(l=>people[l.speaker]).filter(Boolean))];
 let seed=0;for(const c of scene.id||'')seed=(seed*31+c.codePointAt(0))>>>0;
 return (seed+Math.max(0,cast.indexOf(who)))%2?'right':'left';
}
export function resolvePortrait(scene,line,day=1){
 const who=people[line?.speaker];if(!who)return null;
 // Saves cache already-filtered lines. Read new presentation metadata from the
 // matching authored line without replacing its text or saved dialogue index.
 const authored=(scene.lines||[]).find(l=>l.speaker===line.speaker&&l.text===line.text);
 const displayLine={
  ...line,
  expression:authored?.expression??line.expression,
  portraitOutfit:authored?.portraitOutfit??line.portraitOutfit,
  portraitSide:authored?.portraitSide??line.portraitSide
 };
 const rain=weather(day).includes('雨');
 const fallback=who==='gina'?'morning':who==='porco'?(['sea','lighthouse'].includes(scene.location)?'flight':scene.location==='cove'?'goggles-up':rain?'coat':'work'):'work';
 return {who,outfit:displayLine.portraitOutfit||(rain?scene.portraitOutfitsRain?.[who]:null)||scene.portraitOutfits?.[who]||line.outfit||fallback,expression:displayLine.expression||'neutral',side:portraitPlacement(scene,who,displayLine)};
}
