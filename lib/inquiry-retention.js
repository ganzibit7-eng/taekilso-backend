'use strict';
// Only inquiries explicitly marked as ordinary service questions are removed.
// Older, unclassified inquiries may contain refund or dispute correspondence.
async function deleteGeneralInquiries(db, uid) {
  const query = db.collection('inquiries').where('ownerUid','==',uid).orderBy('__name__').limit(100);
  let last;
  do {
    const page = await (last ? query.startAfter(last) : query).get();
    const ordinary = page.docs.filter(doc => {
      const data = doc.data();
      return ['general-kakao','general-firebase'].includes(data.source)
        && data.title !== '프리미엄 결제 환불 요청' && data.legalHold !== true;
    });
    if (ordinary.length) {
      const batch = db.batch();
      for (const doc of ordinary) batch.delete(doc.ref,{lastUpdateTime:doc.updateTime});
      await batch.commit();
    }
    last = page.size === 100 ? page.docs.at(-1) : null;
  } while (last);
}
module.exports={deleteGeneralInquiries};
