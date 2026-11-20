'use strict';
const {conflicts}=require('./moving-month');
const wire=require('./consultation-wire');

// Editorial applications of the ten-god symbols. Select only a symbol recorded
// in the current chart. These texts do not establish strength or predict events.
const themes={
 비견:['아무도 결정해 주지 않을 때 남는 집','스스로 납득한 선택에 힘이 실리는 결이에요. 주변에서 좋다고 한 집도 혼자 다시 떠올렸을 때 마음이 멀어진다면, 제 눈에는 아직 내 선택이 되지 않은 집으로 보여요.'],
 겁재:['놓치기 싫은 마음과 살고 싶은 마음','남의 움직임을 보고 내 결심에도 불이 붙는 쪽으로 읽혀요. 누가 먼저 고를 것 같아 갑자기 아까워진 집이라면, 그 사람이 관심을 거둬도 여전히 갖고 싶은지가 내 마음을 가르는 단서예요.'],
 식신:['두 번째 떠올렸을 때 정이 가는 집','한눈에 반한 곳보다 내 손으로 조금씩 가꿔 보고 싶은 곳에 정이 붙는 결이에요. 첫인상이 수수했는데도 자꾸 그 집에서 좋아하는 일을 하는 모습이 그려진다면, 저는 그 끌림에 한 표를 주고 싶어요.'],
 상관:['떠나고 싶은 이유 다음에 오는 것','답답한 틀에서 벗어날 때 마음이 살아나는 결이에요. 지금 집과 정반대라는 이유만으로 새집이 유난히 빛나 보일 수도 있어요. 옛집 이야기를 빼고도 그곳에서 해보고 싶은 게 떠오를 때, 떠날 마음이 갈 곳을 찾은 셈이에요.'],
 정재:['새집에도 가져가고 싶은 것','지금껏 내 손으로 쌓아 온 걸 소중히 여기는 결이에요. 좋은 곳을 보고도 아쉬움이 먼저 올라온다면 예전 집에 남아야 한다는 뜻으로만 읽지 않아도 돼요. 떠나서도 꼭 이어가고 싶은 게 뭔지 보일 때 변화가 한결 내 편이 되는 흐름이에요.'],
 편재:['다른 집이 눈에 들어오는 순간','새 가능성을 빨리 알아보는 눈이 이사에서도 힘을 쓰는 결이에요. 다만 더 재미있어 보이는 곳이 나타날 때마다 앞서 마음에 든 집까지 시들해질 수 있어요. 새로움이 가신 뒤에도 다시 생각나는 곳에 저는 더 무게를 둬요.'],
 정관:['모두가 괜찮다고 한 뒤의 내 대답','맡은 몫을 다할 수 있을 때 마음이 놓이는 결이에요. 그래서 누군가에게 설명하기 좋은 집을 내게도 좋은 집으로 받아들이기 쉬워 보여요. 아무에게도 선택의 이유를 설명할 필요가 없다면 어디로 가고 싶은지, 그때 나오는 대답에는 내 바람이 담겨 있어요.'],
 편관:['급한 마음이 가라앉아도 끌리는 곳','부담이 클 때 오히려 결단력이 살아나는 결이에요. 이사에서는 빨리 정하고 나면 속이 시원할 것 같다는 마음이 강해질 수 있어요. 다 정했다는 후련함을 잠시 빼도 그 집에 들어서는 모습이 반갑다면, 그때는 결단력에 힘을 실어도 좋겠어요.'],
 정인:['떠날 준비가 된 마음의 신호','익숙한 품에서 얻은 안정감이 다음 걸음을 받쳐 주는 결이에요. 새집이 마음에 드는데도 옛집 생각이 나는 건 변화가 틀렸다는 징조로 읽히지 않아요. 낯선 방에서도 나답게 쉴 모습이 떠오르면, 마음은 벌써 조금 건너간 셈이에요.'],
 편인:['자꾸 돌아보게 되는 한 장면','다른 사람이 스쳐 간 작은 차이가 오래 마음에 남는 결이에요. 새집을 떠난 뒤에도 유독 한 장면이 돌아온다면 그 인상을 찬찬히 들여다볼 만해요. 볼수록 이유가 또렷해지는 끌림인지, 생각을 보탤수록 커지는 걱정인지가 갈림길이에요.']
};
const instructions='[개인 이사 풀이] 아래 자료의 outlook_reading.theme은 실제로 이 사람에게서 확인된 십성 하나를 이사 고민에 적용한 참고 해석이다. 각 reference_id에 traditional_interpretation 한 문단씩 쓴다. 이 사람은 어떤 순간에 마음이 움직이고, 같은 결이 어떤 순간에는 선택을 흐릴지 상담사의 시선으로 풀고 스스로 알아볼 단서 하나를 남긴다. 사용자가 직접 말한 망설임이나 후보가 있으면 그 장면에서 읽는다. 가족·재정·동기를 지어내지 않는다. 서로 다른 두 상징의 긴장은 드러내되 결론을 반복하지 않는다. 이삿짐, 계약 실무, 통근, 점검 목록이나 다음 행동으로 분량을 채우지 않는다. options·actions는 비운다. 달을 계산한 경우 시기와 이유는 서버가 먼저 말한다.';
const logistics=/짐차|이삿짐|열쇠.{0,12}(?:인도|주고받|받는)|(?:박스|상자).{0,12}(?:풀|정리)|가구\s*배송|출근|등교|통근|잔금|퇴거|입주\s*(?:일정|시각|지연)|첫\s*평일|중개사|견적|운반\s*업체/;
function applies(bundle,topic,question,history){
 const previous=(Array.isArray(history)?history:[]).filter(m=>m?.role==='user'&&m.content!==question).at(-1)?.content||'';
 const home=/이사(?!장|회|님|건)|이삿|새\s*(?:집|동네)|(?:집|거처)(?:을|를)?\s*옮/;
 const movingContext=bundle.movingWindow || home.test(question) || (!/새 환경/.test(question) && home.test(previous));
 return Boolean(movingContext) && topic==='life_transition' && bundle.charts.length===1 && bundle.topic_assessments.length>0 &&
  !/(?:체크리스트|준비물|실무|견적|이삿짐\s*업체|열쇠\s*인도|잔금\s*(?:준비|처리)|포장\s*방법)/.test(question);
}
function theme(assessment){return themes[assessment.result.ten_god];}
function selectBlocks(out,bundle,memory){
 const blocks=bundle.topic_assessments.map(a=>{
  const valid=out.blocks.find(b=>b.kind==='traditional_interpretation' && b.assessment_ids.length===1 && b.assessment_ids[0]===a.id &&
   b.text.trim() && !logistics.test(b.title+' '+b.text) && !conflicts(b.title+' '+b.text));
  if(valid)return valid;
  const [title,text]=theme(a);
  return wire.materialize({blocks:[{kind:'traditional_interpretation',title,text,reference_id:a.id}]},bundle,memory).blocks[0];
 });
 return {...out,headline:'',blocks,options:[],actions:[],follow_up_question:null};
}
module.exports={applies,theme,instructions,selectBlocks};
