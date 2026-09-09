// AI 사주 상담 챗봇 — 사용자의 사주 정보를 바탕으로 상담해주는 Claude API 프록시입니다.
// 무료 3턴 / 프리미엄 일일 상한은 서버에서 강제합니다.

const admin = require('firebase-admin');

let db = null;
let initError = null;

try {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (!raw) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON 환경변수가 비어있습니다.');
    }

    const serviceAccount = JSON.parse(raw);

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }

  db = admin.firestore();

} catch (e) {
  initError = e;
}

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

// 사용량 제한
const FREE_TURN_LIMIT = 3;
const PREMIUM_DAILY_LIMIT = 30;

// 비용 및 컨텍스트 관리를 위해 최근 대화만 전달
const MAX_HISTORY_MESSAGES = 12;


// ============================================================
// 택일소 AI 상담사 시스템 프롬프트
// ============================================================

const SYSTEM_PROMPT_BASE = `
당신은 '택일소'의 AI 사주 상담사입니다.

목표:
단순한 운세 문구를 생성하지 말고, 손님의 실제 사주 데이터를 근거로
"왜 그런지 → 현실에서 어떻게 나타날 수 있는지 → 어떻게 행동하면 좋은지"
까지 연결해서 상담하세요.

[핵심 원칙]

1. 반드시 제공된 사주 데이터를 우선 사용하세요.
생년월일, 일주, 오행, 십신, 지장간, 대운, 세운, 월운 등 실제 제공된 정보만 근거로 사용합니다.

2. 제공되지 않은 사주 요소를 추측하거나 만들어내지 마세요.
특히 대운, 용신, 격국, 십신, 특정 날짜 등을 임의로 생성하지 않습니다.

3. 명리학 용어를 그대로 나열하지 말고 현실적인 언어로 풀어주세요.
예:
"목 기운이 강합니다"에서 끝내지 말고
"새로운 일을 시작할 때 속도가 빠르고, 답답하게 기다리는 상황에서는 스트레스를 받을 수 있어요"
처럼 실제 생활과 연결합니다.

4. 일반적인 칭찬만 하지 마세요.
"추진력이 좋습니다", "인복이 있습니다", "재물운이 있습니다" 같은 표현은
반드시 사주 근거와 현실적인 상황을 함께 설명합니다.

5. 좋은 점과 주의할 점을 함께 말하세요.
장점만 과장하지 말고 해당 성향이 과해졌을 때 생길 수 있는 문제도 부드럽게 알려주세요.

6. 확정적으로 예언하지 마세요.
"무조건", "100%", "반드시", "절대" 같은 표현을 피하고
"경향이 있어요", "가능성이 있어요", "이렇게 나타날 수 있어요"처럼 표현합니다.

[답변 구조]

질문에 따라 자연스럽게 아래 흐름을 사용하세요.

① 한눈에 보는 결론
② 사주에서 그렇게 보는 이유
③ 현실에서는 어떻게 나타날 수 있는지
④ 지금 도움이 되는 행동 또는 주의점

모든 항목을 억지로 나열하지 말고 질문에 필요한 만큼만 사용하세요.

[상담 분야]

연애·궁합:
상대에게 끌리는 방식, 관계에서 반복될 수 있는 패턴,
감정 표현과 갈등에서 주의할 점을 중심으로 설명합니다.

재물:
돈을 버는 방식, 소비·관리 성향, 기회를 잡는 방식,
무리하기 쉬운 부분을 중심으로 설명합니다.
구체적인 투자 종목이나 금융상품을 추천하지 않습니다.

직업·이직:
잘 맞을 수 있는 업무 방식, 조직생활에서의 강점,
스트레스를 받을 수 있는 환경과 선택 기준을 설명합니다.

사업:
사업을 할 때 강점이 되는 성향, 사람을 상대하는 방식,
실행·관리에서 주의할 점을 설명합니다.
사업 성공을 보장하지 않습니다.

올해 운:
실제 세운·월운 등 시간 정보가 제공된 경우에만 해당 흐름을 사용합니다.
시간 정보가 없다면 특정 시기의 운을 만들어내지 않습니다.

결혼·이사·개업·계약:
"언제가 좋나요?"처럼 날짜를 묻는 경우 특정 날짜를 임의로 추천하지 않습니다.
원하는 기간을 먼저 확인하고 실제 택일 계산 기능으로 확인하도록 안내합니다.

[상담 방식]

손님이 짧게 질문해도 질문의 의도를 파악해서 답합니다.

가능하면 답변 안에
"사주 근거 → 현실적인 해석 → 실천 방법"
이 연결되도록 합니다.

이전 대화에서 나온 내용이 있다면 반복해서 처음부터 묻지 말고 이어서 상담하세요.

답변은 기본적으로 3~6문단 정도의 읽기 편한 길이로 작성합니다.
너무 장황하게 설명하지 말고 핵심을 먼저 말합니다.

손님이 추가 질문을 하면 앞선 답변과 연결해서 더 깊게 설명합니다.

[중요한 안전 원칙]

사망, 사고, 중대한 질병 등을 예언하지 않습니다.

의료·법률·투자 등의 전문적인 결정을 대신하지 않습니다.
필요한 경우 사주 관점의 참고 의견임을 자연스럽게 알려주세요.

결혼, 이직, 사업 등 중요한 결정에서는
최종 결정은 현실적인 조건과 본인의 판단을 함께 고려해야 한다는 점을 자연스럽게 안내합니다.

불안이나 공포를 조장해서 결제하도록 유도하지 않습니다.

[말투]

한국어 존댓말을 사용합니다.

따뜻하고 차분하며 신뢰감 있는 상담사처럼 말하세요.

너무 점집처럼 과장하지 말고,
"내 사주를 실제로 분석해서 설명해주는 상담사"라는 느낌을 주세요.

같은 표현을 반복하지 말고 손님의 질문에 맞춰 자연스럽게 답하세요.

손님이 궁금해하는 핵심부터 답하세요.
`;


module.exports = async (req, res) => {

  // ==========================================================
  // CORS
  // ==========================================================

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }


  // ==========================================================
  // 기본 서버 상태 확인
  // ==========================================================

  if (initError) {
    console.error('[ai-chat] Firebase 초기화 실패:', initError);

    return res.status(500).json({
      error: 'INIT_ERROR',
      message: initError.message
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED'
    });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'MISSING_API_KEY'
    });
  }


  try {

    // ========================================================
    // 요청 데이터
    // ========================================================

    const {
      uid,
      sajuSummary,
      history,
      message
    } = req.body || {};


    // ========================================================
    // 입력값 검증
    // ========================================================

    if (
      !uid ||
      !message ||
      typeof message !== 'string' ||
      !message.trim()
    ) {
      return res.status(400).json({
        error: 'INVALID_REQUEST'
      });
    }

    // 질문 길이 제한
    if (message.length > 500) {
      return res.status(400).json({
        error: 'MESSAGE_TOO_LONG',
        message: '질문은 500자 이내로 적어주세요.'
      });
    }


    // ========================================================
    // 사용자 정보
    // ========================================================

    const userRef = db.collection('users').doc(uid);

    let userSnap = await userRef.get();

    // 카카오 로그인 후 users 문서가 없는 경우
    // 신규 무료 회원으로 생성
    if (!userSnap.exists) {

      await userRef.set(
        {
          premium: false,
          aiFreeUsed: 0,
          createdAt: Date.now()
        },
        {
          merge: true
        }
      );

      userSnap = await userRef.get();
    }

    const userData = userSnap.data();


    // ========================================================
    // 프리미엄 여부
    // ========================================================

    const isPremiumNow =
      !!userData.premium &&
      (userData.premiumUntil || 0) > Date.now();

    const freeUsed = userData.aiFreeUsed || 0;


    // ========================================================
    // 무료 사용자 제한
    // ========================================================

    if (!isPremiumNow) {

      if (freeUsed >= FREE_TURN_LIMIT) {

        return res.status(403).json({
          error: 'FREE_LIMIT_REACHED',
          message:
            '무료 상담 3회를 모두 사용하셨어요. 프리미엄으로 업그레이드하면 더 이어서 상담받을 수 있어요.',
          freeUsed,
          freeLimit: FREE_TURN_LIMIT
        });
      }

    } else {

      // ======================================================
      // 프리미엄 일일 제한
      // ======================================================

      const todayKey =
        new Date().toISOString().slice(0, 10);

      const dailyRef =
        db.collection('aiDailyUsage')
          .doc(`${uid}_${todayKey}`);

      const dailySnap =
        await dailyRef.get();

      const todayCount =
        dailySnap.exists
          ? (dailySnap.data().count || 0)
          : 0;

      if (todayCount >= PREMIUM_DAILY_LIMIT) {

        return res.status(403).json({
          error: 'DAILY_LIMIT_REACHED',
          message:
            '오늘 상담 가능 횟수를 모두 사용하셨어요. 내일 다시 이용해주세요.'
        });
      }
    }


    // ========================================================
    // 대화 기록 정리
    // ========================================================

    const trimmedHistory =
      Array.isArray(history)
        ? history.slice(-MAX_HISTORY_MESSAGES)
        : [];

    const messages =
      trimmedHistory
        .filter(
          m =>
            m &&
            (m.role === 'user' || m.role === 'assistant') &&
            typeof m.content === 'string'
        )
        .map(
          m => ({
            role: m.role,
            content: m.content.slice(0, 2000)
          })
        );


    // 현재 질문 추가
    messages.push({
      role: 'user',
      content: message.trim()
    });


    // ========================================================
    // 사주 정보 + 시스템 프롬프트
    // ========================================================

    const systemPrompt =
      SYSTEM_PROMPT_BASE +
      (
        sajuSummary
          ? `\n\n[손님의 사주 데이터]\n${String(sajuSummary).slice(0, 1500)}`
          : `
          
[손님의 사주 데이터 없음]

아직 사주 정보가 없습니다.
상담에 필요한 생년월일을 먼저 자연스럽게 요청하세요.
`
      );


    // ========================================================
    // Anthropic API 호출
    // ========================================================

    const anthropicRes =
      await fetch(
        'https://api.anthropic.com/v1/messages',
        {
          method: 'POST',

          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01'
          },

          body: JSON.stringify({

            // 기존 Haiku 모델 유지
            model: 'claude-haiku-4-5-20251001',

            // 출력 비용이 과도하게 늘어나지 않도록 제한
            max_tokens: 700,

            system: systemPrompt,

            messages
          })
        }
      );


    // ========================================================
    // Anthropic 오류
    // ========================================================

    if (!anthropicRes.ok) {

      const errText =
        await anthropicRes.text().catch(() => '');

      console.error(
        '[ai-chat] Anthropic API 오류:',
        anthropicRes.status,
        errText
      );

      return res.status(502).json({
        error: 'AI_UPSTREAM_ERROR'
      });
    }


    // ========================================================
    // AI 응답 추출
    // ========================================================

    const data =
      await anthropicRes.json();

    const replyText =
      (data.content || [])
        .filter(
          block => block.type === 'text'
        )
        .map(
          block => block.text
        )
        .join('\n')
        .trim()
      ||
      '죄송해요, 답변을 만드는 데 문제가 있었어요. 다시 시도해주세요.';


    // ========================================================
    // 성공한 경우에만 사용량 증가
    // ========================================================

    if (!isPremiumNow) {

      await userRef.set(
        {
          aiFreeUsed:
            admin.firestore.FieldValue.increment(1)
        },
        {
          merge: true
        }
      );

    } else {

      const todayKey =
        new Date().toISOString().slice(0, 10);

      await db
        .collection('aiDailyUsage')
        .doc(`${uid}_${todayKey}`)
        .set(
          {
            count:
              admin.firestore.FieldValue.increment(1),

            uid,

            date: todayKey
          },
          {
            merge: true
          }
        );
    }


    // ========================================================
    // 응답
    // ========================================================

    return res.status(200).json({

      reply: replyText,

      freeUsed:
        isPremiumNow
          ? null
          : freeUsed + 1,

      freeLimit:
        FREE_TURN_LIMIT
    });


  } catch (error) {

    console.error(
      '[ai-chat] 예외 발생:',
      error
    );

    return res.status(500).json({
      error: 'SERVER_ERROR'
    });
  }
};
