const admin=require('firebase-admin');
const createAdminReport=require('../lib/admin-report');
let db=null;
try{
  if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON))});
  db=admin.firestore();
}catch(_){}
const auth={verifyIdToken:(...args)=>admin.auth().verifyIdToken(...args),getUser:uid=>admin.auth().getUser(uid)};
const report=createAdminReport({db,auth,documentId:admin.firestore.FieldPath.documentId()});
const events=require('../lib/visitor-events').create({db,auth,secret:process.env.TELEMETRY_HASH_SALT||process.env.FIREBASE_SERVICE_ACCOUNT_JSON,increment:n=>admin.firestore.FieldValue.increment(n)});
module.exports=(req,res)=>(req.method==='POST'||req.method==='OPTIONS'?events:report)(req,res);
