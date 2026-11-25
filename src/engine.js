export const VERSION=1;
export const CHAPTERS=['迟到的信','每周四的航班','停业三天的旅馆','没有寄件人的邮袋','连续的坏天气','夏末最后一班船'];
export const LOCATION_GROUPS={cove:['cove','sea'],hangar:['hangar'],hotel:['hotel','kitchen','garden'],market:['market','ferry'],post:['post'],lighthouse:['lighthouse','sea']};
export const PERIODS=['上午','下午','夜晚'];
export const LOCATIONS={cove:'秘密海湾',hangar:'保可洛临时机库',hotel:'亚得里亚诺旅馆',market:'港口集市',post:'邮局',lighthouse:'小岛灯塔',sea:'亚得里亚海',kitchen:'旅馆厨房',garden:'旅馆花园',ferry:'星期天的渡轮'};
export function freshState(){return {version:VERSION,day:1,period:0,location:'cove',money:180,fuel:38,condition:86,mail:0,fioClose:0,fioTrust:0,ginaClose:0,ginaTrust:0,route:null,flags:{},promises:[],completed:[],jobs:[],jobResults:[],ledger:[],history:[],sceneId:null,lineIndex:0,activeLines:[],pending:null,context:null,ending:null,read:[],cg:[],dateCounts:{},choiceHistory:[],commitment:null};}
export function chapter(day){return Math.min(6,Math.floor((day-1)/15)+1)}
export function dateLabel(day){const d=new Date(Date.UTC(2000,5,day));return `${d.getUTCMonth()+1}月${d.getUTCDate()}日`}
export function weekday(day){return ['星期一','星期二','星期三','星期四','星期五','星期六','星期日'][(day-1)%7]}
export function weather(day){if(day>=61&&day<=70)return day%3===0?'暴雨':'阴雨';return ['晴','晴','海风','薄云','晴','小雨','晴'][(day*3)%7]}
export function matches(c,s){if(!c)return true;if(c.flag&&(c.eq!==undefined?s.flags[c.flag]!==c.eq:!s.flags[c.flag]))return false;if(c.notFlag&&s.flags[c.notFlag])return false;if(c.route&&s.route!==c.route)return false;for(const k of ['fioClose','fioTrust','ginaClose','ginaTrust'])if(c[k]!==undefined&&s[k]<c[k])return false;return true}
export function applyEffect(s,e={},source='航行记事'){
 for(const k of ['money','fuel','condition','mail','fioClose','fioTrust','ginaClose','ginaTrust'])if(Number.isFinite(e[k]))s[k]+=e[k];
 s.money=Math.max(0,s.money);s.fuel=Math.max(0,Math.min(80,s.fuel));s.condition=Math.max(0,Math.min(100,s.condition));
 for(const k of ['fioClose','fioTrust','ginaClose','ginaTrust'])s[k]=Math.max(-20,Math.min(50,s[k]));
 if(e.flags)Object.assign(s.flags,e.flags);
 if(e.promise&&!s.promises.some(x=>x.id===e.promise.id)){const p={...e.promise,status:'pending'};if(p.day<s.day||(p.day===s.day&&p.period<s.period))p.day=Math.min(90,s.day+1);s.promises.push(p)}
 if(e.resolvePromise){const p=s.promises.find(x=>x.id===e.resolvePromise);if(p)p.status=e.resolvePromise==='weigh'&&s.flags.letterChoice==='search'?'missed':e.resolvePromise==='weigh'&&s.flags.letterChoice==='message'?'rescheduled':'kept'}
 if(e.money||e.fuel||e.condition)s.ledger.push({day:s.day,period:s.period,source,money:e.money||0,fuel:e.fuel||0,condition:e.condition||0});
 return s;
}
export function tick(s,n=1){for(let i=0;i<n;i++){if(s.day>=90&&s.period>=2)break;s.period++;if(s.period>2){s.period=0;s.day=Math.min(90,s.day+1)}for(const p of s.promises){if(p.status==='pending'&&(s.day>p.day||(s.day===p.day&&s.period>p.period))){p.status='missed';s[p.person+'Trust']-=2;s.flags['missed_'+p.id]=true}}}return s}
export function endingFor(s){if(s.route==='gina'&&s.flags.ginaAutumnAlone)return 'gina_missed';if(['fio','gina'].includes(s.route)&&s.flags.finalChoice==='part')return s.route+'_missed';if(['fio','gina'].includes(s.route)&&s.flags.finalChoice==='defer')return s.route+'_open';if(s.route==='fio')return s.fioTrust>=8&&s.flags.fioCareer&&(s.flags.fioDistancePlanned||s.flags.fioLongingSpoken)?'fio_good':s.fioTrust>=3?'fio_open':'fio_missed';if(s.route==='gina')return s.ginaTrust>=8&&s.flags.ginaKey?'gina_good':s.ginaTrust>=3?'gina_open':'gina_missed';return s.route==='solo'?'solo':'friend'}
export function dueMain(s,scenes){return scenes.filter(x=>x.kind==='main'&&x.day>0&&!s.completed.includes(x.id)&&matches(x.requires,s)&&(x.day<s.day||(x.day===s.day&&x.period<=s.period))).sort((a,b)=>a.day-b.day||a.period-b.period||(a.order||0)-(b.order||0))[0]}
export function availableEvents(s,scenes,loc){return scenes.filter(x=>['event','date'].includes(x.kind)&&x.day>0&&x.day<=s.day&&x.chapter===chapter(s.day)&&x.period===s.period&&!s.completed.includes(x.id)&&(!s.route||!x.route||x.route===s.route||['friend','solo'].includes(s.route))&&matches(x.requires,s)&&(!loc||(LOCATION_GROUPS[loc]||[loc]).includes(x.location)));}
export function schedule(s){const p=s.period,w=weather(s.day);return {fio:p===2?'机库关灯后，在旅馆核对工资。':p===0?'菲尔上午试飞，下午回机库。':w==='暴雨'?'菲尔留在机库校验防水。':'菲尔在临时机库，今天仍要交图。',gina:p===0?'吉娜在柜台清点邮件，尚未开餐。':p===1?'吉娜处理码头翻修，傍晚回旅馆。':'吉娜在旅馆。是否唱歌，由她决定。'};}
export function migrate(raw){if(!raw||raw.version!==1||!Number.isInteger(raw.day)||raw.day<1||raw.day>90||!raw.flags||!Array.isArray(raw.completed))throw Error('这份存档格式不正确。');return {...freshState(),...raw};}

export function recovery(s){applyEffect(s,{money:45,fuel:6,condition:2},'码头水泵修理 · 工钱与油料');return tick(s)}

export function sceneLines(s,sc){s.flags.currentRain=weather(s.day).includes('雨');s.flags.currentTrusted=!!sc.route&&s[sc.route+'Trust']>=8;return sc.lines.filter(l=>matches(l.when,s))}
export function scheduleConflict(s,duration,scenes){const now=(s.day-1)*3+s.period,end=now+duration;return scenes.filter(sc=>sc.kind==='main'&&sc.day>0&&!s.completed.includes(sc.id)&&matches(sc.requires,s)).find(sc=>{const t=(sc.day-1)*3+sc.period;return t>now&&t<end})||null}
export function affordable(s,choice){return !(choice.effects?.money<0&&s.money< -choice.effects.money)}
