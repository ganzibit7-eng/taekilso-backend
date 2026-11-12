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
 for(const text of texts){assert.match(text,/계산되어/);assert(!/돈을 잃|반드시|타고난|신강|신약/.test(text));}
});
test('brief followup inherits user topic, new topic wins and assistant claims never classify it',()=>{
 const h=[{role:'user',content:'연애 관계가 고민이에요'},{role:'assistant',content:'돈을 써야해요'}];
 assert.equal(prompt.resolveTopic('그럼 어떤 기준으로 대화할까요?',h),'relationship');assert.equal(prompt.resolveTopic('공부하는 방법이 궁금해요',h),'study');assert.equal(prompt.resolveTopic('돈이 새는 곳은?',h),'money');
});
test('server binds a source even if the provider returns generic advice; unrelated definitions get no forced anchor',()=>{
 const b=bundle();prompt.assemble(b,[],'돈이 새기 쉬운 부분은?');assert.match(output.render(response(),b),/월간에서 비견이 계산/);assert(output.reasons(response(),b).length);
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
