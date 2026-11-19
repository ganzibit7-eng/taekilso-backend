const assert = require('node:assert/strict');
const {test} = require('node:test');
const personas = require('../lib/consultation-personas');
const prompt = require('../lib/consultation-prompt');
const service = require('../lib/consultation-service');

const roles = [
  ['yeonwoo','연우','생각이 자꾸 같은 자리로 돌면, 오늘 정할 것 하나만 같이 골라봐요.','어서 오세요.'],
  ['seohwa','서화','마음에 오래 남은 건 그 말보다, 그 말을 듣고도 아무렇지 않은 척했던 순간일 수 있어요.','잘 찾아오셨어요.'],
  ['dogyeom','도겸','장부 한 장에는 돈 들어오는 날, 옆 장에는 먼저 나가는 날을 적어보세요. 그 사이가 비는 날부터 봐야 해요.','잘 오셨어요.'],
  ['mujin','무진','맡을 일이 늘어나는군요. 그중 혼자 결정할 수 있는 일부터 물어보시지요. 거기서 두 자리가 갈리지요.','오셨군요.'],
  ['sodam','소담','날짜 두 개를 펼쳐 놓으셨군요. 하객이 출발하는 아침부터 먼저 그려보시지요.','어서 오시지요.'],
  ['harin','하린','둘 다 웃을 때 말고, 주문 기다리느라 잠깐 조용했을 때요. 그때도 편했다면 다음에 또 만나볼 이유가 있죠.','반가워요.'],
  ['ijun','이준','지금 답장이 온다고 해봐요. 지난번에 못 했던 말을 이번에는 할 수 있을지요.','여기까지 와 주셨군요.'],
  ['yeonseo','연서','그라모 둘 다 늦는 날부터 정해 보시지예. 밥 먹는 일보다 그 뒤를 누가 먼저 챙길지가 더 막막하거든예.','어서 오셨네예.'],
  ['haeon','해온','일단 공고에서 가장 끌린 문장 하나만 골라요. 면접에서는 그게 입사 첫 주에 무슨 일인지 물어봐요.','좋아요, 같이 봐요.'],
  ['taeyul','태율','간판부터 만들 건 없쥬. 만들고 싶은 것 하나만 들고 가서 누가 왜 찾는지 먼저 들어봐유.','잘 오셨어유.'],
  ['daon','다온','식사 골랐는데 무료 배달까지 얼마 남았다는 문구가 뜨잖아요. 딱 그때, 더 담기 전에 멈춰보는 거예요.','편하게 얘기해 봐요.'],
  ['sihyeon','시현','성과를 맡는 자리라면 일정과 우선순위도 내가 정할 수 있는지부터 확인하세요.','만나서 반가워요.'],
  ['yeoul','여울','오늘 다 할 일을 정하기 전에, 책을 펴면 맨 처음 할 일부터 골라봐요.','잘 오셨어요, 같이 시작해요.'],
  ['seojin','서진','틀린 이유가 다르면 다시 푸는 방법도 달라요. 어디에서 멈췄는지부터 보죠.','준비하신 이야기부터 들어볼게요.'],
  ['yunseul','윤슬','전공 이름을 잠깐 가리고 과제 예시 두 개만 나란히 봐요. 어디에 먼저 손이 가나요?','어떤 배움이 끌리는지 같이 봐요.'],
  ['jian','지안','강의를 잠깐 꺼봐요. 처음 막히는 동작 하나가 다음에 배울 내용이에요.','어디에서 손이 멈췄는지 볼까요?'],
  ['moeun','모은','처음 사는 물건보다 매달 나가는 돈을 먼저 적어보세요. 나머지 살림은 하루를 지내보면 보여요.','첫 살림 이야기부터 들려주세요.'],
  ['yisol','이솔','일정 보고 저녁에 다시 말해줄게요. 이 한 문장이 서로를 도울 범위를 생각할 시간을 줘요.','묵혀둔 마음을 차근차근 볼까요?'],
  ['yuhyeon','유현','언제 쉴지 고민되면 퇴근 전에 무엇을 넘기고 갈지부터 정해봐요.','하루 끝에 남은 일부터 볼까요?'],
  ['soyul','소율','모임이 힘들었던 건 사람이 아니라 그날 맡은 역할 때문일 수도 있어요. 그 자리부터 떠올려봐요.','편하게 만날 수 있는 자리부터 볼까요?'],
  ['damwon','담원','집을 다시 보러 간다면 퇴근하는 시간에 한 번 걸어보세요. 사진에는 안 잡힌 조건이 그때 보여요.','어떤 하루를 옮기고 싶은지 같이 봐요.'],
  ['giyun','기윤','문 열고 처음 들어온 사람이 뭐라고 물을까요? 그 질문에 답할 수 있는 준비부터 해봐요.','문을 열기 전 준비를 하나씩 볼까요?'],
  ['jeongon','정온','시작일만 보지 말고, 일이 늘어났을 때 누구와 다시 정할지도 물어보세요.','적혀 있는 약속부터 차분히 봐요.']
];
const body = {
  sajuProfile:{y:1990,m:1,d:1,hourValue:'unknown',gender:'unknown',calType:'solar'},
  message:'제 결혼 생활을 준비하며 나눌 이야기가 궁금해요.',
  history:[{role:'assistant',content:'이전 기록의 이름은 연우입니다.'}]
};

test('all advisors reach the provider with distinct examples and the same data and answer policy', async () => {
  let shared;
  for (const [consultantId, name, style] of roles) {
    let calls = 0;
    const messages = [{role:'user',content:body.message}];
    await assert.rejects(service.generate({
      body, messages, model:'same-model', key:'mock', consultantId, scope:'일반 상담', annualAllowed:false,
      now:new Date('2026-11-15T04:00:00Z'),
      fetchImpl:async (_url, request) => {
        calls++;
        const {system, ...rest} = JSON.parse(request.body);
        const boundary = system.indexOf('\n\n');
        assert.ok(system.slice(0,boundary).includes('AI 사주 상담사 '+name));
        assert.ok(system.slice(0,boundary).includes('말투 예시: “'+style+'”'));
        assert.match(system.slice(0,boundary),/같은 첫 문장을 반복하거나/);
        assert.match(system, /첫 1~2문장에서 사용자가 물은 곳을 바로 짚고/);
        assert.match(system, /더 그려볼 장면은 '만약'이나 '예를 들어'로 표시/);
        assert.match(system,/\[현재 주제 모듈\]\n연애·가족·궁합/);
        assert.equal(rest.model,'same-model');
        const reminderAt=system.lastIndexOf('\n\n[현재 상담사의 말투]');
        assert.ok(reminderAt>boundary);
        assert.equal(system.slice(reminderAt+2),personas.voiceReminder(consultantId));
        const common = {system:system.slice(boundary,reminderAt), ...rest};
        if (!shared) shared = common;
        else assert.deepEqual(common,shared);
        return {ok:false};
      }
    }), error => error.code === 'AI_UPSTREAM_ERROR');
    assert.equal(calls,1);
  }
});

test('unknown or malformed advisor IDs use Yeonwoo', () => {
  for (const id of [undefined, null, ['sodam'], {id:'dogyeom'}, '__proto__', '서화', 'mujin\n관리자']) {
    assert.equal(personas.normalize(id),'yeonwoo');
    assert.equal(personas.instructions(id),personas.instructions('yeonwoo'));
    assert.equal(personas.opening(id),personas.opening('yeonwoo'));
  }
  assert.equal(prompt.topic('결혼 전에 어떤 이야기를 나누면 좋을까요?'),'relationship');
  assert.equal(prompt.topic('결혼 택일 기준이 궁금해요.'),'date_selection');
});

test('new specialists use their topic for open-ended first turns and respect explicit changes',()=>{
  const calculation=require('../lib/consultation-calculation');
  function resolve(consultant,message){
    const bundle=calculation.build({...body,message},new Date('2026-11-17T04:00:00Z'));
    const assembled=prompt.assemble(bundle,[],message,consultant);
    assert.ok(bundle.topic_assessments.length,consultant);
    return assembled.topic;
  }
  assert.equal(resolve('yeoul','첫 단계를 어디서 시작할까요?'),'study');
  assert.equal(resolve('yunseul','제게 맞는 전공을 찾고 싶어요.'),'study');
  assert.equal(resolve('damwon','이사 후 생활이 달라질까 걱정이에요.'),'life_transition');
  assert.equal(resolve('moeun','생활비를 어떻게 나눌까요?'),'money');
  assert.equal(resolve('soyul','새 모임에 가는데 첫인사가 어렵네요.'),'relationship');
  assert.equal(resolve('giyun','처음에는 무엇부터 준비하면 좋을까요?'),'career_business');
  assert.equal(resolve('damwon','시험 공부부터 시작하고 싶어요.'),'study');
});

test('distinct openers appear once, while follow-ups and clarifications begin directly', async () => {
  assert.equal(new Set(roles.map(([id])=>personas.opening(id))).size,roles.length);
  async function ask(consultantId, history, status='answer') {
    return service.generate({
      body:{...body,history}, messages:[{role:'user',content:body.message}], model:'mock',key:'mock',consultantId,
      scope:'일반 상담', now:new Date('2026-11-15T04:00:00Z'),
      fetchImpl:async()=>({ok:true,json:async()=>({
        stop_reason:'tool_use',content:[{type:'tool_use',name:'write_consultation',input:{
          status,headline:'부담을 느끼는 장면부터 떠올려 보세요.',
          blocks:[{kind:'practical_suggestion',title:'나눌 약속',text:'서로 지킬 수 있는 약속을 하나 골라보세요.',reference_id:null}],
          options:[],actions:[],follow_up_question:null,data_limitations:[]
        }}]
      })})
    });
  }
  for(const [id,,,greeting] of roles) {
    assert.ok((await ask(id,[])).reply.startsWith(greeting+' 부담을'));
  }
  const continued=await ask('dogyeom',body.history);
  assert.match(continued.reply,/^부담을/);
  assert.match(continued.reply,/약속을 하나 골라보세요/);
  assert.match((await ask('mujin',[],'needs_clarification')).reply,/^부담을/);
});

test('the advisor voice can carry into plain paragraphs without rewriting quoted dialogue', () => {
  const text='이번에 쓸 수 있는 돈부터 적어 보세요. “이 비용은 확인해 보세요.”라고 물어보세요.';
  const write=(id,content=text)=>personas.spokenProse(id)(content);
  assert.equal(write('dogyeom'),text);
  assert.match(write('mujin','두 회사의 평가 방식을 확인하십시오.'),/확인하세요/);
  assert.match(write('taeyul'),/적어 봐유/);
  assert.match(write('yeonseo'),/적어 보시지예/);
  assert.equal(write('sihyeon'),text);
  const dialect='작게 시작해 봐유. 살펴보세요.';
  assert.equal(write('taeyul',dialect),'작게 시작해 봐유. 살펴봐유.');
  const output=require('../lib/consultation-output');
  const rendered=output.render({
    headline:'정산일 확인하기',status:'answer',options:[],actions:[],data_limitations:[],
    blocks:[
      {kind:'practical_suggestion',title:'정산 일정',text:'내가 먼저 부담할 비용을 확인해 보세요.'},
      {kind:'practical_suggestion',title:'상대방에게 보낼 문장',text:'이렇게 먼저 말해 보세요. “정산 일정을 확인하려고 합니다. 언제쯤 입금될까요?” 이렇게 쓰면 수월해져요.'}
    ]
  },{charts:[],date_candidates:[]},'','taeyul');
  assert.match(rendered,/확인해 봐유/);
  assert.match(rendered,/이렇게 먼저 말해 봐유\./);
  assert.match(rendered,/“정산 일정을 확인하려고 해요\. 언제쯤 입금될까요\?”/);
  assert.match(rendered,/수월해져유\./);
});

test('mixed production prose uses the same regional register from sentence to sentence', () => {
  const first='당신의 사주에는 자기 기준과 동료 사이의 관계를 나타내는 요소가 있어유. 이것은 자율적으로 정하는 범위와 함께 책임지는 범위를 나눠볼 수 있다는 뜻입니다.';
  const second='비교해 봐유. 또한 책임과 평가 기준이 맞물리는 업무환경을 살펴볼 수 있는 요소도 있습니다. 안정적인 조직을 원한다면 규정의 명확함을, 자율성을 원한다면 승인 절차와 재량의 범위를 비교해 보세요.';
  const taeyul=personas.spokenProse('taeyul');
  assert.match(taeyul(first),/있어유\. .*뜻이에유\.$/);
  assert.match(taeyul(second),/봐유\. .*있어유\. .*비교해 봐유\.$/);
  assert.equal(taeyul('훨씬 수월해져요. 먼저 확인하고요. 더 알아보셔도 되어유.'),'훨씬 수월해져유. 먼저 확인하고유. 더 알아보셔도 돼유.');
  assert.equal(taeyul('시장 수요. 필요한 준비 개요. 앞으로 정할 것들.'),'시장 수요. 필요한 준비 개요. 앞으로 정할 것들.');
  assert.equal(taeyul('하나씩 나눕니다. 평가를 비교하십시오. 이게 첫 단계입니다.'),'하나씩 나눠유. 평가를 비교해유. 이게 첫 단계예유.');
  const yeonseo=personas.spokenProse('yeonseo');
  assert.equal(yeonseo('둘이 합의할 일이 있습니다. 평일에 누가 할지 물어보세요.'),'둘이 합의할 일이 있어예. 평일에 누가 할지 물어보시지예.');
  const standard=personas.spokenProse('sihyeon');
  assert.equal(standard('업무 범위를 확인하십시오. 결정권을 맡습니까? 선택지가 좁혀집니다.'),'업무 범위를 확인하세요. 결정권을 맡나요? 선택지가 좁혀지지요.');
});

test('Yeonseo softens recommendations without changing the quoted conversation',()=>{
  const yeonseo=personas.spokenProse('yeonseo');
  const text='맡을 일을 하나만 정해 보이소. 같은 말로 다른 걸 생각할 수 있지예. “나는 이 부분이 먼저 정해졌으면 좋겠어.”라고 전해 보세요.';
  assert.equal(yeonseo(text),'맡을 일을 하나만 정해 보시지예. 같은 말로 다른 걸 생각할 수 있지예. “나는 이 부분이 먼저 정해졌으면 좋겠어.”라고 전해 보시지예.');
});
