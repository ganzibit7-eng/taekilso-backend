'use strict';
const {calculate}=require('./newyear-calculation');
const {LunarUtil}=require('lunar-javascript');

const signals={
  '正财':{kind:'income',label:'꾸준한 수입 살피기',action:'다시 맡을 수 있는 일 하나를 골라, 약속한 대가와 정산일을 확인해요.'},
  '偏财':{kind:'income',label:'새 수입 기회 살피기',action:'새 제안 한 건을 골라 예상 수입에서 먼저 내야 할 돈과 시간을 빼고 비교해요.'},
  '食神':{kind:'work',label:'잘하는 일을 수입으로 잇기',action:'이미 해온 일 중 다시 요청받은 결과물 하나를, 맡을 범위와 가격이 보이는 제안으로 정리해요.'},
  '伤官':{kind:'work',label:'실력에 맞는 대가 조율하기',action:'추가로 맡아온 일 하나를 골라, 내 결과와 추가 대가를 구체적으로 말해봐요.'},
  '比肩':{kind:'review',label:'내 몫과 공동 비용 구분하기',action:'다른 사람과 함께 쓰는 비용에서 누구 몫인지 모호한 항목 하나의 금액과 기한을 정해요.'},
  '劫财':{kind:'review',label:'함께 쓰는 돈의 경계 확인하기',action:'대신 결제하거나 함께 맡을 일이 있다면, 먼저 내는 금액과 돌려받을 날을 맞춰요.'},
  '正官':{kind:'steady',label:'업무 범위와 보상 확인하기',action:'고정적으로 받는 대가와 추가로 책임질 업무를 나란히 놓고 봐요.'},
  '七杀':{kind:'review',label:'급한 제안의 추가 비용 살피기',action:'빨리 답해야 할 제안은 일정이 밀렸을 때 내가 부담할 비용부터 확인해요.'},
  '正印':{kind:'steady',label:'기존 자원 활용하기',action:'새로 구매하거나 등록하기 전에 이미 가진 도구와 경험으로 대체할 수 있는지 확인해요.'},
  '偏印':{kind:'steady',label:'준비에 드는 돈 가다듬기',action:'배움과 준비에 쓰는 돈 가운데 지금 일에 바로 써볼 한 가지를 골라요.'}
};
const names={'正财':'정재','偏财':'편재','食神':'식신','伤官':'상관','比肩':'비견','劫财':'겁재','正官':'정관','七杀':'편관','正印':'정인','偏印':'편인'};
const clashes={子:'午',丑:'未',寅:'申',卯:'酉',辰:'戌',巳:'亥',午:'子',未:'丑',申:'寅',酉:'卯',戌:'辰',亥:'巳'};
const dayMs=day=>Date.parse(day.replace(' ','T').slice(0,19)+'+09:00');
const version=2;
const slots={year:'연',month:'월',day:'일',hour:'시'};
const termAt=(dayStem,stem)=>LunarUtil.SHI_SHEN[dayStem+stem];
const isPeer=term=>term==='比肩'||term==='劫财';

// The calendar is calculated. Selection weights are Taekilso's editorial
// interpretation of recurring wealth/output/peer combinations, never event odds.
function wealthJudgment(pillars,months){
  const dayStem=pillars.day[0];
  const natal=Object.entries(pillars).flatMap(([slot,ganZhi])=>{
    const stem=ganZhi[0];
    const rooted=Object.values(pillars).some(value=>LunarUtil.ZHI_HIDE_GAN[value[1]].includes(stem));
    const visible=slot==='day'?[]:[{place:slots[slot]+'간',term:termAt(dayStem,stem),weight:2+Number(rooted),rooted}];
    return [...visible,{place:slots[slot]+'지의 주된 기운',term:termAt(dayStem,LunarUtil.ZHI_HIDE_GAN[ganZhi[1]][0]),weight:slot==='month'?2:1}];
  });
  const count=term=>natal.filter(row=>row.term===term).reduce((sum,row)=>sum+row.weight,0);
  const steady=count('正财'), flexible=count('偏财'), craft=count('食神')+count('伤官');
  const strongest=(...terms)=>natal.filter(row=>terms.includes(row.term)).sort((a,b)=>b.weight-a.weight)[0];
  const link=row=>row?row.place+'의 '+names[row.term]+(row.rooted?' · 같은 천간이 지장간에도 확인돼요.':''):'';
  let route;
  if(steady&&steady>=flexible){
    route={key:'steady',title:'한 번 더 맡을 수 있는 일이 돈이 되는 사주예요',basis:link(strongest('正财')),
      description:'도겸은 새 기회를 여러 개 벌이기보다, 한 번 값을 받은 일을 같은 조건으로 다시 이어갈 때 재물이 자라기 쉬운 쪽으로 읽어요. 수입을 키울 때도 먼저 반복해서 맡을 범위와 대가를 맞춰보세요.'};
  }else if(flexible){
    route={key:'flexible',title:'새로운 제안에 값을 붙일 때 수입의 폭이 넓어져요',basis:link(strongest('偏财')),
      description:'도겸은 늘 하던 일의 양을 늘리는 것보다 다른 제안 가운데 조건이 좋은 일을 골라 받을 때 돈의 길이 넓어지는 편으로 읽어요. 기회에 바로 답하기 전에 들어갈 비용과 정산일을 한 번 더 보세요.'};
  }else if(craft){
    route={key:'craft',title:'잘해온 일을 보여준 다음에 돈이 붙는 사주예요',basis:link(strongest('食神','伤官')),
      description:'도겸은 처음부터 큰 수입을 좇기보다 남이 알아볼 만한 결과가 생길 때 대가로 이어지기 쉬운 편으로 읽어요. 새 기술을 더 배우기 전에 이미 좋은 반응을 받은 일을 하나 골라 제안해 보세요.'};
  }else{
    route={key:'basis',title:'수입의 약속과 역할부터 분명히 하는 쪽을 먼저 봐요',basis:'공통으로 확인된 원국과 월운',
      description:'원국에서 직접 읽을 수 있는 수입 단서가 뚜렷하지 않아, 도겸은 돈이 크게 불어나는 방식보다 월운에서 보상과 책임이 함께 보이는 구간을 먼저 살펴요.'};
  }

  // Calendar months split one solar-term span at midnight on the first day.
  // Join those pieces before ranking so one span is counted only once.
  const periods=[];
  for(const {segments} of months)for(const entry of segments){
    const prior=periods.at(-1);
    if(prior&&prior.monthGanZhi===entry.monthGanZhi&&prior.yearGanZhi===entry.yearGanZhi&&prior.untilExclusive===entry.from)prior.untilExclusive=entry.untilExclusive;
    else periods.push({...entry});
  }
  const compare=(a,b,key)=>b[key]-a[key]||dayMs(a.from)-dayMs(b.from);
  const windows=periods.filter(item=>dayMs(item.untilExclusive)-dayMs(item.from)>=7*86400000).map(item=>{
    const top=item.monthStemTenGod,branch=item.monthGanZhi[1],hidden=termAt(dayStem,LunarUtil.ZHI_HIDE_GAN[branch][0]);
    const has=kind=>signals[top].kind===kind||signals[hidden].kind===kind;
    const hit=['month','day'].filter(slot=>pillars[slot]&&clashes[pillars[slot][1]]===branch).map(slot=>slots[slot]+'지 '+pillars[slot][1]);
    const clash=hit.length>0;
    const outputAndMoney=has('income')&&has('work');
    const incomeStrength=(signals[top].kind==='income'?7:0)+(signals[hidden].kind==='income'?4:0)+(outputAndMoney?5:0)+
      (signals[top].kind==='work'&&(steady||flexible)?3:0)+(top==='正财'&&route.key==='steady'?3:0)+(top==='偏财'&&route.key==='flexible'?3:0)-(clash?2:0);
    const marginStrength=(top==='正财'?8:0)+(hidden==='正财'?4:0)+(top==='食神'?3:0)+(top==='正官'?2:0)-(clash||isPeer(top)?3:0);
    const riskStrength=(top==='劫财'?6:top==='比肩'?4:top==='七杀'?3:0)+(isPeer(hidden)?3:0)+(clash?4:0)+(has('income')&&(isPeer(top)||isPeer(hidden))?3:0);
    const fact=names[top]+'·'+names[hidden]+(clash?'과 '+hit.join('·')+'와의 충':'');
    return {...item,top,hidden,outputAndMoney,clash,fact,incomeStrength,marginStrength,riskStrength};
  });
  function pick(key,skip=[]){return windows.filter(item=>item[key]>0&&!skip.includes(item)).sort((a,b)=>compare(a,b,key))[0];}
  const income=pick('incomeStrength'), margin=pick('marginStrength',[income])||pick('marginStrength');
  const risk=pick('riskStrength',[income,margin])||pick('riskStrength');
  const label=(stamp,base)=> (stamp.slice(0,4)===base?'':Number(stamp.slice(0,4))+'년 ')+Number(stamp.slice(5,7))+'월 '+Number(stamp.slice(8,10))+'일';
  function card(kind,item,talk,action){
    if(!item)return null;
    const base=item.from.slice(0,4);
    const title=label(item.from,base)+' ~ '+label(item.untilExclusive,base);
    return {kind,title,from:item.from,untilExclusive:item.untilExclusive,ganZhi:item.monthGanZhi,basis:item.fact,talk,action};
  }
  return {route,timing:[
    income&&card('income',income,income.outputAndMoney?'해오던 일에 가격을 붙이고, 그 대가가 수입으로 이어지기 좋은 구간으로 먼저 봐요.':
      [income.top,income.hidden].includes('偏财')?'평소 하던 일 밖에서 조건을 붙여 새 수입을 만들기 좋은 구간으로 먼저 봐요.':'꾸준히 맡아온 일의 대가를 다시 맞추기 좋은 구간으로 먼저 봐요.',
      route.key==='steady'?'잘해왔던 일을 다시 제안하고 정산 날짜까지 한 번에 맞춰보세요.':signals[income.top].kind==='income'?signals[income.top].action:signals[income.hidden].action),
    margin&&card('margin',margin,margin.top==='正官'?'맡은 일과 대가를 다시 정리할 때 남는 몫을 지키기 좋은 흐름이에요.':
      margin.top==='食神'?'한 번 값을 받은 결과물을 다시 쓸 수 있게 정리할 때 남는 몫을 키우기 좋은 흐름이에요.':'새 수입원을 벌이기보다 이미 받을 돈과 나갈 돈의 간격을 줄이기 좋은 흐름이에요.',
      margin.top==='正官'||margin.top==='食神'?signals[margin.top].action:'받을 돈의 날짜와 자동으로 빠져나가는 고정 지출을 같은 달력에서 맞춰보세요.'),
    risk&&card('risk',risk,risk.clash?'일정이나 상대 조건이 바뀌면서 먼저 들어가는 비용이 커지기 쉬운 때로 읽어요. 부탁을 받자마자 내 몫까지 늘리지 마세요.':'함께 하는 일이나 급한 제안에서 정작 내 몫이 줄어들기 쉬운 구간으로 읽어요.',
      isPeer(risk.top)?signals[risk.top].action:isPeer(risk.hidden)?signals[risk.hidden].action:'일을 받기 전에 내가 먼저 낼 돈, 추가 작업 비용, 돌려받을 날짜를 한 번에 정해요.')
  ].filter(Boolean)};
}

function buildCalendar(profile,commonPillars){
  const {year,pillars,months}=calculate(profile);
  const rows=months.map(({month,segments})=>{
    const primary=segments.reduce((a,b)=>dayMs(b.untilExclusive)-dayMs(b.from)>dayMs(a.untilExclusive)-dayMs(a.from)?b:a);
    const signal=signals[primary.monthStemTenGod];
    const natalBranch=pillars.day[1],monthBranch=primary.monthGanZhi[1];
    const clash=clashes[natalBranch]===monthBranch;
    return {month,ganZhi:primary.monthGanZhi,from:primary.from.slice(0,10),untilExclusive:primary.untilExclusive.slice(0,10),
      term:names[primary.monthStemTenGod],kind:signal.kind,label:signal.label,action:signal.action,clash,
      ...(clash&&{clashPair:natalBranch+'·'+monthBranch})};
  });
  const chances=rows.filter(row=>row.kind==='income'||row.kind==='work')
    .sort((a,b)=>Number(a.clash)-Number(b.clash)||Number(b.kind==='income')-Number(a.kind==='income')||a.month-b.month).slice(0,3);
  const caution=rows.find(row=>row.clash&&row.kind==='review')||rows.find(row=>row.kind==='review'&&!chances.includes(row))||rows.find(row=>row.clash);
  const prefix=row=>row.month+'월 · '+row.label;
  const focuses=chances.map(row=>({month:row.month,title:prefix(row),
    reason:'선택한 구간의 '+row.ganZhi+' 월운에서 '+row.term+'이 확인돼, '+(row.kind==='income'?'받을 대가와 현금 흐름을 살펴볼':'해온 일을 눈에 보이는 결과와 대가로 연결해 볼')+' 시기로 읽었어요.',
    action:row.action,check:row.kind==='income'?'일을 더 맡기 전 정산일, 감당할 비용, 실제로 남는 몫을 같이 적어봐요.':'상대가 이미 좋다고 했던 결과와 앞으로 새로 맡아야 할 일을 구분해 제안해요.'}));
  if(caution)focuses.push({month:caution.month,title:caution.month+'월 · 지출과 약속 점검',
    reason:caution.clash?'이 달의 지지와 태어난 날의 지지('+caution.clashPair+')가 맞서는 관계예요. 변동이 생기는 상황에서 돈과 약속을 한꺼번에 결정하기 쉬운지 살펴봐요.':'이 구간에 '+caution.term+'이 확인돼, 가까운 사람 또는 급히 맡은 일에 먼저 들이는 돈을 점검할 때로 읽었어요.',
    action:caution.action,check:'누구를 위해 얼마를 먼저 쓰는지, 나중에 돌려받는 조건까지 한 줄로 적어봐요.'});
  const confirmed=commonPillars||{day:pillars.day};
  return {version,year,rows,focuses,pillars:confirmed,judgment:wealthJudgment(confirmed,months)};
}

module.exports={buildCalendar,version};
