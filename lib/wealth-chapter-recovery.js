'use strict';

// All dates, ranks and chart evidence in these chapters come from the purchased report's calculation.
function recoveryChapters(calendar, plan, evidence) {
  const {year, prior, outlook, ranking, rows} = calendar;
  const annual = outlook.years[0];
  const route = calendar.judgment.route;
  const basis = index => evidence.find(item => item.id === plan[index].requiredBasis);
  const row = month => rows.find(item => item.month === month);
  const opportunity = row(ranking.opportunity[0]);
  const caution = row(ranking.expense[0]);
  const natal = index => basis(index).meaning;
  const monthName = item => item.month+'월 대표 월운('+item.ganZhi+')';
  function periods(months, kind) {
    return months.map((month, index) => {
      const item = row(month);
      const lead = ['가장 먼저 볼 때는','두 번째로 눈여겨볼 때는','세 번째로 짚을 때는'][index]+' '+monthName(item)+'예요. ';
      const detail = kind === 'opportunity'
        ? item.description+' '+item.action
        : '이때 살펴볼 두 단서는 '+item.basis+'예요. '+item.caution+' '+(item.clash
          ? '특히 일지와 월지에 충이 있어요. 평소 편했던 선택도 다시 판단할 일이 생긴다는 뜻으로 읽어요.'
          : '월운에서 '+item.label+' 쪽이 두드러져요. 여기서 주의 순위는 돈을 잃는다는 예고가 아니라, 평소의 선택을 한 번 더 돌아볼 단서예요.');
      return lead+detail;
    });
  }
  const chapters = [
    {highlight:year+'년에는 '+annual.basis+'의 조합이 평소 돈을 대하는 방식에 새로 더해져요.',
      paragraphs:[
        year+'년 입춘 뒤의 세운은 '+annual.ganZhi+'예요. 이 명식에서 이 두 글자를 돈과 연결해 읽을 때 첫 단서는 '+annual.basis+'예요. '+annual.caution+' 원래 지닌 재물 성향과 그해 새로 힘을 얻는 부분을 나눠 보면, 똑같은 기회라도 어느 쪽에 마음이 움직일지 가늠할 수 있어요.',
        '원국에서 먼저 눈에 들어오는 자리는 '+basis(0).location+'예요. '+natal(0)+' 여기에 재물의 길을 살핀 근거인 '+route.basis.replace(/[.。]+$/,'')+'까지 함께 보면, 도겸의 첫 판단은 이래요. '+route.title,
        '올해 초부터 곧장 같은 흐름으로 읽지는 않아요. 입춘 전에는 '+prior.ganZhi+'의 '+prior.basis+'가 이어지고, 입춘 뒤에는 '+annual.ganZhi+'의 '+annual.basis+'로 넘어가요. 연초에 맞았던 선택이 봄에도 같은 의미인지, 내가 쓰는 힘과 돌아오는 대가를 따로 떠올려 보세요.'
      ]},
    {highlight:opportunity.month===caution.month
      ? opportunity.month+'월에는 돈이 들어올 기회와 지출을 키우는 흐름이 함께 드러나요.'
      : '같은 해 안에서도 '+opportunity.month+'월과 '+caution.month+'월에 살펴볼 돈의 모습이 달라요.',
      paragraphs:[
        '열두 달을 차례로 읽을 때는 달력의 첫날부터 말일까지를 한 덩어리로 보지 않아요. 절기가 바뀌면 같은 양력 달 안에서도 작용하는 글자가 달라져요. 아래에서 집어 드리는 달은 그달의 더 긴 구간을 차지한 월운을 기준으로 삼았어요.',
        monthName(opportunity)+'에는 '+opportunity.description+' 올해 기회 흐름 가운데 이 달을 먼저 고른 까닭이에요.',
        monthName(caution)+'에는 '+caution.basis+'가 함께 보여요. '+caution.caution+' 원국 쪽에서는 이렇게 연결돼요. '+natal(1)+' 기회를 발견하는 힘과 그 기회를 내 몫으로 남기는 힘은 이렇게 따로 살펴야 해요.'
      ]},
    {highlight:opportunity.month+'월을 재물 기회의 첫 후보로 읽어요. 관건은 '+opportunity.label+'예요.',
      paragraphs:[...periods(ranking.opportunity,'opportunity'),'세 시기를 가르는 출발점은 내 사주의 '+basis(2).location+'예요. '+natal(2)+' 이 단서가 각 달의 겉기운과 지지의 중심에 어떻게 닿는지에 따라, 비슷해 보이는 제안도 다르게 느껴질 수 있어요.']},
    {highlight:caution.month+'월에는 '+caution.label+' 쪽으로 마음이 기울 때를 한 번 더 살펴요.',
      paragraphs:[...periods(ranking.expense,'expense'),'이 흐름을 자기 판단에 대입할 때는 '+basis(3).location+'의 '+basis(3).term+'부터 떠올려 보세요. '+natal(3)+' 같은 돈이 나가더라도 스스로 정한 선택인지, 주변 흐름에 떠밀린 선택인지에 따라 이 단서의 의미가 달라져요.']},
    {highlight:'가까운 '+outlook.horizons[0].opportunity+'년의 기회부터 보고, 더 긴 흐름은 새로 더해지는 해와 비교해요.',
      paragraphs:outlook.horizons.map((span,index)=>{
        const best=outlook.years.find(item=>item.year===span.opportunity);
        const risk=outlook.years.find(item=>item.year===span.expense);
        const priorSpan=outlook.horizons[index-1];
        const contrast=!priorSpan?'가까운 시기라서 원국의 재물 성향이 연운과 만나는 지점을 먼저 읽어요.':priorSpan.opportunity===span.opportunity?'앞 구간과 같은 해가 남은 건 뒤에 더한 해까지 비교해도 이 조합의 기회 순위가 가장 앞서기 때문이에요.':'살펴보는 기간을 넓히면서 기회의 무게중심이 다른 해로 옮겨갔어요.';
        return year+'년부터 '+(year+span.size-1)+'년까지 비교하면 기회 쪽은 '+best.year+'년 '+best.ganZhi+'의 '+best.basis+'가 앞서요. '+contrast+' 한편 주의 쪽에서는 '+risk.year+'년의 '+risk.basis+'를 짚어요. '+risk.caution;
      })}
  ];
  return chapters.map((chapter,index)=>({...chapter,basisId:plan[index].requiredBasis}));
}

function recover(output, initialError, build, validate) {
  const replacements=build();
  const changed=new Set();
  let chapters=Array.isArray(output?.chapters)?output.chapters.slice():[];
  let error=initialError;
  for(let attempt=0;attempt<=replacements.length;attempt++){
    if(!/^(SEOHWA_(?:CHAPTER|PARAGRAPH|HIGHLIGHT|REPORT)_)/.test(error.message))throw error;
    const index=error.chapterIndex;
    if(Number.isInteger(index)&&chapters.length===replacements.length&&!changed.has(index)){
      chapters[index]=replacements[index];
      changed.add(index);
    }else{
      chapters=replacements;
      return {body:validate({chapters}),recoveredChapters:replacements.map((_,i)=>i+2)};
    }
    try{return {body:validate({chapters}),recoveredChapters:Array.from(changed,i=>i+2)};}
    catch(next){error=next;}
  }
  throw error;
}

module.exports={recoveryChapters,recover};
