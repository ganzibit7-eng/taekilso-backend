// 카카오 로그인을 실제 Firebase 로그인 세션으로 이어주는 함수입니다.
// 클라이언트가 보낸 카카오 access_token이 진짜인지 카카오 서버에 직접 확인한 뒤,
// Firebase 전용 임시 출입증(커스텀 토큰)을 만들어 돌려줍니다.
 
const admin = require('firebase-admin');
 
let initError = null;
try {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON 환경변수가 비어있습니다.');
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
} catch (e) {
  initError = e;
}
 
module.exports = async (req, res) => {
  if (initError) {
    console.error('[kakao-custom-token] Firebase 초기화 실패:', initError);
    return res.status(500).json({ error: 'INIT_ERROR', message: initError.message });
  }
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();
 
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
 
    const accessToken = (req.body && req.body.accessToken) || '';
    if (!accessToken) return res.status(400).json({ error: 'MISSING_TOKEN' });
 
    const meRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: 'Bearer ' + accessToken }
    });
    const me = await meRes.json();
    if (!me || !me.id) return res.status(401).json({ error: 'INVALID_KAKAO_TOKEN' });
 
    const uid = 'kakao_' + me.id;
    const account = me.kakao_account || {};
    const customToken = await admin.auth().createCustomToken(uid, { provider: 'kakao' });
 
    return res.status(200).json({
      customToken,
      profile: {
        id: me.id,
        nickname: (account.profile && account.profile.nickname) || '카카오 사용자',
        email: account.email || null
      }
    });
  } catch (error) {
    console.error('kakaoCustomToken error:', error);
    return res.status(500).json({ error: 'SERVER_ERROR' });
  }
};
