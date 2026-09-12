const admin = require('firebase-admin');

let db = null;
let initError = null;

const API_VERSION = '2026-09-credit-revoke-v2';

const ADMIN_EMAILS = new Set([
  'green092432@gmail.com'
]);

try {
  if (!admin.apps.length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

    if (!raw) {
      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON 환경변수가 비어있습니다.'
      );
    }

    admin.initializeApp({
      credential: admin.credential.cert(
        JSON.parse(raw)
      )
    });
  }

  db = admin.firestore();
} catch (err) {
  initError = err;
}


/* =========================
   관리자 인증
========================= */

async function verifyAdmin(req) {
  const authHeader = String(
    (req.headers && req.headers.authorization) || ''
  ).trim();

  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('UNAUTHORIZED');
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    throw new Error('UNAUTHORIZED');
  }

  const decoded =
    await admin.auth().verifyIdToken(token);

  const email = String(
    decoded.email || ''
  )
    .trim()
    .toLowerCase();

  if (!ADMIN_EMAILS.has(email)) {
    throw new Error('FORBIDDEN');
  }

  return {
    uid: decoded.uid,
    email
  };
}


/* =========================
   관리자 작업 로그
========================= */

async function writeAudit(
  actor,
  action,
  targetUid,
  extra = {}
) {
  try {
    await db
      .collection('adminActionLogs')
      .add({
        actorUid: actor.uid,
        actorEmail: actor.email,

        action,
        targetUid,

        ...extra,

        createdAt:
          admin.firestore
            .FieldValue
            .serverTimestamp()
      });
  } catch (err) {
    // 로그 저장 실패 때문에 실제 관리자 작업까지
    // 실패시키지는 않습니다.
    console.error(
      '[admin-user-action] audit log error',
      err
    );
  }
}


/* =========================
   하위 컬렉션 삭제
========================= */

async function deleteCollection(
  collectionRef,
  batchSize = 100
) {
  while (true) {
    const snap = await collectionRef
      .limit(batchSize)
      .get();

    if (snap.empty) {
      break;
    }

    const batch = db.batch();

    snap.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    await batch.commit();

    if (snap.size < batchSize) {
      break;
    }
  }
}


/* =========================
   API
========================= */

module.exports = async (req, res) => {

  res.setHeader(
    'Access-Control-Allow-Origin',
    '*'
  );

  res.setHeader(
    'Access-Control-Allow-Methods',
    'POST, OPTIONS'
  );

  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization'
  );

  res.setHeader(
    'Cache-Control',
    'no-store'
  );


  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }


  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'METHOD_NOT_ALLOWED'
    });
  }


  if (initError || !db) {
    console.error(
      '[admin-user-action] Firebase init error',
      initError
    );

    return res.status(500).json({
      error: 'INIT_ERROR',
      message:
        'Firebase Admin 초기화에 실패했습니다.'
    });
  }


  try {

    /* -------------------------
       관리자 인증
    ------------------------- */

    const actor =
      await verifyAdmin(req);


    const body =
      req.body || {};


    const action =
      String(body.action || '').trim();


    const uid =
      String(body.uid || '').trim();


    if (!action) {
      return res.status(400).json({
        error: 'ACTION_REQUIRED',
        message:
          '관리자 작업 종류가 없습니다.'
      });
    }


    if (!uid) {
      return res.status(400).json({
        error: 'UID_REQUIRED',
        message:
          '회원 UID가 없습니다.'
      });
    }



    /* =========================
       프리미엄 30일 지급
    ========================= */

    if (action === 'grant_premium') {

      const userRef =
        db.collection('users').doc(uid);


      const snap =
        await userRef.get();


      const data =
        snap.exists
          ? (snap.data() || {})
          : {};


      let currentUntil = 0;


      if (
        data.premiumUntil &&
        typeof data.premiumUntil.toMillis ===
          'function'
      ) {
        currentUntil =
          data.premiumUntil.toMillis();
      } else {
        currentUntil =
          Number(data.premiumUntil || 0);
      }


      const now = Date.now();


      // 이미 프리미엄 기간이 남아 있다면
      // 현재 만료일 뒤에 30일 추가
      const base =
        currentUntil > now
          ? currentUntil
          : now;


      const until =
        base +
        30 * 24 * 60 * 60 * 1000;


      await userRef.set(
        {
          premium: true,

          premiumUntil: until,

          grantedByAdmin: true,

          lastVerificationMethod:
            'admin-grant',

          lastAdminPremiumGrantAt:
            admin.firestore
              .FieldValue
              .serverTimestamp()
        },
        {
          merge: true
        }
      );


      await writeAudit(
        actor,
        action,
        uid,
        {
          premiumUntil: until
        }
      );


      return res.status(200).json({
        ok: true,

        action,

        uid,

        premium: true,

        premiumUntil: until,

        apiVersion: API_VERSION
      });
    }



    /* =========================
       프리미엄 회수
    ========================= */

    if (action === 'revoke_premium') {

      const userRef =
        db.collection('users').doc(uid);


      await userRef.set(
        {
          premium: false,

          premiumUntil: 0,

          lastAdminPremiumRevokeAt:
            admin.firestore
              .FieldValue
              .serverTimestamp()
        },
        {
          merge: true
        }
      );


      await writeAudit(
        actor,
        action,
        uid
      );


      return res.status(200).json({
        ok: true,

        action,

        uid,

        premium: false,

        premiumUntil: 0,

        apiVersion: API_VERSION
      });
    }



    /* =========================
       질문권 지급
       1 / 5 / 10개
    ========================= */

    if (action === 'grant_credits') {

      const count =
        Number(body.count || 0);


      if (
        ![1, 5, 10].includes(count)
      ) {
        throw new Error(
          'INVALID_CREDIT_COUNT'
        );
      }


      const ref =
        db.collection('users').doc(uid);


      let before = 0;
      let after = 0;


      await db.runTransaction(
        async (tx) => {

          const snap =
            await tx.get(ref);


          if (!snap.exists) {
            throw new Error(
              'USER_NOT_FOUND'
            );
          }


          const data =
            snap.data() || {};


          before =
            Math.max(
              0,
              Number(
                data.aiQuestionCredits ||
                0
              )
            );


          after =
            before + count;


          tx.set(
            ref,
            {
              aiQuestionCredits:
                after,

              lastAdminCreditGrantAt:
                admin.firestore
                  .FieldValue
                  .serverTimestamp(),

              lastAdminCreditGrantCount:
                count
            },
            {
              merge: true
            }
          );
        }
      );


      await writeAudit(
        actor,
        action,
        uid,
        {
          before,

          granted: count,

          questionCredits:
            after
        }
      );


      return res.status(200).json({
        ok: true,

        action,

        uid,

        before,

        granted: count,

        questionCredits:
          after,

        apiVersion:
          API_VERSION
      });
    }



    /* =========================
       질문권 회수
       1 / 5 / 10 / 전부
    ========================= */

    if (action === 'revoke_credits') {

      const rawCount =
        body.count;


      const ref =
        db.collection('users').doc(uid);


      let before = 0;
      let after = 0;
      let revoked = 0;


      await db.runTransaction(
        async (tx) => {

          const snap =
            await tx.get(ref);


          if (!snap.exists) {
            throw new Error(
              'USER_NOT_FOUND'
            );
          }


          const data =
            snap.data() || {};


          before =
            Math.max(
              0,
              Number(
                data.aiQuestionCredits ||
                0
              )
            );


          // 전부 회수
          if (rawCount === 'all') {

            revoked =
              before;

            after =
              0;

          } else {

            const count =
              Number(
                rawCount || 0
              );


            if (
              ![1, 5, 10]
                .includes(count)
            ) {
              throw new Error(
                'INVALID_CREDIT_COUNT'
              );
            }


            revoked =
              Math.min(
                before,
                count
              );


            // 절대 마이너스가 되지 않음
            after =
              Math.max(
                0,
                before - count
              );
          }


          tx.set(
            ref,
            {
              aiQuestionCredits:
                after,

              lastAdminCreditRevokeAt:
                admin.firestore
                  .FieldValue
                  .serverTimestamp(),

              lastAdminCreditRevokeCount:
                revoked
            },
            {
              merge: true
            }
          );
        }
      );


      await writeAudit(
        actor,
        action,
        uid,
        {
          before,

          revoked,

          questionCredits:
            after
        }
      );


      return res.status(200).json({
        ok: true,

        action,

        uid,

        before,

        revoked,

        questionCredits:
          after,

        apiVersion:
          API_VERSION
      });
    }



    /* =========================
       회원 강제탈퇴
    ========================= */

    if (action === 'force_delete') {

      // 관리자 자기 자신 삭제 방지
      if (uid === actor.uid) {
        return res.status(400).json({
          error:
            'CANNOT_DELETE_SELF',

          message:
            '관리자 본인 계정은 강제탈퇴할 수 없습니다.'
        });
      }


      const userRef =
        db.collection('users').doc(uid);


      // 사주 보관함 삭제
      await deleteCollection(
        userRef.collection(
          'sajuProfiles'
        )
      );


      // AI 상담 기록 삭제
      await deleteCollection(
        userRef.collection(
          'aiConversations'
        )
      );


      // 회원 메인 문서 삭제
      await userRef.delete();


      // Firebase Authentication 삭제
      try {

        await admin
          .auth()
          .deleteUser(uid);

      } catch (err) {

        // Auth 계정이 이미 없어도
        // Firestore 탈퇴 처리는 완료
        if (
          !err ||
          err.code !==
            'auth/user-not-found'
        ) {
          throw err;
        }
      }


      await writeAudit(
        actor,
        action,
        uid
      );


      return res.status(200).json({
        ok: true,

        action,

        uid,

        deleted: true,

        apiVersion:
          API_VERSION
      });
    }



    /* =========================
       알 수 없는 작업
    ========================= */

    return res.status(400).json({
      error: 'UNKNOWN_ACTION',

      message:
        '지원하지 않는 관리자 작업입니다.',

      apiVersion:
        API_VERSION
    });


  } catch (err) {

    console.error(
      '[admin-user-action] error',
      err
    );


    if (
      err &&
      err.message ===
        'UNAUTHORIZED'
    ) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',

        message:
          '관리자 로그인이 필요합니다.'
      });
    }


    if (
      err &&
      err.message ===
        'FORBIDDEN'
    ) {
      return res.status(403).json({
        error: 'FORBIDDEN',

        message:
          '관리자 계정만 사용할 수 있습니다.'
      });
    }


    if (
      err &&
      err.message ===
        'USER_NOT_FOUND'
    ) {
      return res.status(404).json({
        error: 'USER_NOT_FOUND',

        message:
          '회원 정보를 찾지 못했습니다.'
      });
    }


    if (
      err &&
      err.message ===
        'INVALID_CREDIT_COUNT'
    ) {
      return res.status(400).json({
        error:
          'INVALID_CREDIT_COUNT',

        message:
          '질문권 수량이 올바르지 않습니다.',

        apiVersion:
          API_VERSION
      });
    }


    const code =
      err &&
      err.code ===
        'auth/id-token-revoked'
        ? 'TOKEN_REVOKED'
        : 'SERVER_ERROR';


    return res.status(500).json({
      error: code,

      message:
        '관리자 작업 처리 중 오류가 발생했습니다.',

      apiVersion:
        API_VERSION
    });
  }
};
