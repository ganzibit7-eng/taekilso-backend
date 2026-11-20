const {test}=require('node:test'),assert=require('node:assert/strict');
const calc=require('../lib/consultation-calculation'),prompt=require('../lib/consultation-prompt'),rules=require('../lib/consultation-interpretation'),output=require('../lib/consultation-output');
const profile={y:1990,m:1,d:1,hourValue:'unknown',gender:'male',calType:'solar'};
function bundle(p=profile){return calc.build({sajuProfile:p,message:'돈이 새기 쉬운 부분은?'},new Date('2026-11-13T00:00:00Z'));}
function response(){return {status:'answer',headline:'함께 쓰는 돈의 경계를 살펴보세요.',blocks:[{kind:'practical_suggestion',title:'확인 기준',text:'공동 지출이 있다면 합의한 부담 범위를 먼저 확인해 보세요.',person_id:null,evidence:[],candidate_ids:[],assessment_ids:[],context_ids:[]}],options:[],actions:[],follow_up_question:null,data_limitations:[]};}
test('each topic uses actual natal ten gods with traceable person/candidate and method, without changing free calculation',()=>{
 for(const p of [profile,{...profile,y:2004,m:9,d:24},{...profile,y:2027,m:2,d:4},{...profile,hourValue:'14'}]){
  const b=bundle(p),c=b.charts[0],before=JSON.stringify(c.facts);
  for(const t of Object.keys(rules.LENSES))for(const a of rules.select(b,t)){
   assert.equal(a.person_id,c.person_id);assert.equal(a.chart_id,c.chart_id);assert.deepEqual(a.candidate_ids,c.candidates.map(c=>c.id));
   const f=c.facts.find(f=>f.id===a.supporting_fact_ids[0]);assert(f);if(c.candidates.length>1)assert.equal(f.candidate_id,'common');
   const han=Object.keys(rules.GODS).find(k=>rules.GODS[k][0]===a.result.ten_god);assert([f.value.stemTenGod,...f.value.branchTenGods].includes(han));assert(a.method_version&&a.sources.length);assert.match(a.limitations.join(' '),/전문가 검수 판정이 아닙니다/);
   if(p.hourValue==='unknown')assert(!a.result.location.startsWith('시'));
  }
  assert.equal(JSON.stringify(c.facts),before);assert.equal(c.facts.at(-1).path,'basic_report');
 }
});
test('same chart has distinct money/work/love/study lenses, not fabricated dominant stars',()=>{
 const b=bundle(),texts=Object.keys(rules.LENSES).map(t=>rules.select(b,t).map(rules.paragraph).join(' '));assert.equal(new Set(texts).size,texts.length);
 for(const text of texts){assert.match(text,/살펴|확인|비교/);assert(!/돈을 잃|반드시|타고난|신강|신약|계산되어|지장간/.test(text));}
});
test('brief followup inherits user topic, new topic wins and assistant claims never classify it',()=>{
 const h=[{role:'user',content:'연애 관계가 고민이에요'},{role:'assistant',content:'돈을 써야해요'}];
 assert.equal(prompt.resolveTopic('그럼 어떤 기준으로 대화할까요?',h),'relationship');assert.equal(prompt.resolveTopic('공부하는 방법이 궁금해요',h),'study');assert.equal(prompt.resolveTopic('돈이 새는 곳은?',h),'money');
 assert.equal(prompt.topic('헤어진 사람에게 다시 연락할까요?'),'relationship');
 assert.equal(prompt.topic('직무 후보 두 개를 어떻게 비교할까요?'),'career_business');
 assert.equal(prompt.topic('이사 후보 두 날을 비교해 주세요.'),'date_selection');
 assert.equal(prompt.topic('정산이 밀려 수입이 늦어져요.'),'money');
 assert.equal(prompt.topic('본업 후 부업을 먼저 시험해 보고 싶어요.'),'career_business');
});
test('server binds a source even if the provider returns generic advice; unrelated definitions get no forced anchor',()=>{
 const b=bundle();prompt.assemble(b,[],'돈이 새기 쉬운 부분은?');
 const text=output.render(response(),b);
 assert.match(text,/함께 쓰는 돈에서 내 몫과 상대 몫의 경계/);assert.doesNotMatch(text,/월간|비견|오행/);
 assert(output.reasons(response(),b).some(row=>row.label==='월간 · 비견'));
 const concept=bundle();prompt.assemble(concept,[],'재물에서 정재의 뜻은?');assert.deepEqual(concept.topic_assessments,[]);
});
test('valid topical block passes; borrowed evidence and invented ten god fail',()=>{
 const b=bundle();const a=prompt.assemble(b,[],'돈이 새는 부분은?'),assessment=b.topic_assessments[0],r=response();
 r.blocks[0]={kind:'traditional_interpretation',title:'사주 관점',text:'함께 쓰는 돈의 경계라는 관점을 현재의 고민에 연결해 살펴보세요.',person_id:assessment.person_id,evidence:assessment.supporting_fact_ids.map(id=>({id})),candidate_ids:assessment.candidate_ids,assessment_ids:[assessment.id],context_ids:[]};assert.deepEqual(output.validate(r,b,a.memory),[]);
 r.blocks[0].text='정재가 있으니 살펴보세요.';assert(output.validate(r,b,a.memory).includes('UNSUPPORTED_TEN_GOD'));
 r.blocks[0].evidence=[{id:b.charts[0].facts.at(-1).id}];assert(output.validate(r,b,a.memory).includes('ASSESSMENT_WITHOUT_SUPPORT'));
});
test('other people stay separate and unavailable topics invent no evidence',()=>{
 const b=calc.build({subjects:[{profile},{profile:{...profile,d:2}}],message:'궁합'});prompt.assemble(b,[],'두 사람의 관계를 비교해줘');
 for(const a of b.topic_assessments)assert(b.charts.find(c=>c.person_id===a.person_id).facts.some(f=>f.id===a.supporting_fact_ids[0]));
 assert.deepEqual(rules.select(b,'medical'),[]);assert.deepEqual(rules.select({charts:[]},'money'),[]);
});

test('ordinary outcome questions get an outlook grounded in the selected chart and topic',()=>{
 const cases=[
  ['집을 이사하고 싶은데 기존집이 매매가 될까요','home_sale'],
  ['대출도 남았는데 아파트가 팔릴까요?','home_sale'],
  ['이사 전에 12월 1일까지 집이 팔릴까요?','home_sale'],
  ['이번 면접에 합격할까요?','career_business'],
  ['가게가 잘될까요?','career_business'],
  ['시험에 붙을까요?','study'],
  ['헤어진 사람과 다시 대화가 이어질까요?','relationship'],
  ['목표한 돈을 모을 수 있을까요? 가능성이 궁금해요','money']
 ];
 for(const [question,topic] of cases){
  const b=bundle(),a=prompt.assemble(b,[],question);
  assert.equal(a.topic,topic);assert.match(a.system,/\[성사·기회를 묻는 질문\]/);
  assert(b.topic_assessments.length);assert(b.topic_assessments.every(r=>r.topic===topic));
 }
 assert.equal(prompt.resolveTopic('그럼 성사될까요?',[{role:'user',content:cases[0][0]}]),'home_sale');
 assert.equal(prompt.topic('집을 팔고 이사할 날짜 두 후보 날짜 비교해줘'),'date_selection');
 assert.doesNotMatch(prompt.assemble(bundle(),[],'공부 계획을 짜고 싶어요').system,/\[성사·기회를 묻는 질문\]/);
});

test('outlook quality check distinguishes a disclaimer-led answer from a conditional reading',()=>{
 assert(output.opensWithDisclaimer('이번 면접의 합격을 단정할 수는 없지만, 경험을 설명할 때 강점이 드러나요.'));
 assert(output.opensWithDisclaimer('다시 연락이 이어질지는 단정할 수 없어요. 다만 대화할 여지는 있어요.'));
 assert(output.opensWithDisclaimer('경험이 강점으로 읽혀요. 합격 자체를 가를 근거는 없지만 방법은 있어요.'));
 assert(!output.opensWithDisclaimer('조건을 하나 열어둘 때 매매 이야기가 진전되기 쉬운 흐름이에요. 매수자의 의도까지 알 수는 없어요.'));
});

test('same question and advisor receive different grounded readings while explicit advice stays available',()=>{
 const question='이사하고 싶은데 지금 집 매매가 어떻게 될까요?';
 const snapshots=[1,3,10].map(d=>{
  const b=bundle({...profile,d});const a=prompt.assemble(b,[],question,'yeonwoo');
  assert(b.readingOnly);
  const data=JSON.parse(a.system.split('[서버 계산 자료]\n')[1].split('\n\n[현재 질문]')[0]);
  const lenses=data.charts[0].interpretation_assessments.filter(x=>x.topic==='home_sale');
  assert(lenses.every(x=>x.result.outlook_reading.symbol && x.result.outlook_reading.theme && !x.result.conditional_reading));
  assert(lenses.every(x=>x.supporting_fact_ids.every(id=>data.charts[0].facts.some(f=>f.id===id))));
  const sample=response();sample.options=[{label:'옵션제목',suitable_when:'',tradeoff:'',next_action:''}];sample.actions=['중개사에게 물어보세요'];
  assert.doesNotMatch(output.render(sample,b),/옵션제목|지금 해볼 일/);
  return lenses.map(x=>x.result.outlook_reading.theme).join('|');
 });
 assert.equal(new Set(snapshots).size,3);
 const b=bundle();prompt.assemble(b,[],'지금 집 매매가 될까요? 제가 준비할 방법도 알려주세요.','yeonwoo');
 assert(!b.readingOnly);assert(b.outlookRequested);
});
