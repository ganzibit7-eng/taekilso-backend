'use strict';
const {LunarUtil}=require('lunar-javascript');
const reference=require('./newyear-reference');
const terms={'劫财':'겁재','比肩':'비견','食神':'식신','伤官':'상관','偏财':'편재','正财':'정재','七杀':'편관','正官':'정관','偏印':'편인','正印':'정인'};
const elements={木:'목',火:'화',土:'토',金:'금',水:'수'};
const generates={목:'화',화:'토',토:'금',금:'수',수:'목'},overcomes={목:'토',토:'수',수:'화',화:'금',금:'목'};
const stemOrder='甲乙丙丁戊己庚辛壬癸';
const lenses={
 '比肩':['나의 기준과 협업','내가 직접 결정할 부분과 함께 합의할 부분을 나누어 보세요.'],
 '劫财':['공동 자원과 역할','비용·시간을 함께 쓰는 일이 있다면 부담과 결정권을 먼저 합의해 보세요.'],
 '食神':['꾸준한 결과물','만들고 있는 결과물이 있다면 지속 가능한 작업량과 완성 기준을 확인해 보세요.'],
 '伤官':['표현과 피드백','의견을 전할 일이 있다면 전달 목적과 상대의 피드백을 함께 살펴보세요.'],
 '偏财':['여러 선택의 비용','새 제안이 실제로 생기면 기대 이익과 감당할 비용을 같은 표에서 비교해 보세요.'],
 '正财':['반복되는 자원 관리','정기적인 수입·지출·일정이 있다면 실제 기록을 바탕으로 관리 기준을 점검해 보세요.'],
 '七杀':['변화와 부담의 경계','새 책임이나 기한이 실제로 생기면 지원 자원과 부담의 상한을 먼저 확인해 보세요.'],
 '正官':['책임과 합의 기준','지켜야 할 약속이나 기준이 있다면 역할·기한·변경 절차를 확인해 보세요.'],
 '偏印':['정보와 판단 근거','새 정보를 받아들일 때 출처와 현재 상황에 적용할 수 있는 조건을 확인해 보세요.'],
 '正印':['배움과 도움','학습이나 도움이 필요한 상황이라면 필요한 내용과 도움받을 경로를 구체화해 보세요.']
};
function stemComparison(dayStem,otherStem){
 const a=elements[LunarUtil.WU_XING_GAN[dayStem]]||LunarUtil.WU_XING_GAN[dayStem],b=elements[LunarUtil.WU_XING_GAN[otherStem]]||LunarUtil.WU_XING_GAN[otherStem];
 const relation=a===b?'같은 오행':generates[a]===b?'일간이 상대 천간의 오행을 생하는 관계':generates[b]===a?'상대 천간이 일간의 오행을 생하는 관계':overcomes[a]===b?'일간이 상대 천간의 오행을 극하는 관계':'상대 천간이 일간의 오행을 극하는 관계';
 const god=LunarUtil.SHI_SHEN[dayStem+otherStem],same=stemOrder.indexOf(dayStem)%2===stemOrder.indexOf(otherStem)%2;
 return {dayStem,otherStem,dayElement:a,otherElement:b,polarity:same?'같은 음양':'다른 음양',relation,tenGod:god,tenGodKorean:terms[god]||god,reviewLens:{theme:lenses[god]?.[0]||'현재의 선택 기준',question:lenses[god]?.[1]||'현재 상황과 선택 조건을 확인해 보세요.'}};
}
function comparisonNote(c){return `일간 ${c.dayStem}(${c.dayElement})과 천간 ${c.otherStem}(${c.otherElement})은 ${c.relation}이며 ${c.polarity}입니다. 이 계산 분류의 명칭은 ${c.tenGodKorean}입니다.`;}
function buildContext(bundle){
 const chart=bundle.charts[0],period=bundle.periods[0],day=chart.candidates[0].pillars.day.ganZhi[0];
 const commonPillars=Object.fromEntries(Object.entries(chart.candidates[0].pillars).filter(([slot,p])=>chart.candidates.every(c=>JSON.stringify(c.pillars[slot])===JSON.stringify(p))));
 return {calculationVersion:bundle.version,personId:chart.person_id,chartId:chart.chart_id,candidateIds:chart.candidates.map(c=>c.id),natal:{commonPillars,ambiguous:chart.candidates.length>1,policy:chart.calculation_policy},annual:{...period.value.annual,comparison:stemComparison(day,period.value.annual.ganZhi[0])},months:period.value.months.map(m=>({...m,segments:m.segments.map(s=>({...s,comparison:stemComparison(day,s.monthGanZhi[0])}))})),daewoon:period.value.daewoon,method:{version:'calendar-comparison-v1',calculation:'입력된 한국시간 일간과 실제 연·월 천간의 오행 생극 및 음양을 비교하여 엔진의 십성 분류를 설명합니다. 절기 구간은 서버의 계산값을 사용합니다.',interpretation:'reviewLens는 십성의 상징을 실제 생활의 확인 질문으로 바꾼 편집 방법입니다. 전문가가 검수한 길흉·사건 예측 규칙이 아니며 해당 상황이 있을 때만 조건부로 적용합니다.',excluded:'강약·용신·격국·합충·신살·사건 가능성·성공 확률·좋은 달/나쁜 달 순위를 판정하지 않습니다.'},limitations:[...chart.limitations,...period.limitations]};
}
function monthNote(month){return reference.monthNote(month)+'\n\n'+[...new Map(month.segments.map(s=>[s.comparison.tenGod,comparisonNote(s.comparison)])).values()].join('\n')+'\n이 분류만으로 좋은 달·나쁜 달이나 실제 사건을 판정하지 않습니다.';}
module.exports={buildContext,stemComparison,comparisonNote,monthNote};
