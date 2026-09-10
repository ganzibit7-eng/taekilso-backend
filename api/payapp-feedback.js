// Vercel Serverless Function
// PayApp이 결제 상태를 서버끼리 직접 통보하는 feedback endpoint입니다.
//
// 역할:
// 1. PayApp 판매자/연동값 검증
// 2. paymentOrders 주문 존재 여부 검증
// 3. 상품명/결제금액 검증
// 4. 중복 지급 방지
// 5. Firestore transaction으로 프리미엄/질문권 지급
//
// 중요:
// 브라우저의 localStorage나 returnurl 결과는 결제 승인 근거로 사용하지 않습니다.
// 실제 권한 지급은 이 feedbackurl에서 검증된 결과만 신뢰합니다.

const admin = require('firebase-admin');

let db = null;
let initError = null;


// ============================================================
// Firebase Admin 초기화
// ============================================================

try {

  if (!admin.apps.length) {

    const raw =
      process.env.FIREBASE_SERVICE_ACCOUNT_JSON;


    if (!raw) {

      throw new Error(
        'FIREBASE_SERVICE_ACCOUNT_JSON 환경변수가 비어있습니다.'
      );
    }


    const serviceAccount =
      JSON.parse(raw);


    admin.initializeApp({

      credential:
        admin.credential.cert(
          serviceAccount
        )
    });
  }


  db =
    admin.firestore();


} catch (e) {

  initError =
    e;
}


// ============================================================
// PayApp 설정
// ============================================================

const PAYAPP_USERID =
  'green5797';


const PAYAPP_LINKVAL =
  process.env.PAYAPP_LINKVAL;


// 프리미엄 30일
const PREMIUM_DURATION_MS =
  30 *
  24 *
  60 *
  60 *
  1000;


// ============================================================
// 판매 상품
// ============================================================
//
// 상품명/가격은 프론트 index.html과 정확히 같아야 합니다.
//
// PayApp에서 넘어온 가격을 믿지 않고
// paymentOrders에 미리 생성된 상품 정보와 다시 대조합니다.
// ============================================================

const PRODUCTS = {


  // ==========================================================
  // 프리미엄 30일
  // ==========================================================

  taekilso_premium_30days: {

    price:
      19900,


    goodname:
      '택일소 프리미엄 30일 이용권',


    grant:
      async (
        tx,
        userRef
      ) => {

        const userSnap =
          await tx.get(userRef);


        const userData =
          userSnap.exists
            ? (
                userSnap.data() ||
                {}
              )
            : {};


        const now =
          Date.now();


        const currentUntil =
          typeof userData.premiumUntil ===
            'number'

            ? userData.premiumUntil

            : (
                userData.premiumUntil &&
                typeof userData.premiumUntil.toMillis ===
                  'function'

                ? userData.premiumUntil.toMillis()

                : 0
              );


        // 현재 프리미엄 기간이 남아 있으면
        // 남은 기간 뒤에 30일을 더합니다.
        //
        // 예:
        // 현재 12일 남음
        // + 새 이용권 30일
        // = 약 42일 남음

        const baseTime =
          currentUntil > now
            ? currentUntil
            : now;


        const newUntil =
          baseTime +
          PREMIUM_DURATION_MS;


        tx.set(

          userRef,

          {

            premium:
              true,


            premiumUntil:
              newUntil,


            // 새 이용권 구매 시
            // 과거 레거시 필드가 있더라도 0으로 초기화
            premiumUsageCount:
              0

          },

          {
            merge:
              true
          }
        );
      }
  },


  // ==========================================================
  // AI 질문권 5개
  // ==========================================================

  ai_question_pack_5: {

    price:
      1900,


    goodname:
      'AI 질문권 5개',


    grant:
      async (
        tx,
        userRef
      ) => {

        tx.set(

          userRef,

          {

            aiQuestionCredits:
              admin.firestore.FieldValue
                .increment(5)

          },

          {
            merge:
              true
          }
        );
      }
  },


  // ==========================================================
  // AI 질문권 10개
  // ==========================================================

  ai_question_pack_10: {

    price:
      3200,


    goodname:
      'AI 질문권 10개',


    grant:
      async (
        tx,
        userRef
      ) => {

        tx.set(

          userRef,

          {

            aiQuestionCredits:
              admin.firestore.FieldValue
                .increment(10)

          },

          {
            merge:
              true
          }
        );
      }
  }
};


// ============================================================
// POST 값 안전하게 읽기
// ============================================================

function postValue(
  body,
  key
) {

  const value =
    body &&
    body[key];


  return value == null
    ? ''
    : String(value).trim();
}


// ============================================================
// Vercel Handler
// ============================================================

module.exports =
  async (
    req,
    res
  ) => {


    // ========================================================
    // Firebase 초기화 오류
    // ========================================================

    if (initError) {

      console.error(
        '[payapp-feedback] Firebase 초기화 실패:',
        initError
      );


      return res
        .status(500)
        .send(
          'INIT_ERROR: ' +
          initError.message
        );
    }


    // ========================================================
    // PayApp 연동값 설정 확인
    // ========================================================

    if (!PAYAPP_LINKVAL) {

      console.error(
        '[payapp-feedback] PAYAPP_LINKVAL 환경변수가 비어있습니다.'
      );


      return res
        .status(500)
        .send(
          'MISSING_PAYAPP_LINKVAL'
        );
    }


    const debugId =

      Date.now() +
      '_' +
      Math.random()
        .toString(36)
        .slice(2, 8);


    let result =
      'UNKNOWN';


    let extra =
      {};


    let debugRef =
      null;


    try {


      // ======================================================
      // 디버그 로그
      // ======================================================
      //
      // PayApp 요청 body 전체를 그대로 저장하지 않습니다.
      // 전화번호 등의 개인정보가 불필요하게 남는 것을 막습니다.
      //
      // 결제 검증에 필요한 최소 필드만 아래에서 저장합니다.
      // ======================================================

      debugRef =
        db.collection(
          'debugLogs'
        )
        .doc(
          debugId
        );


      debugRef
        .set({

          receivedAt:
            admin.firestore.FieldValue
              .serverTimestamp(),


          method:
            req.method,


          hasLinkvalEnv:
            !!PAYAPP_LINKVAL

        })
        .catch(
          () => {}
        );


      // ======================================================
      // POST 요청만 허용
      // ======================================================

      if (
        req.method !==
          'POST'
      ) {

        result =
          'METHOD_NOT_ALLOWED';


        return res
          .status(405)
          .send(result);
      }


      const body =
        req.body ||
        {};


      // ======================================================
      // PayApp 전달 값
      // ======================================================

      const userid =
        postValue(
          body,
          'userid'
        );


      const linkval =
        postValue(
          body,
          'linkval'
        );


      const orderId =
        postValue(
          body,
          'var1'
        );


      const goodname =
        postValue(
          body,
          'goodname'
        );


      const price =
        Number(
          postValue(
            body,
            'price'
          )
        );


      const payState =
        Number(
          postValue(
            body,
            'pay_state'
          )
        );


      const mulNo =
        postValue(
          body,
          'mul_no'
        );


      const payType =
        postValue(
          body,
          'pay_type'
        );


      const payDate =
        postValue(
          body,
          'pay_date'
        );


      extra = {

        userid,

        orderId,

        goodname,

        price,

        payState,

        mulNo,

        payType,

        payDate,

        linkvalMatched:
          !!linkval &&
          linkval ===
            PAYAPP_LINKVAL
      };


      // ======================================================
      // 판매자 ID 검증
      // ======================================================

      if (
        userid !==
          PAYAPP_USERID
      ) {

        result =
          'INVALID_USER';


        return res
          .status(200)
          .send(result);
      }


      // ======================================================
      // PayApp LINKVAL 검증
      // ======================================================

      if (
        !linkval ||
        linkval !==
          PAYAPP_LINKVAL
      ) {

        result =
          'INVALID_LINKVAL';


        return res
          .status(200)
          .send(result);
      }


      // ======================================================
      // 주문번호 형식 검증
      // ======================================================

      if (
        !orderId ||
        !/^TAK-[A-Z0-9]+-[A-Z0-9]+$/.test(
          orderId
        )
      ) {

        result =
          'INVALID_ORDER';


        return res
          .status(200)
          .send(result);
      }


      // ======================================================
      // 주문 조회
      // ======================================================

      const orderRef =
        db.collection(
          'paymentOrders'
        )
        .doc(
          orderId
        );


      const orderSnap =
        await orderRef.get();


      if (
        !orderSnap.exists
      ) {

        result =
          'UNKNOWN_ORDER';


        return res
          .status(200)
          .send(result);
      }


      const order =
        orderSnap.data() ||
        {};


      // 개인정보가 포함될 수 있으므로
      // 주문 전체 객체를 debugLogs에 넣지 않습니다.

      extra.orderUid =
        order.uid ||
        null;


      extra.orderProduct =
        order.product ||
        null;


      extra.orderStatus =
        order.status ||
        null;


      extra.orderAmount =
        order.amount == null
          ? null
          : order.amount;


      // ======================================================
      // 상품 확인
      // ======================================================

      const product =
        PRODUCTS[
          order.product
        ];


      if (!product) {

        result =
          'UNKNOWN_PRODUCT';


        return res
          .status(200)
          .send(result);
      }


      // ======================================================
      // 결제금액 검증
      // ======================================================

      if (
        !Number.isFinite(price) ||
        price !==
          product.price
      ) {

        result =
          'INVALID_PRICE';


        return res
          .status(200)
          .send(result);
      }


      // ======================================================
      // 상품명 검증
      // ======================================================

      if (
        goodname !==
          product.goodname
      ) {

        result =
          'INVALID_PRODUCT_NAME';


        return res
          .status(200)
          .send(result);
      }


      // ======================================================
      // paymentOrders에 저장된 가격 검증
      // ======================================================

      if (
        order.amount !==
          product.price
      ) {

        result =
          'INVALID_ORDER_DATA';


        return res
          .status(200)
          .send(result);
      }


      if (
        !order.uid ||
        typeof order.uid !==
          'string'
      ) {

        result =
          'INVALID_ORDER_UID';


        return res
          .status(200)
          .send(result);
      }


      // ======================================================
      // 이미 지급 완료된 동일 결제
      // ======================================================

      if (
        order.status ===
          'paid' &&
        order.mul_no ===
          mulNo
      ) {

        result =
          'SUCCESS_ALREADY_PAID';


        return res
          .status(200)
          .send(
            'SUCCESS'
          );
      }


      // ======================================================
      // PayApp 결제 완료
      // ======================================================

      if (
        payState === 4
      ) {


        await db.runTransaction(
          async (
            tx
          ) => {


            // transaction 안에서
            // 주문을 다시 읽습니다.

            const latest =
              await tx.get(
                orderRef
              );


            if (
              !latest.exists
            ) {

              throw new Error(
                'ORDER_NOT_FOUND'
              );
            }


            const latestOrder =
              latest.data() ||
              {};


            // ==================================================
            // 이미 결제 처리됨
            // ==================================================

            if (
              latestOrder.status ===
                'paid'
            ) {

              return;
            }


            // ==================================================
            // pending 주문만 지급
            // ==================================================

            if (
              latestOrder.status !==
                'pending'
            ) {

              throw new Error(
                'ORDER_NOT_PENDING'
              );
            }


            // ==================================================
            // 주문 상품/가격 다시 확인
            // ==================================================

            if (

              latestOrder.amount !==
                product.price

              ||

              latestOrder.product !==
                order.product

            ) {

              throw new Error(
                'ORDER_MISMATCH'
              );
            }


            if (
              !latestOrder.uid ||
              typeof latestOrder.uid !==
                'string'
            ) {

              throw new Error(
                'ORDER_UID_MISSING'
              );
            }


            // ==================================================
            // 동일 PayApp 거래번호가
            // 다른 주문에 이미 지급됐는지 방지
            // ==================================================
            //
            // mul_no가 있는 경우 별도 문서를 생성해
            // 하나의 PayApp 거래번호가 여러 주문에
            // 재사용되는 것을 막습니다.
            // ==================================================

            let transactionRef =
              null;


            if (mulNo) {

              transactionRef =
                db.collection(
                  'payappTransactions'
                )
                .doc(
                  mulNo
                    .replace(
                      /[^A-Za-z0-9_-]/g,
                      '_'
                    )
                );


              const transactionSnap =
                await tx.get(
                  transactionRef
                );


              if (
                transactionSnap.exists
              ) {

                const transactionData =
                  transactionSnap.data() ||
                  {};


                // 같은 주문의 재통보는 정상
                if (
                  transactionData.orderId !==
                    orderId
                ) {

                  throw new Error(
                    'DUPLICATE_MUL_NO'
                  );
                }
              }
            }


            // ==================================================
            // 사용자
            // ==================================================

            const userRef =
              db.collection(
                'users'
              )
              .doc(
                latestOrder.uid
              );


            // ==================================================
            // 상품 지급
            // ==================================================

            await product.grant(
              tx,
              userRef
            );


            // ==================================================
            // 사용자 결제 기록
            // ==================================================

            tx.set(

              userRef,

              {

                lastOrderId:
                  orderId,


                lastPurchaseAt:
                  Date.now(),


                lastVerificationMethod:
                  'server-verified',


                lastMulNoGranted:
                  mulNo ||
                  null

              },

              {
                merge:
                  true
              }
            );


            // ==================================================
            // 통계
            // ==================================================

            const statsRef =
              db.collection(
                'stats'
              )
              .doc(
                'counters'
              );


            tx.set(

              statsRef,

              {

                purchases:
                  admin.firestore.FieldValue
                    .increment(1),


                revenue:
                  admin.firestore.FieldValue
                    .increment(
                      product.price
                    ),


                [
                  `purchasesByProduct.${latestOrder.product}`
                ]:
                  admin.firestore.FieldValue
                    .increment(1)

              },

              {
                merge:
                  true
              }
            );


            // ==================================================
            // PayApp 거래번호 기록
            // ==================================================

            if (
              transactionRef
            ) {

              tx.set(

                transactionRef,

                {

                  orderId,

                  uid:
                    latestOrder.uid,

                  product:
                    latestOrder.product,

                  amount:
                    product.price,

                  mulNo,

                  createdAt:
                    admin.firestore.FieldValue
                      .serverTimestamp()

                },

                {
                  merge:
                    false
                }
              );
            }


            // ==================================================
            // 주문 완료 처리
            // ==================================================

            tx.update(

              orderRef,

              {

                status:
                  'paid',


                mul_no:
                  mulNo ||
                  null,


                pay_state:
                  4,


                pay_type:
                  payType,


                pay_date:
                  payDate,


                updatedAt:
                  admin.firestore.FieldValue
                    .serverTimestamp()
              }
            );
          }
        );


        result =
          'SUCCESS_GRANTED';


        return res
          .status(200)
          .send(
            'SUCCESS'
          );
      }


      // ======================================================
      // 결제 완료가 아닌 상태
      // ======================================================
      //
      // 1  = 결제 요청
      // 4  = 결제 완료
      // 8/32 = 결제 요청 취소
      // 9/64 = 승인 취소
      // 10 = 결제 대기
      // 70/71 = 부분취소 관련 상태
      //
      // 권한 지급은 pay_state === 4 일 때만 합니다.
      // ======================================================

      if (
        [
          1,
          8,
          9,
          10,
          32,
          64,
          70,
          71
        ].includes(
          payState
        )
      ) {

        await orderRef.set(

          {

            lastPayState:
              payState,


            lastMulNo:
              mulNo ||
              null,


            updatedAt:
              admin.firestore.FieldValue
                .serverTimestamp()

          },

          {
            merge:
              true
          }
        );
      }


      result =
        'SUCCESS_NOT_PAID_STATE';


      return res
        .status(200)
        .send(
          'SUCCESS'
        );


    } catch (error) {


      result =
        'EXCEPTION: ' +
        (
          error &&
          error.message
            ? error.message
            : 'UNKNOWN'
        );


      console.error(
        '[payapp-feedback] 예외 발생:',
        error
      );


      // PayApp이 서버 오류로 판단하게 하기 위해
      // 실제 처리 오류는 500을 반환합니다.
      //
      // 정상적인 검증 실패(INVALID_*)는 위에서
      // 200 응답으로 이미 종료됩니다.

      return res
        .status(500)
        .send(
          'ERROR'
        );


    } finally {


      // ======================================================
      // 디버그 결과 저장
      // ======================================================

      if (debugRef) {

        await debugRef

          .set(

            {

              result,


              extra:
                JSON.parse(
                  JSON.stringify(
                    extra
                  )
                )

            },

            {
              merge:
                true
            }
          )

          .catch(
            () => {}
          );
      }
    }
  };
