'use strict';
// On Cloud Run, use the attached Google identity instead of exporting a private key.
function initializeRuntimeAuth({admin=require('firebase-admin'),env=process.env}={}){
 if(!env.K_SERVICE||env.FIREBASE_SERVICE_ACCOUNT_JSON||admin.apps.length)return;
 const projectId=env.GOOGLE_CLOUD_PROJECT,serviceAccountId=env.FIREBASE_ADMIN_SERVICE_ACCOUNT;
 if(!projectId||!serviceAccountId?.endsWith('@'+projectId+'.iam.gserviceaccount.com'))throw new Error('Cloud Run Firebase identity is not configured');
 admin.initializeApp({credential:admin.credential.applicationDefault(),projectId,serviceAccountId});
}
module.exports={initializeRuntimeAuth};
