'use strict';
const {Solar}=require('lunar-javascript');
const branches='子丑寅卯辰巳午未申酉戌亥';
const partners='丑子亥戌酉申未午巳辰卯寅';
const dayMs=86400000, kst=9*3600000;
const rule='moving-month-liuhe-v1';
const sources=['https://www.shidianguji.com/zh/book/SK1610/chapter/1kf5v6ol1yasl','https://astro.kasi.re.kr/kor/life/post/almanac'];
const event=/(?:이삿|이사(?!장|회|님|직|건)|(?:거처|집)(?:을|를)?\s*옮)/;
const timing=/언제|몇\s*월|어느\s*(?:달|월|때)|어떤\s*달|시기|무슨\s*달|(?:이번|다음|다다음)\s*달|달.{0,8}(?:좋|추천)|좋은\s*(?:달|때)|\d+\s*월|계절|봄|여름|가을|겨울/;
const specificDay=/\d+\s*일|손\s*없는\s*날|날짜|길일|이삿날|며칠|몇\s*일/;
const fullReading=/총운|신년|새해\s*운|연간|월별|월마다|매달|각\s*달|열두\s*달|12\s*개월|운세|재물운|연애운|직장운/;
const otherTopic=/면접|합격|취업|이직|연애|재회|결혼|창업|재물|투자|주식|건강|매매|팔릴/;
function request(message,history=[]){
 const q=String(message||'').normalize('NFKC').trim();
 if(!timing.test(q)||fullReading.test(q))return null;
 if(specificDay.test(q) && !(/몇\s*월|어느\s*달/.test(q)&&!/\d+\s*일|후보일|며칠/.test(q)))return null;
 if(/(?:집|매물).{0,18}(?:언제.{0,10}팔|팔릴|매매.{0,10}될)/.test(q)&&!/(?:언제|몇\s*월).{0,8}이사|이사.{0,8}(?:시기|몇\s*월)/.test(q))return null;
 if(event.test(q))return q;
 if(otherTopic.test(q) || !/^(?:그럼|그러면|그래서|그중|몇\s*월|어느\s*달|언제|올해|내년|이번|조금\s*더|좋은\s*달|\d+\s*월)/.test(q))return null;
 const last=(Array.isArray(history)?history:[]).filter(m=>m?.role==='user'&&String(m.content||'').trim()!==q).at(-1)?.content||'';
 if(!event.test(last)||fullReading.test(last))return null;
 const year=q.match(/20\d\d\s*년|올해|금년|내년/)?'':(last.match(/20\d\d\s*년|올해|금년|내년/)?.[0]||'');
 return [q,year,'(이사)'].join(' ');
}
// A narrow exception for a single scheduling question. An unrecognised or mixed
// annual request continues through the existing pass check.
function standalone(q){
 if(!q||otherTopic.test(q)||fullReading.test(q))return false;
 const rest=q.replace(/(?:집|거처)(?:을|를)?\s*옮(?:기고|기기|기려면|길|기는|기면)?/g,'이사').replace(/(?:20\d\d\s*년?|내년(?:도)?|올해|금년|이번|다가오는|상반기|하반기|겨울|가을|여름|봄|이사를?|이삿|하는|가는|하는게|한다면|한다|하면|하려면|할지|갈지|시기|하기|하기에|하려고|가려면|가기에|가고|싶은데|계획|중인데|좋은|좋을|좋아|좋겠|좋|맞는|언제쯤|언제|어느|몇|월|달|때|쯤|정도|더|가장|추천|알려|해줘|주세요|봐줘|나에게|제게|제가|제|내|사주로|사주에|기준|으로|는|은|이|가|을|를|지|까요|나요|요|에|다음|쯤이|게|걸|겠어|겠|어|좋냐|냐|일까|일지|괜찮|어때|어떤|어떨|나을|맞을|생각|중|인가|인지|하다|할|좋을까|까|해|서|그럼|그러면|부터|까지|와|과|[\d\s?!.,()~·])/g,'');
 return !rest;
}
const seasons={봄:[3,4,5],여름:[6,7,8],가을:[9,10,11],겨울:[12,1,2],상반기:[1,2,3,4,5,6],하반기:[7,8,9,10,11,12]};
function bounds(q,now){
 const local=new Date(+now+kst), year=local.getUTCFullYear(),month=local.getUTCMonth();
 const fixed=Number(q.match(/(20\d\d)\s*년/)?.[1])||(/내년/.test(q)?year+1:/올해|금년/.test(q)?year:0);
 if(fixed && (fixed<year||fixed>year+2))return [];
 const relative=q.match(/(이번|다음|다다음)\s*달/);
 if(relative&&!fixed){
  const delta={이번:0,다음:1,다다음:2}[relative[1]];
  const first=Date.UTC(year,month+delta),d=new Date(first);
  return [{y:d.getUTCFullYear(),m:d.getUTCMonth()+1,start:Math.max(first-kst,+now),end:Date.UTC(year,month+delta+1)-kst}];
 }
 const asked=[...q.matchAll(/(\d{1,2})\s*월/g)].map(m=>+m[1]);
 const range=q.match(/(\d{1,2})\s*월?\s*(?:부터|[~–-])\s*(\d{1,2})\s*월/);
 const season=Object.keys(seasons).find(k=>q.includes(k));
 const allowed=range ? Array.from({length:12},(_,i)=>i+1).filter(m=>+range[1]<=+range[2]?m>=+range[1]&&m<=+range[2]:m>=+range[1]||m<=+range[2]) : asked.length?asked:seasons[season];
 let first=fixed?Date.UTC(fixed,0):Date.UTC(year,month);
 let end=fixed?Date.UTC(fixed+1,0):Date.UTC(year,month+12,local.getUTCDate());
 if(range){
  const a=+range[1],b=+range[2];
  if(a<1||a>12||b<1||b>12)return [];
  const startYear=fixed||(a> b && month+1<=b ? year-1 : year+(month+1>Math.max(a,b)?1:0));
  first=Date.UTC(startYear,a-1);end=Date.UTC(startYear+Number(a>b),b);
 }
 const result=[];
 for(let t=first;t<end;){
  const d=new Date(t),y=d.getUTCFullYear(),m=d.getUTCMonth()+1,next=Date.UTC(y,m);
  if((!allowed||allowed.includes(m))&&next-kst>+now)result.push({y,m,start:Math.max(t-kst,+now),end:Math.min(next,end)-kst});
  t=next;
 }
 return result;
}
const instant=jie=>Date.parse(jie.getSolar().toYmdHms().replace(' ','T')+'+08:00');
function recommend(chart,q,now){
 if(!chart||!q)return null;
 const evidence=chart.facts.find(f=>f.path==='pillars.day'&&(chart.candidates.length===1||f.candidate_id==='common'));
 if(!evidence)return null;
 const natal=evidence.value.ganZhi[1],partner=partners[branches.indexOf(natal)];
 if(!partner)return null;
 const windows=[];
 for(const {y,m,start,end} of bounds(q,now)){
  const lunar=Solar.fromYmd(y,m,15).getLunar(),boundary=instant(lunar.getPrevJie());
  const previous=Solar.fromYmd(y,m,1).getLunar().getMonthInGanZhiExact();
  for(const [a,b,gz] of [[start,Math.min(end,boundary),previous],[Math.max(start,boundary),end,lunar.getMonthInGanZhiExact()]]){
   if(a>=b)continue;
   const last=windows.at(-1);
   if(last&&last.gz===gz&&last.end===a)last.end=b;
   else windows.push({start:a,end:b,gz});
  }
 }
 if(!windows.length)return null;
 const rank=w=>w.gz[1]===partner?2:branches.indexOf(w.gz[1])===(branches.indexOf(natal)+6)%12?0:1;
 windows.sort((a,b)=>rank(b)-rank(a)||Number(b.end-b.start>=7*dayMs)-Number(a.end-a.start>=7*dayMs)||a.start-b.start);
 const date=t=>new Date(t+kst).toISOString().slice(0,10);
 // Date labels contain only full local days where possible, so a term change
 // partway through the day is never represented as favouring the entire day.
 for(const w of windows){
  const startDay=date(w.start===+now||!((w.start+kst)%dayMs)?w.start:w.start+dayMs);
  const endDay=date((w.end+kst)%dayMs?w.end-dayMs:w.end-1);
  if(startDay>endDay)continue;
  return {rule,sources,factId:evidence.id,natal,monthPillar:w.gz,from:startDay,to:endDay,relation:['clash','neutral','harmony'][rank(w)]};
 }
 return null;
}
function label(date){const [y,m,d]=date.split('-').map(Number);return y+'년 '+m+'월 '+d+'일';}
function describe(rec){
 const period=label(rec.from)+'부터 '+label(rec.to)+'까지';
 if(rec.relation==='harmony')return '이사 시기는 양력 '+period+'를 먼저 권해요. 사주에서 태어난 날과 이 무렵의 기운을 포개 보면, 서로 어울리는 짝을 이뤄요. 새집에 자리를 잡는 쪽에 무게를 두고 고른 기간이에요.';
 if(rec.relation==='neutral')return '물어보신 범위에서는 양력 '+period+'를 무난한 후보로 봐요. 제일 먼저 찾는 조화의 짝은 없지만, 태어난 날과 정면으로 부딪히는 달도 아니어서 고른 구간이에요.';
 return '물어보신 기간인 양력 '+period+'는 이 기준에서 우선 권할 달은 아니에요. 태어난 날과 절기 달의 기운이 마주 보는 짝이라, 변화가 겹칠 때 여유를 두는 쪽으로 풀이해요.';
}
const guidance='[이사 월 추천] 아래 moving_window는 태어난 날 지지와 실제 절기 월지를 대조한 택일소의 제한된 전통 해석이다. 시작·끝과 선택 이유는 서버가 첫 문단에 정확하게 넣는다. 본문은 그 후보에서 이 사람의 이사가 어떻게 풀릴지 실제 개인 판정으로 이어라. 월·연도·날짜나 다른 시기를 추가로 언급하지 말고, 시기 자료가 없다거나 이사 날짜를 되묻지 않는다. 연간 운세, 길일 보장, 계약·매매 성사 예언은 하지 않는다.';
function conflicts(text){
 return /(?:\d+\s*[월년]|\d+\s*일(?:에|부터|까지|경)|[일이삼사오유칠팔구시십동]월(?:에|부터|이|을|은|쯤|까지)|내년|올해|이번\s*달|다음\s*달|(?:봄|여름|가을|겨울)(?:에|부터|까지)|(?:달|월|시기|기간).{0,25}(?:알 수 없|추천할 수 없|판단할 수 없|자료가 없))/.test(text);
}
module.exports={request,standalone,recommend,describe,guidance,conflicts};
