# 택일소 OpenAI 전환 — 배포 전 검토

기준 커밋: 4034f896f8f757b0b0539a917b855bbefee0442c. 현재 변경은 로컬에만 존재한다. 업로드, 실제 API 호출, 운영 배포는 수행하지 않았다.

## 적용 범위

- 일반 사주 상담은 서버 설정으로 GPT-6.2 Sol을 기본으로 선택한다. 연결 오류, 시간 초과, 제공사 429에 한해 기존 Claude Haiku 4.5로 한 번 전환한다.
- 기존 계산·프롬프트·근거 검증·출력 렌더링·고객 이용권 차감 및 실패 복원 절차를 재사용한다.
- 무료 기본 리포트, 결제 코드, 프런트엔드, 별도 신년 리포트 생성은 변경하지 않는다. 신년 생성은 기존 Claude 경로다. 신년 전체를 GPT로 전환한 상태가 아니다.
- 검증 실패·거절·전체 비용 한도 소진은 Claude 재호출로 우회하지 않는다.
- 기본 설정 및 롤백은 기존 Claude다. 요청 본문으로 모델을 바꿀 수 없다.

## 설정 — 아직 적용하지 않음

OpenAI 키는 승인된 보안 설정 흐름으로 발급·저장하고, 배포 시 서버 Secret으로 전달한다. 브라우저 코드·로그·소스에 넣지 않는다. 사용자 계정의 API 조직과 실제 키 발급 조직 일치를 다시 확인한다.

일반 상담 전환 시 명시적으로 설정할 항목:

- AI_PRIMARY_PROVIDER=openai (anthropic 또는 미설정이면 기존 경로로 복귀)
- OPENAI_MODEL=gpt-6.2-sol
- OPENAI_API_KEY: 서버 Secret
- 기존 ANTHROPIC_API_KEY 보존
- AI_PROVIDER_DAILY_USD, AI_PROVIDER_MONTHLY_USD, AI_PROVIDER_TOTAL_USD: 승인된 양수 USD. 코드 상한은 일 5, 월/누적 20이다. 누적 한도는 달이 바뀌어도 복원되지 않는다.
- AI_PROVIDER_APPROVED_UNTIL: 승인 만료 UTC 시각. 크레딧 만료 전으로 설정한다. 이는 실제 계정 잔액 조회가 아니다.

관리자 비교는 AI_COMPARE_ENABLED=true, OPENAI_COMPARE_MODEL=gpt-6.2-sol 및 AI_COMPARE_DAILY_USD / MONTHLY_USD / TOTAL_USD / APPROVED_UNTIL을 별도로 승인·설정해야 한다. 설정이 없으면 비활성화된다.

공유 비용 한도는 Firestore 트랜잭션으로 호출 전에 보수적 비용을 예약한다. 입력 바이트와 최대 출력으로 넉넉하게 예약하며 실패·시간 초과·기록 실패 후에도 예약을 되돌리지 않는다. 실제 청구액보다 일찍 차단할 수 있다. 입력 본문 60KB, 출력 2400토큰, 제공사당 최대 2회이며 각 호출은 기존 25초 제한을 재사용한다. GPT reasoning 토큰도 출력 한도에 포함된다.

AI 호출 메타데이터에는 모델, 시간, 토큰, 비용 추정, 입력 해시만 남긴다. 키·생년월일·질문·답변은 새 비용 원장에 저장하지 않는다. 예약 한도는 이 코드 경로에만 적용되고 다른 앱·프로젝트의 사용을 막지 않는다. 활성화 전 운영 Firestore 규칙이 aiProviderBudgets/Calls 및 aiComparisonBudgets/Calls에 대한 클라이언트 쓰기를 거부하는지 확인한다. 로컬에 남은 이전 규칙은 기본 거부지만 현재 운영 규칙은 재확인이 필요하다.

## 비교

POST /api/ai-chat, Firebase의 취소 여부를 검사한 관리자 토큰 필요:

    {"action":"compare-providers","fixtureId":"career"}

허용 fixture: career, money, relationship, boundary, known_time. 모두 가상 입력이며 사용자 제공 실회원 데이터는 받지 않는다. 일반 이용권은 차감하지 않는다. 두 제공사에 동일한 기준 시각·원국·프롬프트·스키마를 적용하고 initial_input_identical 해시로 검증한다. OpenAI는 low reasoning, Claude는 기존 temperature .45를 사용하므로 생성 알고리즘까지 같다는 의미는 아니다. 오류·토큰·지연·추정 비용·검증 재시도를 제공사별로 반환한다. 자동으로 승자를 정하지 않는다.

블라인드 평가 시 응답의 제공사 표기를 가리고 A/B 순서를 무작위로 배정한다. 계산 규칙 30, 일관성 20, 개별 구체성 20, 실용성 15, 전달력 10, 근거 없는 단정 억제 5점으로 평가한다. 전문가가 검토한 원국을 정답 기준으로 하고 미래 예측의 적중률로 해석하지 않는다. 최초에는 한 사례를 실행해 정상 형식과 비용을 확인하고, 승인된 예산 안에서 나머지 사례와 반복 비교를 진행한다.

## 현재 확인 / 미확인

- Node 24.20.0에서 기존 검사 포함 156개 통과. 배포 대상 Node 26에서 CI 재검사가 필요하다.
- mock 검사: 입력 동일성, 관리자·이메일 인증, 비용 동시 예약, 실패 예약 유지, 승인 만료, 월 변경 시 누적 한도 유지, OpenAI 거절·불완전 응답, 보정 시 reasoning 이력 재전달, GPT 기본과 Claude 복구, 비활성화·롤백.
- 실제 GPT 사주 응답 품질·비용·속도는 미검증이다.
- Vercel 팀 접근 승인을 완료했고 기존 연결로 두 프로젝트 조회가 성공했다. 실제 서비스 도메인은 taekilso-backend-lemon.vercel.app이며 해당 프로젝트에는 기존 Claude/Firebase/결제 Secret이 존재하고 OpenAI Secret은 아직 없다. 보조 프로젝트 taekilso-backend-wqxi에는 환경변수가 조회되지 않아 시험 대상으로 임의 선택하지 않는다. API 키 값은 조회·복호화하지 않았다.
- 프로젝트 설정의 Node 버전은 24.x이고 저장소 engines는 26.x다. 로컬 24.20.0 검사만 통과했으며 실제 시험 배포에서 적용 런타임과 동작을 확인해야 한다. 다른 브랜치 codex/cloudrun-preparation의 시험 배포가 있어 변경하지 않았다. 원격 main 기준 커밋은 여전히 4034f896f8f757b0b0539a917b855bbefee0442c다.
- 첫 '택일소' 키는 Personal / Default project로 발급됐지만 임시 저장 상태를 찾지 못해 복호화·로컬 저장에 실패했다. 사용자는 기존 키 폐기를 완료했다고 확인했다. 같은 조직/프로젝트에 21일 유효 키를 재발급하고 승인된 .env.local에 안전하게 저장했다. 비밀값은 출력하지 않았다. 보안 helper 상태는 작업 공간의 Git 제외 폴더를 사용했다. API 호출과 운영 Secret 등록은 아직 수행하지 않았다.

## 승인 후 순서

1. 키 재발급·로컬 저장 완료. 프로젝트는 사용자 선택의 Default project이며 택일소 전용으로 별도 생성한 프로젝트는 아니다.
2. Vercel taekilso 팀 권한 확인 완료. OpenAI Secret의 안전한 서버 등록은 아직 남아 있다. 로컬 Vercel CLI는 로그인되지 않은 상태이며 키 값을 대화나 명령행 인수로 옮기지 않는다.
3. 운영 규칙·Node 26 검사. 비밀값과 배포 파일 분리 검사.
4. 비교 예산·실행 및 시험 배포에 대한 사용자 승인 후 한 사례부터 검증.
5. 비교 결과를 검토하고 일반 상담의 GPT 기본 전환·운영 예산·운영 배포를 최종 승인받아 적용.
6. 비회원 차단, 일반/관리자 상담, GPT 장애 복구, 비용 차단, 무료 리포트·결제 코드 동일성 확인. 실제 결제를 새로 만들지 않는다.

참고: https://developers.openai.com/api/docs/models/gpt-6.2-sol.md , https://developers.openai.com/api/docs/guides/function-calling.md , https://developers.openai.com/api/docs/guides/chatgpt-api-credits
