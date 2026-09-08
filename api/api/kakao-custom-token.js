@'
// 카카오 로그인을 실제 Firebase 로그인 세션으로 이어주는 함수입니다.
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n')
    })
  });
}

module.exports = async (req, res) => {
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
'@ | Out-File -Encoding utf8 api\kakao-custom-token.js
