'use strict';
const {calculate}=require('./newyear-calculation');

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

function buildCalendar(profile){
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
  return {year,rows,focuses};
}

module.exports={buildCalendar};
