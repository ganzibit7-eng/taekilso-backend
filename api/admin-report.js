const admin=require('firebase-admin');
const createAdminReport=require('../lib/admin-report');
let db=null;
try{
  if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
  db=admin.firestore();
}catch(_){}
module.exports=createAdminReport({db,auth:{verifyIdToken:(...args)=>admin.auth().verifyIdToken(...args)},documentId:admin.firestore.FieldPath.documentId()});
