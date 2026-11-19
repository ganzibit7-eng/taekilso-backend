const {test}=require('node:test'),assert=require('node:assert/strict');
const prompt=require('../lib/consultation-prompt'),calc=require('../lib/consultation-calculation');
test('personal concerns get full readings, explicit detail grows, explicit brevity remains available',()=>{
 assert.equal(prompt.responseLength('재물운은 어떤가요?',[]).mode,'standard');
 assert.equal(prompt.responseLength('간단히 말고 자세히 풀이해주세요',[]).mode,'detailed');
 assert.equal(prompt.responseLength('짧게 핵심만 알려주세요',[]).mode,'brief');
 assert.equal(prompt.responseLength('비견이 무슨 뜻인가요?',[]).mode,'concept');
});
test('followups explain the new question while a topic change receives a full first reading',()=>{
 const history=[{role:'user',content:'재물과 소비가 궁금해요'},{role:'assistant',content:'앞선 풀이'}];
 assert.equal(prompt.responseLength('그럼 같이 쓰는 돈은요?',history).mode,'followup');
 assert.equal(prompt.responseLength('이번에는 연애를 봐주세요',history).mode,'standard');
 assert.equal(prompt.responseLength('그 부분을 상세하게 알려줘요',history).mode,'detailed');
});
test('length instructions preserve unsupported-data boundaries, persona and one selected topic',()=>{
 const body={sajuProfile:{y:1990,m:1,d:1,hourValue:'unknown',gender:'unknown',calType:'solar'},message:'이직할 때 제 사주에서 어떤 선택이 잘 맞나요?'};
 const assembled=prompt.assemble(calc.build(body),[],body.message,'taeyul');
 assert.match(assembled.system,/1200~1800자/);assert.match(assembled.system,/자료가 부족하거나 답을 제한해야 하는 질문/);assert.match(assembled.system,/잘 오셨|충청/);
 assert.doesNotMatch(prompt.OUTPUT,/2~3개 짧은 문단이면 충분|후속 질문은 한 문단/);
 assert.equal(assembled.topic,'career_business');
});

test('ordinary words about being overloaded route to career evidence for Yeonwoo',()=>{
 const message='일이 몰리면 전부 맡다가 지쳐요. 제 사주에서 일할 때의 강점과, 일을 나눌 때 적용해볼 기준을 쉽게 알려주세요.';
 const profile={y:1990,m:4,d:2,hourValue:'unknown',gender:'unknown',calType:'solar'};
 const bundle=calc.build({message,sajuProfile:profile});
 const assembled=prompt.assemble(bundle,[],message,'yeonwoo');
 assert.equal(assembled.topic,'career_business');
 assert.ok(bundle.topic_assessments.length>0);
 assert.ok(bundle.topic_assessments.every(item=>item.topic==='career_business'&&item.supporting_fact_ids.length>0));
 assert.equal(prompt.topic('큰일이 났어요. 무엇부터 하면 좋을까요?'),'general_report');
});

test('ordinary references to a romantic partner route to relationship evidence for Seohwa',()=>{
 const message='연인이 서운했다고 말하면 저는 이유부터 설명해요. 사주를 바탕으로 서로 오해를 덜 하려면 어떤 말부터 꺼내면 좋을까요?';
 const profile={y:1990,m:4,d:2,hourValue:'unknown',gender:'unknown',calType:'solar'};
 const bundle=calc.build({message,sajuProfile:profile});
 assert.equal(prompt.assemble(bundle,[],message,'seohwa').topic,'relationship');
 assert.ok(bundle.topic_assessments.length>0);
 assert.ok(bundle.topic_assessments.every(item=>item.topic==='relationship'&&item.supporting_fact_ids.length>0));
});

test('Damwon distinguishes possible homes from possible move dates',()=>{
 const message='이사 후보 하나는 출퇴근이 편하고 다른 곳은 동네가 마음에 들어요. 제 사주를 바탕으로 평일 생활을 비교할 기준을 알려주세요.';
 const profile={y:1990,m:4,d:2,hourValue:'unknown',gender:'unknown',calType:'solar'};
 const bundle=calc.build({message,sajuProfile:profile});
 assert.equal(prompt.assemble(bundle,[],message,'damwon').topic,'life_transition');
 assert.ok(bundle.topic_assessments.length>0);
 assert.ok(bundle.topic_assessments.every(item=>item.topic==='life_transition'&&item.supporting_fact_ids.length>0));
 assert.equal(prompt.topic('이사 후보 날짜를 비교하고 싶어요.'),'date_selection');
 assert.equal(prompt.topic('이사는 5월 1일이랑 5월 8일 중에 고민해요.'),'date_selection');
});
