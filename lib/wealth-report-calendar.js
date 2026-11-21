'use strict';
const {calculate,flow}=require('./newyear-calculation');
const {LunarUtil,Solar}=require('lunar-javascript');

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
const version=7;
const interactions=require('./wealth-interactions');
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
  const windows=periods.filter(item=>dayMs(item.untilExclusive)-dayMs(item.from)>=7*86400000)
    .map(item=>readPeriod(pillars,route,item.monthGanZhi,Boolean(steady||flexible),item));
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

function readPeriod(pillars,route,ganZhi,hasNatalMoney,dates={}){
  const dayStem=pillars.day[0], [stem,branch]=ganZhi;
  const top=termAt(dayStem,stem), hidden=termAt(dayStem,LunarUtil.ZHI_HIDE_GAN[branch][0]);
  const has=kind=>signals[top].kind===kind||signals[hidden].kind===kind;
  const hits=['month','day'].filter(slot=>pillars[slot]&&clashes[pillars[slot][1]]===branch).map(slot=>slots[slot]+'지 '+pillars[slot][1]);
  const clash=hits.length>0;
  const outputAndMoney=has('income')&&has('work');
  const incomeStrength=(signals[top].kind==='income'?7:0)+(signals[hidden].kind==='income'?4:0)+(outputAndMoney?5:0)+
    (signals[top].kind==='work'&&hasNatalMoney?3:0)+(top==='正财'&&route.key==='steady'?3:0)+(top==='偏财'&&route.key==='flexible'?3:0)-(clash?2:0);
  const marginStrength=(top==='正财'?8:0)+(hidden==='正财'?4:0)+(top==='食神'?3:0)+(top==='正官'?2:0)-(clash||isPeer(top)?3:0);
  const riskStrength=(top==='劫财'?6:top==='比肩'?4:top==='七杀'?3:0)+(isPeer(hidden)?3:0)+(clash?4:0)+(has('income')&&(isPeer(top)||isPeer(hidden))?3:0);
  const fact=names[top]+'·'+names[hidden]+(clash?' · '+hits.join('·')+'와의 충':'');
  return {...dates,top,hidden,outputAndMoney,clash,fact,incomeStrength,marginStrength,riskStrength};
}

const incomeScenes={
  '正财':'이미 값을 받은 일을 한 번 더 맡거나, 내가 반복해서 해낸 일에 대해 보상을 다시 이야기해볼 흐름이에요.',
  '偏财':'익숙한 수입 밖에서 들어오는 제안을 먼저 살펴봐요. 같은 시간을 써도 상대가 어떤 결과에 값을 주는지 더 눈에 들어오는 흐름이에요.',
  '食神':'처음 보는 일을 벌이기보다, 잘 만든 것을 다른 사람도 쉽게 맡길 수 있게 내놓을 때 값이 붙는 흐름이에요.',
  '伤官':'하던 방식의 빈틈이 잘 보이는 때예요. 문제를 얼마나 잘 고쳤는지 보여주면 새로 맡은 몫의 대가를 꺼내기 쉬워요.',
  '比肩':'내 손으로 시간과 단가를 조정할 여지가 있는 일이 먼저 보여요.',
  '劫财':'함께 일하는 방식에서 수입이 생길 수 있지만, 누가 먼저 내고 누가 얼마를 가져가는지가 결과를 갈라요.',
  '正官':'새 일의 양을 늘리기보다 늘어난 역할을 보상에 반영하기 좋은 흐름으로 봐요.',
  '七杀':'속도가 필요한 일은 기회가 될 수 있어요. 급한 건일수록 보상과 책임이 한쪽으로 몰리는지부터 살펴요.',
  '正印':'갖고 있는 경험이나 자격이 낯선 일보다 먼저 값을 하는 흐름이에요.',
  '偏印':'준비가 길어지기 쉬운 때라, 새로 갖춰야 할 것이 적은 일부터 수입으로 이어보기 좋아요.'
};
const roleActions={
  income:{employee:'맡아온 업무 중 성과와 보상이 연결되는 사례를 골라 다음 보상 대화에 올려봐요.',business:'새 고객을 넓히기 전에 다시 맡길 고객과 새 견적 한 건의 정산 조건을 비교해요.',investor:'추가 투자 결정보다 여유자금과 가까운 시일의 현금 수요를 먼저 나눠 적어요.'},
  work:{employee:'잘했다는 말만 들은 업무를 골라 실제로 무엇을 개선했는지 보여줄 자료를 남겨요.',business:'반응이 좋았던 결과물 하나를 골라 작업 범위와 가격이 선명한 작은 제안으로 만들어봐요.',investor:'새 정보가 들어오면 매매 결정보다 기존에 세운 판단이 왜 달라졌는지 기록해요.'},
  steady:{employee:'늘어난 업무 하나를 골라 공식 역할과 평가·보상 기준에 들어가는지 살펴요.',business:'확장 전에 이미 가진 도구나 고객 관계로 반복 가능한 수입부터 정리해요.',investor:'바로 쓸 돈과 장기 보유 목적의 자금이 섞여 있지 않은지 확인해요.'},
  review:{employee:'급히 추가된 일에서 내가 먼저 쓰는 시간이나 비용이 어떻게 처리되는지 물어봐요.',business:'외주비나 재료비를 먼저 내야 한다면, 범위가 달라질 때 누가 더 부담할지 문서에 적어요.',investor:'급한 소식이나 지인의 권유가 들어올 때, 원래 정한 손실 한도와 현금 여유부터 다시 봐요.'}
};
const riskScene=period=>period.clash?'일정이나 상대 조건이 바뀌면서 처음 예상과 다른 지출이 생기기 쉬운 흐름으로 읽어요.':
  isPeer(period.top)||isPeer(period.hidden)?'함께 나누는 비용이나 가까운 사람에게 먼저 내주는 돈이 내 몫을 줄이기 쉬운 흐름이에요.':
    period.top==='七杀'?'답을 재촉하는 제안에서 추가 비용이나 책임이 뒤늦게 드러나는 장면을 먼저 살펴요.':'들어올 돈의 규모만 보다가 정산까지 걸리는 시간과 먼저 내는 비용을 놓치지 않도록 봐요.';
const clamp=n=>Math.max(0,Math.min(100,n));
function scores(period){
  return {score:clamp(49+2*period.incomeStrength+period.marginStrength-period.riskStrength),
    expenseScore:clamp(18+6*period.riskStrength)};
}
function ranked(rows,key){
  return [...rows].sort((a,b)=>b[key]-a[key]||a.month-b.month);
}

function yearlyOutlook(pillars,route,firstYear,hasNatalMoney){
  const years=Array.from({length:10},(_,i)=>{
    const year=firstYear+i;
    const {yearGanZhi}=flow(Date.UTC(year,6,1),pillars.day[0]);
    const period=readPeriod(pillars,route,yearGanZhi,hasNatalMoney);
    const {score,expenseScore}=scores(period);
    return {year,ganZhi:yearGanZhi,label:signals[period.top].label,score,expenseScore,basis:period.fact,relations:interactions.toPeriod(pillars,'세운',yearGanZhi),
      talk:pillars.day[0]+' 일간에 '+yearGanZhi+' 세운이 들어 '+symbolism[period.top]+'과 '+symbolism[period.hidden]+'이 함께 나타나요.',caution:period.clash?'평소의 선택 기준이 달라질 때를 눈여겨봐요. '+period.fact:reflection[period.hidden]};
  });
  return {years,horizons:[3,5,10].map(size=>{
    const selection=years.slice(0,size);
    const opportunity=selection.reduce((best,item)=>item.score>best.score?item:best);
    const expense=selection.reduce((best,item)=>item.expenseScore>best.expenseScore?item:best);
    return {size,opportunity:opportunity.year,expense:expense.year};
  })};
}

function factLabel(period){
  return names[period.top]+' · '+names[period.hidden]+(period.clash?' · 원국 월지 또는 일지와 충':'');
}

const reflection={
  '正财':'이미 여러 번 이어졌던 보상에 어떤 공통점이 있었는지 떠올려 보세요.',
  '偏财':'새로 눈에 띈 기회 가운데 내가 직접 가치를 판단할 수 있는 것을 골라보세요.',
  '食神':'가장 익숙하게 해낸 일에서 다른 사람이 다시 찾은 부분을 짚어보세요.',
  '伤官':'같은 일을 내 방식으로 바꿨을 때 무엇이 달라졌는지 먼저 살펴봐요.',
  '比肩':'다른 사람의 기준과 내가 원하는 몫이 갈리는 지점을 살펴봐요.',
  '劫财':'함께하고 싶은 마음이 내 선택까지 바꾸는 순간을 눈여겨보세요.',
  '正官':'내가 맡을 수 있는 책임과 그만큼의 인정이 함께 오는지 봐요.',
  '七杀':'빠르게 답하고 싶은 때일수록 내가 결정할 수 있는 부분을 먼저 짚어요.',
  '正印':'이미 익힌 것 중 지금 다시 쓸 수 있는 한 가지를 찾아봐요.',
  '偏印':'가능성을 더 탐색할 때인지, 이미 발견한 쓰임을 시험할 때인지 나눠보세요.'
};
const symbolism={
  '正财':'반복해서 얻는 대가','偏财':'익숙한 범위 밖에서 만나는 기회','食神':'익힌 재능을 결과로 내는 힘',
  '伤官':'자기만의 표현이나 개선','正官':'안정된 기준과 책임','七杀':'빠른 결단과 부담',
  '比肩':'자기 몫을 결정하는 힘','劫财':'다른 사람과 나누거나 겨루는 힘','正印':'쌓아온 배움과 보호','偏印':'새로운 관점과 준비'
};
function natalFactors(pillars){
  return Object.entries(pillars).map(([slot,pair])=>({
    position:slots[slot]+'주',visible:slot==='day'?'일간':names[termAt(pillars.day[0],pair[0])],
    hidden:LunarUtil.ZHI_HIDE_GAN[pair[1]].map(stem=>names[termAt(pillars.day[0],stem)])
  }));
}
function buildCalendar(profile,commonPillars){
  const {year,pillars,months,daewoon}=calculate(profile,{outlookYears:10,preciseCycles:true});
  const confirmed=commonPillars||{day:pillars.day};
  const judgment=wealthJudgment(confirmed,months);
  const natal=natalFactors(confirmed);
  const hasNatalMoney=['steady','flexible'].includes(judgment.route.key);
  const rows=months.map(({month,segments})=>{
    const primary=segments.reduce((a,b)=>dayMs(b.untilExclusive)-dayMs(b.from)>dayMs(a.untilExclusive)-dayMs(a.from)?b:a);
    const signal=signals[primary.monthStemTenGod];
    const period=readPeriod(confirmed,judgment.route,primary.monthGanZhi,hasNatalMoney,primary);
    const dayClash=clashes[confirmed.day[1]]===primary.monthGanZhi[1];
    return {month,ganZhi:primary.monthGanZhi,from:primary.from.slice(0,10),untilExclusive:primary.untilExclusive.slice(0,10),
      term:names[primary.monthStemTenGod],kind:signal.kind,label:symbolism[period.top],action:reflection[period.top],clash:dayClash,
      ...(dayClash&&{clashPair:confirmed.day[1]+'·'+primary.monthGanZhi[1]}),
      ...scores(period),basis:period.fact,relations:interactions.toPeriod(confirmed,'월운',primary.monthGanZhi),
      segments:segments.map(({from,untilExclusive,yearGanZhi,monthGanZhi})=>{
        const period=readPeriod(confirmed,judgment.route,monthGanZhi,hasNatalMoney);
        return {from,untilExclusive,yearGanZhi,monthGanZhi,...scores(period),basis:period.fact,
          groups:interactions.groups(confirmed,[yearGanZhi,monthGanZhi]),
          cycles:(daewoon?.cycles||[]).filter(c=>c.from<untilExclusive&&c.until>from).map(c=>c.ganZhi)};
      }),
      components:{income:period.incomeStrength,retention:period.marginStrength,risk:period.riskStrength},
      description:confirmed.day[0]+' 일간이 맞는 '+primary.monthGanZhi+'월에는 '+names[period.top]+'('+symbolism[period.top]+')이 겉에, '+names[period.hidden]+'('+symbolism[period.hidden]+')이 지지의 중심에 있어요. '+(period.outputAndMoney?'재능의 표현과 그에 따르는 보상을 함께 읽을 수 있는 조합이에요.':period.incomeStrength>0?'타고난 재물 성향과 이달의 보상 단서가 맞닿는 부분이 있어요.':period.marginStrength>0?'새로운 기회보다 이미 가진 몫을 지키는 힘이 점수에 더해져요.':'이 조합 자체에서는 수입을 직접 끌어올리는 단서가 약해요.'),
      natalLink:natal.filter(item=>item.visible===names[period.top]||item.hidden.includes(names[period.top])).map(item=>item.position),
      caution:period.clash?period.fact+'이 보여요. 익숙한 기준이 흔들릴 때 내 몫도 달라질 수 있는 달이에요.':isPeer(period.top)||isPeer(period.hidden)?'비겁은 나와 다른 사람 사이에서 몫이 갈리는 기운이에요. 함께하는 선택에서 내 판단이 어디까지인지 살펴봐요.':period.riskStrength?'속도와 책임이 함께 커질 때 부담이 한쪽으로 기울 수 있어요.':'계산에 반영된 충이나 비겁의 부담은 두드러지지 않아요.',

      roles:roleActions[period.riskStrength>=6?'review':signal.kind]};
  });
  const baseline=rows.reduce((sum,row)=>sum+row.score,0)/rows.length;
  for(const row of rows){
    const delta=Math.round(row.score-baseline);
    row.comparison=delta?'열두 달 평균보다 기회 지표가 '+Math.abs(delta)+'점 '+(delta>0?'높아요.':'낮아요.'):'기회 지표가 열두 달 평균과 비슷해요.';
  }
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
  const opportunities=ranked(rows,'score'), expenses=ranked(rows,'expenseScore');
  for(const row of rows)row.rank=opportunities.findIndex(item=>item.score===row.score)+1;
  const prior=yearlyOutlook(confirmed,judgment.route,year-1,hasNatalMoney).years[0];
  const outlook=yearlyOutlook(confirmed,judgment.route,year,hasNatalMoney);
  const cycles=(daewoon?.cycles||[]).filter(c=>/^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/.test(c.ganZhi)).map(c=>({...c,
    basis:readPeriod(confirmed,judgment.route,c.ganZhi,hasNatalMoney).fact,relations:interactions.toPeriod(confirmed,'대운',c.ganZhi)}));
  const spring=y=>{
    const china=Solar.fromYmd(y,6,1).getLunar().getJieQiTable()['立春'].toYmdHms();
    return new Date(Date.parse(china.replace(' ','T')+'+08:00')+9*3600000).toISOString().slice(0,19).replace('T',' ')+' KST';
  };
  for(const row of outlook.years){
    const from=spring(row.year),until=spring(row.year+1);
    row.cycles=cycles.filter(c=>c.from<until&&c.until>from).map(c=>({
      ganZhi:c.ganZhi,from:c.from>from?c.from:from,until:c.until<until?c.until:until,
      relations:interactions.between('대운',c.ganZhi,'세운',row.ganZhi),groups:interactions.groups(confirmed,[c.ganZhi,row.ganZhi])}));
    if(row.cycles.length===1)row.cycle=row.cycles[0];
  }
  const yearStem=confirmed.year?.[0],polarity=yearStem?('甲丙戊庚壬'.includes(yearStem)?'양':'음'):null;
  const direction=polarity&&['female','male'].includes(profile.gender)?((polarity==='양')===(profile.gender==='male')?'순행':'역행'):null;
  return {version,year,natal,internal:[...interactions.internal(confirmed),...interactions.groups(confirmed)],prior,
    cycleRule:{yearStem:yearStem||null,polarity,direction},
    daewoon:cycles.length?{cycles,age:daewoon.age,start:daewoon.start,direction}:null,rows,focuses,pillars:confirmed,judgment,
    ranking:{opportunity:opportunities.slice(0,3).map(row=>row.month),expense:expenses.slice(0,3).map(row=>row.month)},
    outlook};
}

module.exports={buildCalendar,version};
