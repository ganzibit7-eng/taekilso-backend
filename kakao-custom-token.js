// 카카오 access_token을 Firebase Custom Token으로 교환합니다.
// 카카오 서버가 확인한 실제 사용자 ID만 Firebase UID로 사용합니다.

const admin = require('firebase-admin');

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
} catch (err) {
  initError = err;
}

const KAKAO_ME_URL = 'https://kapi.kakao.com/v2/user/me';
const KAKAO_TIMEOUT_MS = 10000;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (initError) {
    console.error('[kakao-custom-token] Firebase 초기화 실패:', initError);
    return res.status(500).json({
      error: 'INIT_ERROR'
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED'
    });
  }

  const accessToken =
    typeof req.body?.accessToken === 'string'
      ? req.body.accessToken.trim()
      : '';

  if (!accessToken) {
    return res.status(400).json({
      error: 'MISSING_TOKEN'
    });
  }

  // 비정상적으로 큰 입력을 외부 API Authorization 헤더로 전달하지 않습니다.
  if (accessToken.length > 4096) {
    return res.status(400).json({
      error: 'INVALID_TOKEN_FORMAT'
    });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    KAKAO_TIMEOUT_MS
  );

  try {
    const meRes = await fetch(KAKAO_ME_URL, {
      method: 'GET',
      headers: {
        Authorization: 'Bearer ' + accessToken
      },
      signal: controller.signal
    });

    let me = null;

    try {
      me = await meRes.json();
    } catch (_) {
      me = null;
    }

    if (!meRes.ok || !me || !me.id) {
      console.warn(
        '[kakao-custom-token] Kakao token verification failed:',
        meRes.status
      );

      return res.status(401).json({
        error: 'INVALID_KAKAO_TOKEN'
      });
    }

    const kakaoId = String(me.id);

    // Firebase UID 제한에 맞는 짧고 안정적인 UID.
    const uid = 'kakao_' + kakaoId;

    const account = me.kakao_account || {};
    const profileData = account.profile || {};

    const customToken = await admin.auth().createCustomToken(uid, {
      loginProvider: 'kakao'
    });

    return res.status(200).json({
      customToken,
      profile: {
        id: kakaoId,
        nickname:
          typeof profileData.nickname === 'string' && profileData.nickname.trim()
            ? profileData.nickname.trim().slice(0, 100)
            : '카카오 사용자',
        email:
          typeof account.email === 'string' && account.email.trim()
            ? account.email.trim().slice(0, 320)
            : null
      }
    });

  } catch (err) {
    if (err && err.name === 'AbortError') {
      console.error('[kakao-custom-token] Kakao API timeout');

      return res.status(504).json({
        error: 'KAKAO_TIMEOUT'
      });
    }

    console.error('[kakao-custom-token] error:', err);

    return res.status(500).json({
      error: 'SERVER_ERROR'
    });

  } finally {
    clearTimeout(timeoutId);
  }
};
