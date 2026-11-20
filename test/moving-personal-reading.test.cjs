'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const calculation=require('../lib/consultation-calculation');
const prompt=require('../lib/consultation-prompt'),movingReading=require('../lib/consultation-moving-reading');
const wire=require('../lib/consultation-wire'),output=require('../lib/consultation-output');
function prepare(day,message,history=[]){
 const bundle=calculation.build({sajuProfile:{y:1990,m:1,d:day,gender:'unknown',hourValue:'unknown',calType:'solar'},message,history},new Date('2026-11-20T03:00:00Z'),false);
 const assembled=prompt.assemble(bundle,history,message,'yeonwoo');
 return {bundle,memory:assembled.memory};
}
test('moving timing, personal cautions and short follow-ups ask for a chart reading; logistics stay available',()=>{
 for(const q of ['내년에 이사하기 좋은 달 추천해줘','이사할 때 제 사주에서 조심할 점은?','새집을 고를 때 나는 뭐에 흔들릴까?'])
  assert.equal(prepare(1,q).bundle.personalMove,true);
 assert.equal(prepare(1,'그럼 제가 주의할 건요?',[{role:'user',content:'이사를 고민해요'}]).bundle.personalMove,true);
 for(const q of ['이삿짐 업체 선택 체크리스트 추천해줘','새 환경에서 잘 적응하려면?','집이 팔릴까요?','이사 날짜 2027년 3월 7일과 10일 비교'])
  assert.equal(prepare(1,q).bundle.personalMove,false);
});
test('moving paragraphs come from each chart even when generic logistics carry valid references',()=>{
 const readings=[];
 for(const day of [1,3,10]){
  const {bundle,memory}=prepare(day,'내년에 언제쯤 이사하기 좋을까요?');
  const [first,second]=bundle.topic_assessments;
  const raw={status:'answer',headline:'새집의 첫 평일을 준비해요',blocks:[
   {kind:'traditional_interpretation',reference_id:first.id,title:'짐차',text:'열쇠 인도를 먼저 맞춰요.'},
   {kind:'traditional_interpretation',reference_id:second.id,title:'추가 시기',text:'다음 달에 옮겨요.'}],
   options:[{label:'같은 날 퇴거',suitable_when:'',tradeoff:'',next_action:''}],actions:['잔금을 준비해요.'],follow_up_question:null,data_limitations:wire.limitations(bundle)};
  const out=movingReading.selectBlocks(wire.materialize(raw,bundle,memory),bundle,memory);
  assert.deepEqual(output.validate(out,bundle,memory),[]);
  assert.deepEqual(out.blocks.map(b=>b.assessment_ids[0]),[first.id,second.id]);
  assert(out.blocks.every(b=>b.person_id===first.person_id&&b.evidence.length));
  const prose=output.render(out,bundle);
  assert.doesNotMatch(prose,/열쇠|퇴거|짐차|잔금|다음 달|첫 평일|다음 행동/);
  assert.match(prose,/태어난 시/);
  readings.push(prose);
  const specific='주변에서 먼저 고른 집도 혼자 떠올렸을 때 마음이 편해지는지 보세요.';
  raw.blocks[0].title='다시 떠올린 집';raw.blocks[0].text=specific;
  assert.equal(movingReading.selectBlocks(wire.materialize(raw,bundle,memory),bundle,memory).blocks[0].text,specific);
 }
 assert.equal(new Set(readings).size,3);
});
