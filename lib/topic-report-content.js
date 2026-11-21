(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./wealth-interactions'));
  else root.TaekilReportTopics=factory(root.TaekilWealthInteractions);
})(globalThis,function(interactions){
  'use strict';
  const topics={
    seohwa:{
      first:'내 사주에 타고난 연애 성향',
      chapters:['2027년 연애·관계운 총평','열두 달의 연애운','나와 어울리는 인연과 관계의 특징','관계 발전과 신중해야 할 시기','향후 10년의 연애·인연운'],
      guide:['올해 새 인연과 기존 관계에서 각각 눈여겨볼 변화','열두 달의 접점과 관계의 속도 변화','내가 마음을 여는 방식과 어울리는 관계','가까워질 여지와 기대가 엇갈릴 때','대운·세운에서 관계의 우선순위가 바뀌는 때'],
      focus:'새 인연과 기존 관계를 대비하고, 4장은 어울리는 관계의 성향을 원국 중심으로 풀어요. 연애 여부나 상대의 정보는 입력되지 않았어요.'
    },
    ijun:{
      first:'내 사주에서 읽는 인연의 성향',
      chapters:['2027년 인연과 관계 변화의 흐름','월별 재회·인연운','지난 인연과 새로운 인연의 흐름','관계를 돌아보고 선택할 시기','향후 10년의 인연운'],
      guide:['지난 인연을 되짚는 흐름과 새 관계에 마음이 가는 흐름','열두 달의 인연 변화와 재검토의 단서','지나간 관계에서 중요했던 것과 다음 관계에 기대할 수 있는 것','관계의 전환을 살펴볼 중요한 세 구간','장기 관계를 바라보는 기준이 변하는 해'],
      focus:'지난 인연의 의미를 돌아보는 흐름과 새 관계에 열리는 흐름을 구별해요. 상대가 연락을 원하지 않는다고 밝혔다면 그 경계를 존중하라는 안내를 필요한 경우 5장 한 문장으로 써요. 상대의 속마음, 과거 사건, 연락 계획은 추측하지 않아요.'
    },
    mujin:{
      first:'내 사주에 타고난 직업 성향',
      chapters:['2027년 직업·이직운 총평','2027년 월별 직업운','나와 어울리는 직업 환경','이직·승진·직업 변화에 주목할 시기','향후 10년의 직업운'],
      guide:['올해 일의 방식과 책임이 달라지는 방향','성장 단서와 변화를 보는 열두 달','내 강점을 쓸 수 있는 환경과 지치기 쉬운 구조','역할 전환의 성격이 다른 세 구간','장기적으로 성장하는 방식이 달라지는 시기'],
      focus:'관성·식상·인성을 원국과 실제 운에서 확인해 역할·결과·배움의 관계를 읽어요. 업무나 소속, 급여, 합격 및 승진을 단정하지 않아요. 면접·업무 조언은 5장 끝 한 문장으로 제한해요.'
    }
  };
  const meanings={
    seohwa:{peer:'내 속도로 마음을 정한 뒤 가까워지는',expression:'마음이 말이나 표정에 드러날 때 가까워지는',practical:'말보다 행동이 이어질 때 마음이 놓이는',trust:'약속이 선명할수록 안정감을 느끼는',support:'세심하게 이해받을 때 마음이 열리는'},
    ijun:{peer:'혼자 납득할 시간을 가지며 인연을 돌아보는',expression:'미처 표현하지 못한 감정을 먼저 돌아보는',practical:'말보다 실제 함께했던 순간으로 인연을 기억하는',trust:'지났어도 지키지 못한 약속을 또렷하게 기억하는',support:'헤어짐 뒤에도 상대가 처했던 맥락을 살피는'},
    mujin:{peer:'일의 순서와 판단 기준을 세울 때 집중하는',expression:'막연한 요청을 결과물로 바꾸는 데 힘을 쓰는',practical:'계획을 실제 일정과 자원으로 바꿀 때 강한',trust:'책임과 평가 기준이 맞물릴 때 실력이 드러나는',support:'사례와 기록에서 기준을 골라 내 일에 적용하는'}
  };
  function first(reading,context,choice){
    const topic=topics[reading.id];
    const [a,b]=context.readings;
    const lead=meanings[reading.id][a.family];
    const second=b&&meanings[reading.id][b.family];
    const day=context.pillars.day;
    const fit=reading.id==='mujin'?'업무 성향':'관계 성향';
    return {title:topic.first,highlight:lead+' 쪽으로 읽혀요.',sections:[
      {title:day+' 일주에서 읽은 '+fit,text:day[0]+' 일간을 기준으로 '+a.natal+' 기둥의 '+a.location+'에서 '+a.term+'을 읽어요. '+(b?b.natal+' 기둥의 '+b.location+'에 '+b.term+'도 있어 '+second+' 모습이 함께 보여요.':'확인된 기둥을 중심으로 읽었어요.')},
      {title:'본편에서 이어 읽을 내용',text:topic.guide[0]+'부터 '+topic.guide.at(-1)+'까지 살펴봐요.'}
    ],basis:context.readings,question:reading.stories[choice].line};
  }
  function natal(pillars,util){
    const day=pillars.day[0];
    const rows=Object.entries(pillars).map(([slot,pair])=>[slot,pair,util.SHI_SHEN[day+pair[0]],util.ZHI_HIDE_GAN[pair[1]].map(h=>h+':'+util.SHI_SHEN[day+h])]);
    const relations=[...interactions.internal(pillars),...interactions.groups(pillars)];
    return {day,rows,relations};
  }
  return {topics,first,natal};
});
