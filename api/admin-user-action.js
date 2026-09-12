const admin = require('firebase-admin');
const crypto = require('crypto');

let db = null;
let initError = null;

const API_VERSION = '2026-09-delete-password-v3';

const ADMIN_EMAILS = new Set([
  'green092432@gmail.com'
]);

function safeSecretEqual(input, expected) {
  const a = Buffer.from(String(input || ''), 'utf8');
  const b = Buffer.from(String(expected || ''), 'utf8');

  if (!a.length || !b.length || a.length !== b.length) {
    return false;
  }

  return crypto.timingSafeEqual(a, b);
}


/* =========================
   Firebase Admin 초기화
========================= */

try {
  if (!admin.apps.length) {
    const raw =
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

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
    (req.headers &&
      req.headers.authorization) ||
      ''
  ).trim();

  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('UNAUTHORIZED');
  }

  const token =
    authHeader.slice(7).trim();

  if (!token) {
    throw new Error('UNAUTHORIZED');
  }

  const decoded =
    await admin
      .auth()
      .verifyIdToken(token, true);

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
      .collection('adminAuditLogs')
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
    const snap =
      await collectionRef
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
    return res
      .status(204)
      .end();
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
      String(
        body.action || ''
      ).trim();

    const uid =
      String(
        body.uid || ''
      ).trim();


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
        db
          .collection('users')
          .doc(uid);

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
          Number(
            data.premiumUntil || 0
          );
      }

      const now =
        Date.now();

      // 기존 프리미엄 기간이 남아 있으면
      // 기존 만료일 뒤에 30일을 추가합니다.
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

          premiumUntil:
            until,

          grantedByAdmin:
            true,

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
          premiumUntil:
            until
        }
      );


      return res.status(200).json({
        ok: true,

        action,
        uid,

        premium: true,

        premiumUntil:
          until,

        apiVersion:
          API_VERSION
      });
    }



    /* =========================
       프리미엄 회수
    ========================= */

    if (action === 'revoke_premium') {

      const userRef =
        db
          .collection('users')
          .doc(uid);


      await userRef.set(
        {
          premium: false,

          premiumUntil:
            0,

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

        premiumUntil:
          0,

        apiVersion:
          API_VERSION
      });
    }



    /* =========================
       질문권 지급
       1 / 5 / 10개
    ========================= */

    if (action === 'grant_credits') {

      const count =
        Number(
          body.count || 0
        );


      if (
        ![1, 5, 10]
          .includes(count)
      ) {
        throw new Error(
          'INVALID_CREDIT_COUNT'
        );
      }


      const ref =
        db
          .collection('users')
          .doc(uid);


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
        db
          .collection('users')
          .doc(uid);


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

    if (
      action === 'delete_user' ||
      action === 'force_delete'
    ) {

      /*
       * 강제탈퇴는 Firebase 관리자 인증에 더해
       * Vercel에 저장한 별도 비밀번호를 요구합니다.
       *
       * 비밀번호를 이 코드에 직접 적지 마세요.
       */
      const expectedDeletePassword =
        String(
          process.env
            .ADMIN_DELETE_PASSWORD ||
          ''
        );


      if (!expectedDeletePassword) {

        return res.status(503).json({
          error:
            'DELETE_PASSWORD_NOT_CONFIGURED',

          message:
            '강제탈퇴 비밀번호가 서버에 설정되지 않았습니다.'
        });
      }


      if (
        !safeSecretEqual(
          body.deletePassword,
          expectedDeletePassword
        )
      ) {

        await writeAudit(
          actor,
          'delete_user_password_failed',
          uid,
          {
            reason:
              'password_mismatch'
          }
        );


        return res.status(403).json({
          error:
            'DELETE_PASSWORD_INVALID',

          message:
            '강제탈퇴 비밀번호가 올바르지 않습니다.'
        });
      }


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
        db
          .collection('users')
          .doc(uid);


      /*
       * 개인정보 성격의 회원 하위 데이터는 삭제
       */
      await deleteCollection(
        userRef.collection(
          'sajuProfiles'
        )
      );


      await deleteCollection(
        userRef.collection(
          'aiConversations'
        )
      );


      // 회원 메인 문서 삭제
      await userRef.delete();


      /*
       * Firebase Authentication 계정 삭제
       */
      try {

        await admin
          .auth()
          .deleteUser(uid);

      } catch (err) {

        // Auth 계정이 이미 없는 경우에는
        // 탈퇴 처리를 실패시키지 않습니다.
        if (
          !err ||
          err.code !==
            'auth/user-not-found'
        ) {
          throw err;
        }
      }


      /*
       * 결제/문의 기록은 회계·환불·분쟁 확인을 위해
       * 여기서 삭제하지 않습니다.
       */

      await writeAudit(
        actor,
        action,
        uid,
        {
          deleted: true
        }
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
      error:
        'UNKNOWN_ACTION',

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
        error:
          'UNAUTHORIZED',

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
        error:
          'FORBIDDEN',

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
        error:
          'USER_NOT_FOUND',

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


    if (
      err &&
      err.code ===
        'auth/id-token-revoked'
    ) {
      return res.status(401).json({
        error:
          'TOKEN_REVOKED',

        message:
          '관리자 로그인 세션이 만료되었습니다.'
      });
    }


    return res.status(500).json({
      error:
        'SERVER_ERROR',

      message:
        '관리자 작업 처리 중 오류가 발생했습니다.',

      apiVersion:
        API_VERSION
    });
  }
};
