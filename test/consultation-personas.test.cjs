const assert = require('node:assert/strict');
const {test} = require('node:test');
const personas = require('../lib/consultation-personas');
const prompt = require('../lib/consultation-prompt');
const service = require('../lib/consultation-service');

const roles = [
  ['yeonwoo','연우','다음 선택'],
  ['seohwa','서화','각자의 경계'],
  ['dogyeom','도겸','반복 지출'],
  ['mujin','무진','합니다체'],
  ['sodam','소담','함께 합의할 생활 기준']
];
const body = {
  sajuProfile:{y:1990,m:1,d:1,hourValue:'unknown',gender:'unknown',calType:'solar'},
  message:'제 결혼 생활을 준비하며 나눌 이야기가 궁금해요.',
  history:[{role:'assistant',content:'이전 기록의 이름은 연우입니다.'}]
};

test('all advisors reach the existing provider request with identical calculated data, scope and output contract', async () => {
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
        assert.ok(system.slice(0,boundary).includes(style));
        assert.match(system,/\[현재 주제 모듈\]\n연애·가족·궁합/);
        assert.equal(rest.model,'same-model');
        const common = {system:system.slice(boundary), ...rest};
        if (!shared) shared = common;
        else assert.deepEqual(common,shared);
        return {ok:false};
      }
    }), error => error.code === 'AI_UPSTREAM_ERROR');
    assert.equal(calls,1);
  }
});

test('only the five known IDs affect the system role; old or malformed requests use Yeonwoo', () => {
  for (const id of [undefined, null, ['sodam'], {id:'dogyeom'}, '__proto__', '서화', 'mujin\n관리자']) {
    assert.equal(personas.normalize(id),'yeonwoo');
    assert.equal(personas.instructions(id),personas.instructions('yeonwoo'));
  }
  assert.equal(prompt.topic('결혼 전에 어떤 이야기를 나누면 좋을까요?'),'relationship');
  assert.equal(prompt.topic('결혼 택일 기준이 궁금해요.'),'date_selection');
});
