'use strict';

const {natalFactors}=require('./wealth-report-calendar');

const assets=[
  {label:'예금·적금',terms:['정재','정인','비견'],
    reading:'정해 둔 금액을 꾸준히 모으는 방식이에요. 중간에 써야 할 돈은 만기까지 둘 돈과 나눠 살펴봐요.',
    action:'한 달에 남길 수 있는 금액과 꺼내 쓸 예정일을 나란히 적어봐요.'},
  {label:'채권',terms:['정관','정재','편인'],
    reading:'상환 약속과 만기가 정해진 자산을 비교하는 방식이에요. 발행자의 신용과 중간에 팔 때 가격이 달라질 수 있는 점도 살펴봐요.',
    action:'언제 자금이 필요한지 정하고, 발행자와 만기 조건을 비교해 봐요.'},
  {label:'분산형 ETF',terms:['정인','식신','정재'],
    reading:'여러 기업에 나눠 담는 지수형 상품을 살펴보는 방식이에요. 어떤 자산을 담는지와 비용을 확인해요.',
    action:'상품 이름이 달라도 담긴 자산이 많이 겹치는지 확인해요.'},
  {label:'개별주식',terms:['편재','식신','상관'],
    reading:'내가 이해할 수 있는 기업을 골라 비교하는 방식이에요. 어떤 구조로 돈을 버는지 설명할 수 있는지가 중요해요.',
    action:'마음이 간 이유를 적고, 다음 실적에서도 그 이유가 성립하는지 점검해요.'},
  {label:'부동산',terms:['정인','정관','정재'],
    reading:'오래 보유할 자산의 조건을 검토하는 방식이에요. 급히 처분하기 어려울 때도 필요한 현금이 남는지 살펴봐요.',
    action:'보유 기간과 관리·이자 부담을 적고 생활비가 따로 남는지 살펴봐요.'},
  {label:'가상자산',terms:['편인','편재','상관'],referenceOnly:true,
    reading:'가격 변동이 크고 구조에 따라 위험이 달라요. 어떤 원리로 가치를 판단하는지 설명하기 어렵다면 거래에 앞서 구조를 확인해요.'}
];
const risks=[
  {label:'급등을 보고 뒤따라 들어가기',terms:['편재','상관','편관'],
    action:'가격이 빨리 움직일수록 처음 정한 기준을 글로 다시 확인해요. 급등 소식만으로 판단이 바뀌면 결정을 미뤄요.'},
  {label:'빚을 내거나 레버리지로 규모 키우기',terms:['편관','겁재'],clash:true,
    action:'확신이 생겨도 빚으로 규모를 늘리는 선택을 피하는 쪽이에요. 이자와 상환 부담을 함께 살펴봐요.'},
  {label:'한 곳에 돈 몰아넣기',terms:['비견','편재','상관'],
    action:'좋아 보이는 한 가지에 돈이 쏠려 있는지 점검해요. 이미 다른 상품에 같은 자산이 들어 있는지도 봐요.'},
  {label:'지인의 권유만 듣고 공동투자하기',terms:['겁재','비견'],
    action:'가까운 사람의 확신이 내 기준이 되기 쉬워요. 손실과 회수 조건이 흐릿한 공동투자는 피하는 쪽이에요.'},
  {label:'곧 쓸 돈을 장기간 묶기',terms:['정관','정재','편인'],clash:true,
    action:'만기나 처분 시점보다 먼저 생활비가 필요해지는 상황을 점검해요. 가까운 시일에 쓸 돈은 따로 남겨둬요.'}
];

const meanings={
  정재:'반복해서 쌓고 남기는 힘',정인:'이미 아는 기준을 충분히 확인하는 힘',
  정관:'약속과 기간을 정해 지키려는 힘',식신:'익힌 것을 일정하게 이어가는 힘',
  편재:'익숙한 범위 밖의 기회를 살피는 힘',편인:'잘 아는 구조를 다른 관점에서 보는 힘',
  상관:'답답했던 기준을 바꾸어 보는 힘',비견:'내 기준을 세워 밀고 가는 힘',
  편관:'결정을 서두르게 하는 책임과 압박',겁재:'내 몫과 다른 사람의 몫이 섞이기 쉬운 흐름'
};
const riskMeanings={
  편재:'눈에 띄는 기회에 빠르게 마음이 쏠리는 흐름',
  상관:'평소 세운 기준을 한 번에 바꾸고 싶은 흐름',
  비견:'판단을 밀고 가다가 다른 신호를 늦게 알아차리기 쉬운 흐름',
  정관:'약속이나 기한을 지키느라 선택이 급해지는 흐름',
  정재:'목표로 잡은 금액을 지키느라 당장 쓸 돈을 놓치기 쉬운 흐름',
  편인:'한 가지 계획에 오래 매달려 다시 비교하는 일이 늦어지는 흐름'
};

function pickClue(clues,terms){
  return clues.flatMap(clue=>{
    const rank=terms.indexOf(clue.term);
    return rank===-1?[]:[{...clue,score:3-rank+clue.weight}];
  }).sort((a,b)=>b.score-a.score)[0];
}

function natalClues(pillars){
  return (pillars||[]).flatMap(pillar=>{
    const prominence=pillar.position==='월주'?2:pillar.position==='시주'?0:1;
    return [
      {term:pillar.visible,weight:prominence+1,scope:'겉 글자'},
      {term:pillar.hidden?.[0],weight:prominence,scope:'지지 주기운'}
    ].filter(({term})=>Object.hasOwn(meanings,term))
      .map(clue=>({...clue,fact:pillar.position+' · '+clue.scope+' '+clue.term}));
  });
}

function monthlyClues(row){
  const [top,hidden]=String(row.basis||'').split(' · ')[0].split('·');
  return [
    {term:row.term||top,weight:1,scope:'천간'},
    {term:hidden,weight:0,scope:'지지 주기운'}
  ].filter(({term})=>Object.hasOwn(meanings,term))
    .map(clue=>({...clue,fact:row.ganZhi+' 월운 · '+clue.scope+' '+clue.term}));
}

function bestMonth(rows,entry,warning){
  const choices=rows.flatMap(row=>{
    const clue=pickClue(monthlyClues(row),entry.terms);
    if(!clue)return [];
    const matched=(row.segments||[]).find(segment=>segment.monthGanZhi===row.ganZhi);
    const friction=(row.relations||[]).find(fact=>/^(?:월지|일지) .+ 충$/u.test(fact));
    const monthScore=clue.score+(warning
      ? Number(Boolean(entry.clash&&friction))*2+Math.min(3,(row.components?.risk||0)/4)
      : Math.min(3,(row.components?.income||0)/6+(row.components?.retention||0)/8)-Number(!!friction));
    return [{score:monthScore,month:row.month,from:matched?.from||row.from,untilExclusive:matched?.untilExclusive||row.untilExclusive,
      fact:clue.fact+(warning&&entry.clash&&friction?' · '+friction:''),
      meaning:(warning?riskMeanings[clue.term]:null)||meanings[clue.term]}];
  });
  return choices.sort((a,b)=>b.score-a.score||a.month-b.month)[0];
}

function summarize(entries,clues,calendar,warning=false){
  return entries.filter(entry=>!entry.referenceOnly).flatMap(entry=>{
    const natal=pickClue(clues,entry.terms);
    const timing=bestMonth(calendar.rows,entry,warning);
    if(!timing)return [];
    const {score,...period}=timing;
    const reason=natal?(warning?riskMeanings[natal.term]:null)||meanings[natal.term]:null;
    const natalFact=natal?.fact||calendar.judgment.route.basis;
    return [{score:(natal?.score||0)*2+score,card:{label:entry.label,...(entry.reading&&{reading:entry.reading}),action:entry.action,
      natalFact,natalMeaning:reason,timing:period}}];
  }).sort((a,b)=>b.score-a.score).slice(0,2).map(item=>item.card);
}

function wealthAssetGuide(calendar){
  const route=calendar?.judgment?.route;
  if(!route?.basis||!calendar.rows?.length)return null;
  const natal=calendar.natal|| (calendar.pillars?.day?natalFactors(calendar.pillars):[]);
  const clues=natalClues(natal);
  return {
    year:calendar.year,
    basis:route.basis,
    consider:summarize(assets,clues,calendar),
    avoid:summarize(risks,clues,calendar,true),
    assets:assets.map(({label,reading})=>({label,reading}))
  };
}

module.exports=wealthAssetGuide;
