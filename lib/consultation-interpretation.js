'use strict';
// A documented symbolic reading method, NOT expert approval or event prediction.
// Sources establish traditional categories only; modern decision lenses below
// are our editorial hypotheses and never become calculated personal facts.
const VERSION='ten-god-topic-lenses-1';
const SOURCES=['https://zh.wikisource.org/zh-hant/三命通會/卷五','https://daybreeze.app/guide/sipseong'];
const GODS={比肩:['비견','peer'],劫财:['겁재','peer'],食神:['식신','output'],伤官:['상관','output'],偏财:['편재','wealth'],正财:['정재','wealth'],七杀:['편관','officer'],正官:['정관','officer'],偏印:['편인','resource'],正印:['정인','resource']};
const MEANINGS={peer:'자기 기준과 동료 사이의 관계',output:'생각을 말과 결과물로 표현하는 과정',wealth:'생활의 자원과 실질적인 몫을 다루는 과정',officer:'외부의 기준·책임과 자신을 조율하는 과정',resource:'배움과 도움을 받아들이는 과정'};
const LENSES={
 money:{peer:'함께 쓰는 돈에서 내 몫과 상대 몫의 경계가 흐려지는 상황을 살펴볼 수 있어요. 부탁을 받아 지출하는 일이 있다면 호의와 공동 부담을 구분하고, 합의한 몫을 넘기는 순간을 중단 기준으로 삼아보세요.',output:'표현과 경험을 위한 비용이 결과로 이어지는지 살펴볼 수 있어요. 취미·제작·활동에 지출한다면 실제로 활용하는 비용과 새로 시작할 때만 쓰는 비용을 나누어 보세요.',wealth:'수입의 크기보다 자원을 배분하는 방식에 초점을 맞춰볼 수 있어요. 여러 지출을 동시에 관리한다면 생활에 꼭 필요한 몫과 선택 가능한 몫을 먼저 나누고, 남는 범위 안에서 결정해 보세요.',officer:'책임을 지키려는 지출과 스스로 떠안은 부담을 구분해볼 수 있어요. 가족·조직에 대한 비용이 있다면 실제 의무인지, 기대에 맞추려고 추가한 비용인지 확인해 보세요.',resource:'배움이나 준비에 쓰는 비용이 실제 활용으로 이어지는지 살펴볼 수 있어요. 교육·자료·장비를 산다면 이미 가진 것을 사용할 계획이 없는 상태에서 추가 구매하는 일을 점검해 보세요.'},
 career_business:{peer:'자율적으로 정하는 범위와 함께 책임지는 범위를 나눠볼 수 있어요. 혼자 결정해야 성과가 나는 업무라면 권한이 있는지, 협업 업무라면 기여와 평가 기준이 합의되어 있는지 비교해 보세요.',output:'생각을 실제 결과물로 만들고 평가받는 경로를 살펴볼 수 있어요. 제안하거나 만드는 일을 원한다면 아이디어를 시험할 기회와 결과에 대한 피드백이 있는 자리를 비교해 보세요.',wealth:'노력과 실질적 보상이 연결되는 구조를 살펴볼 수 있어요. 성과 책임이 큰 제안이라면 자원·예산을 조정할 권한도 주어지는지, 보상 조건이 명확한지 함께 확인해 보세요.',officer:'책임과 평가 기준이 맞물리는 업무환경을 살펴볼 수 있어요. 안정적인 조직을 원한다면 규정의 명확함을, 자율성을 원한다면 승인 절차와 재량의 범위를 비교해 보세요.',resource:'배우는 과정이 다음 역할로 연결되는지 살펴볼 수 있어요. 익숙한 업무를 유지할지 새 분야를 배울지 고민이라면 교육·조언을 받을 기회와 배운 것을 맡아볼 기회를 함께 비교해 보세요.'},
 relationship:{peer:'각자의 기준과 함께 정할 약속의 경계를 살펴볼 수 있어요. 독립적인 시간을 원하는 상황이라면 연락 빈도와 혼자 쉬는 시간을 서로 합의할 수 있는지 확인해 보세요.',output:'마음을 표현하는 방식이 상대에게 어떻게 전달되는지 살펴볼 수 있어요. 설명이 길어지는 갈등이라면 내 의도를 더 말하기 전에 상대가 들은 뜻을 확인하고, 원하는 행동을 하나로 좁혀 말해 보세요.',wealth:'돌봄을 실제 시간과 행동으로 나누는 방식을 살펴볼 수 있어요. 한쪽이 더 많이 챙긴다고 느낀다면 선물의 크기보다 약속·집안일·시간의 분담이 서로 납득되는지 확인해 보세요.',officer:'관계에서 기대하는 약속과 책임을 살펴볼 수 있어요. 관계를 진전시키고 싶다면 상대의 마음을 추측하기보다 서로 지킬 수 있는 약속과 부담스러운 기대를 구분해 대화해 보세요.',resource:'위로를 받는 방식과 스스로 결정할 공간을 살펴볼 수 있어요. 조언이 부담스럽게 느껴진다면 해결책이 필요한지, 먼저 이야기를 들어주길 원하는지 구분해 요청해 보세요.'},
 study:{peer:'혼자 세우는 목표와 함께 배우는 환경을 비교해볼 수 있어요. 경쟁이 실제 학습을 돕는지 부담만 늘리는지에 따라 혼자 공부하는 시간과 협업 시간을 나누어 보세요.',output:'배운 것을 설명하거나 만들어보는 과정을 살펴볼 수 있어요. 이해했다고 느낀 내용을 직접 풀거나 설명할 수 있는지를 다음 단계로 넘어가는 기준으로 삼아보세요.',wealth:'학습에 쓰는 시간과 비용의 배분을 살펴볼 수 있어요. 자격이나 과정을 선택한다면 실제로 쓰일 역할과 필요한 자원을 함께 비교해 보세요.',officer:'평가 기준과 공부 계획이 맞는지 살펴볼 수 있어요. 시험이나 심사가 있다면 요구하는 능력과 현재 연습하는 내용을 대조해 보세요.',resource:'이해와 자료 수집이 실제 학습으로 이어지는지 살펴볼 수 있어요. 자료를 계속 늘리기보다 이미 읽은 내용을 설명하고 적용할 수 있는지 확인해 보세요.'}
};
function assessments(chart,topic){
 const lenses=LENSES[topic];if(!lenses)return [];
 const common=chart.candidates.length>1,found=[];
 for(const slot of ['month','year','day','hour']){
  const f=chart.facts.find(f=>f.path==='pillars.'+slot&&(!common||f.candidate_id==='common'));if(!f)continue;
  const v=f.value,slotName={month:'월',year:'연',day:'일',hour:'시'}[slot];
  const entries=[{god:v.stemTenGod,location:slotName+'간'},...(v.branchTenGods||[]).map((god,i)=>({god,location:slotName+'지의 지장간 '+(v.hiddenStems?.[i]||'')}))];
  for(const e of entries){const g=GODS[e.god];if(!g||found.some(a=>a.result.family===g[1]))continue;
   found.push({id:chart.person_id+'.'+topic+'.'+g[1],person_id:chart.person_id,chart_id:chart.chart_id,candidate_ids:chart.candidates.map(c=>c.id),topic,method_version:VERSION,method:'실제 십성 존재→전통적 상징 범주→현재 고민에 적용할 조건부 해석. 월·연·일·시 순으로 서로 다른 범주 최대 두 개를 선택하는 편집 순서이며 강도·우선운 판정이 아닙니다.',sources:SOURCES,supporting_fact_ids:[f.id],result:{family:g[1],ten_god:g[0],location:e.location,meaning:MEANINGS[g[1]],conditional_reading:lenses[g[1]]},limitations:['존재만으로 강약·길흉·성격·사건을 확정하지 않습니다. 현대 적용은 상담 가설이며 전문가 검수 판정이 아닙니다.']});
  }
 }
 return found.slice(0,2);
}
function select(bundle,topic){return bundle.charts.flatMap(c=>assessments(c,topic));}
function paragraph(a){const r=a.result;return `${r.location}에서 ${r.ten_god}이 계산되어 있어요. 전통 명리에서는 이를 ${r.meaning}의 상징으로 읽습니다. ${r.conditional_reading}`;}
module.exports={VERSION,SOURCES,GODS,LENSES,assessments,select,paragraph};
