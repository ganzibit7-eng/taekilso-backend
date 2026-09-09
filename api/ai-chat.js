// AI 사주 상담 챗봇 — 사용자의 사주 정보를 바탕으로 상담해주는 Claude API 프록시입니다.
// 이 함수를 거쳐야만 실제 AI 호출이 일어나므로, 사용량 제한(무료 3턴 / 프리미엄 일일 상한)을
// 여기 서버에서 확실히 강제합니다. 클라이언트 코드만으로는 사용량을 믿을 수 없기 때문입니다.
 
const admin = require('firebase-admin');
 
let db = null;
let initError = null;
try {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON 환경변수가 비어있습니다.');
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  db = admin.firestore();
} catch (e) {
  initError = e;
}
 
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const FREE_TURN_LIMIT = 3;           // 무료 회원 평생 무료 상담 횟수
const PREMIUM_DAILY_LIMIT = 30;      // 프리미엄 회원이라도 남용 방지를 위한 하루 상한
const MAX_HISTORY_MESSAGES = 12;     // 비용 관리를 위해 최근 대화만 모델에 전달 (턴당 6개 메시지 = 최근 6턴)
 
const SYSTEM_PROMPT_BASE = `당신은 '택일소'라는 사주 서비스에 붙어 있는 AI 사주 상담사입니다.
아래 손님의 사주 정보를 바탕으로, 따뜻하고 담백한 말투로 상담해주세요.
 
규칙:
- 손님의 사주(생년월일, 오행, 일주 등)를 참고해서 구체적으로 답하세요. 일반론만 말하지 마세요.
- 확정적으로 단정짓지 말고 "~한 경향이 있어요", "~일 수 있어요" 같은 어투를 쓰세요.
- 답변은 2~4문단 이내로, 너무 길지 않게 핵심만 말하세요.
- 결혼/이직/사업/투자처럼 중요한 결정에 대해서는, 참고용 정보이며 최종 결정은 본인 몫이라는 점을 자연스럽게 한 줄 정도 녹여서 말하세요. 매번 기계적으로 반복하지 말고 자연스럽게요.
- 재물·연애·사업운처럼 깊이 들어갈 수 있는 주제는, 핵심적인 흐름 한두 가지는 구체적으로 답하되 모든 걸 다 풀어주지는 마세요. 답변 끝에서 "더 자세한 흐름은 정밀 분석에서 볼 수 있다" 정도로만 자연스럽게 살짝 언급하세요(강요하듯 반복하지 마세요).
- 결혼식·이사·개업·계약처럼 "언제가 좋을지" 날짜를 묻는 질문에는, 임의로 특정 날짜를 만들어 답하지 마세요. 대신 원하는 기간(예: "10월 중")을 되물어서, 실제 사주 계산 엔진으로 후보를 비교해볼 수 있도록 안내하세요.
- 의료, 법률, 재정 관련 전문적 조언(구체적 투자 종목, 진단 등)은 하지 마세요. 사주 관점의 경향만 말하세요.
- 반말 쓰지 말고 존댓말을 쓰세요.`;
 
module.exports = async (req, res) => {
  // 브라우저에서 직접(GitHub Pages 사이트 → Vercel 함수) 호출하는 요청이라 CORS 헤더가
  // 꼭 필요합니다. 이게 없으면 브라우저가 응답을 그냥 막아버려서, 실제로는 서버가 정상
  // 응답했는데도 화면에는 "연결에 문제가 있었어요"처럼 뜰 수 있습니다.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
 
  if (initError) {
    console.error('[ai-chat] Firebase 초기화 실패:', initError);
    return res.status(500).json({ error: 'INIT_ERROR', message: initError.message });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  if (!ANTHROPIC_API_KEY) return res.status(500).json({ error: 'MISSING_API_KEY' });
 
  try {
    const { uid, sajuSummary, history, message } = req.body || {};
    if (!uid || !message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'INVALID_REQUEST' });
    }
    if (message.length > 500) {
      return res.status(400).json({ error: 'MESSAGE_TOO_LONG', message: '질문은 500자 이내로 적어주세요.' });
    }
 
    const userRef = db.collection('users').doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: 'USER_NOT_FOUND' });
    const userData = userSnap.data();
 
    const isPremiumNow = !!userData.premium && (userData.premiumUntil || 0) > Date.now();
    const freeUsed = userData.aiFreeUsed || 0;
 
    if (!isPremiumNow) {
      if (freeUsed >= FREE_TURN_LIMIT) {
        return res.status(403).json({
          error: 'FREE_LIMIT_REACHED',
          message: '무료 상담 3회를 모두 사용하셨어요. 프리미엄으로 업그레이드하면 더 이어서 상담받을 수 있어요.',
          freeUsed, freeLimit: FREE_TURN_LIMIT
        });
      }
    } else {
      // 프리미엄 회원도 하루 상한을 둬서, 특정 계정이 비정상적으로 많이 호출하는 걸 막습니다.
      const todayKey = new Date().toISOString().slice(0, 10);
      const dailyRef = db.collection('aiDailyUsage').doc(`${uid}_${todayKey}`);
      const dailySnap = await dailyRef.get();
      const todayCount = dailySnap.exists ? (dailySnap.data().count || 0) : 0;
      if (todayCount >= PREMIUM_DAILY_LIMIT) {
        return res.status(403).json({
          error: 'DAILY_LIMIT_REACHED',
          message: '오늘 상담 가능 횟수를 모두 사용하셨어요. 내일 다시 이용해주세요.',
        });
      }
    }
 
    // 대화 기록은 최근 것만 잘라서 보냅니다 (비용 관리 + 컨텍스트 과다 방지).
    const trimmedHistory = Array.isArray(history) ? history.slice(-MAX_HISTORY_MESSAGES) : [];
    const messages = trimmedHistory
      .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map(m => ({ role: m.role, content: m.content.slice(0, 2000) }));
    messages.push({ role: 'user', content: message.trim() });
 
    const systemPrompt = SYSTEM_PROMPT_BASE + (sajuSummary ? `\n\n손님의 사주 정보:\n${String(sajuSummary).slice(0, 1500)}` : '\n\n(손님이 아직 사주 정보를 입력하지 않았습니다. 먼저 생년월일을 알려달라고 요청하세요.)');
 
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        system: systemPrompt,
        messages
      })
    });
 
    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text().catch(() => '');
      console.error('[ai-chat] Anthropic API 오류:', anthropicRes.status, errText);
      return res.status(502).json({ error: 'AI_UPSTREAM_ERROR' });
    }
 
    const data = await anthropicRes.json();
    const replyText = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim() || '죄송해요, 답변을 만드는 데 문제가 있었어요. 다시 시도해주세요.';
 
    // 성공적으로 답변을 받은 뒤에만 사용량을 늘립니다 (실패한 호출은 카운트하지 않음).
    if (!isPremiumNow) {
      await userRef.set({ aiFreeUsed: admin.firestore.FieldValue.increment(1) }, { merge: true });
    } else {
      const todayKey = new Date().toISOString().slice(0, 10);
      await db.collection('aiDailyUsage').doc(`${uid}_${todayKey}`).set(
        { count: admin.firestore.FieldValue.increment(1), uid, date: todayKey },
        { merge: true }
      );
    }
 
    return res.status(200).json({ reply: replyText, freeUsed: isPremiumNow ? null : freeUsed + 1, freeLimit: FREE_TURN_LIMIT });
  } catch (error) {
    console.error('[ai-chat] 예외 발생:', error);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
};
