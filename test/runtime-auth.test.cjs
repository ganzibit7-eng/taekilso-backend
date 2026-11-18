const {test}=require('node:test'),assert=require('node:assert/strict');
const {initializeRuntimeAuth}=require('../runtime-auth.cjs');
function fake(){const calls=[];return {calls,apps:[],credential:{applicationDefault:()=>({kind:'managed-google-identity'})},initializeApp(value){this.apps.push(value);this.calls.push(value);}};}
test('Cloud Run uses the attached identity and the existing Firebase project, once',()=>{
 const admin=fake(),env={K_SERVICE:'consultation-api',GOOGLE_CLOUD_PROJECT:'taekilso',FIREBASE_ADMIN_SERVICE_ACCOUNT:'taekilso-api@taekilso.iam.gserviceaccount.com'};
 initializeRuntimeAuth({admin,env});initializeRuntimeAuth({admin,env});
 assert.equal(admin.calls.length,1);assert.deepEqual(admin.calls[0],{credential:{kind:'managed-google-identity'},projectId:'taekilso',serviceAccountId:env.FIREBASE_ADMIN_SERVICE_ACCOUNT});
});
test('legacy credentials and non-Cloud Run execution keep their current initialization',()=>{
 const admin=fake();initializeRuntimeAuth({admin,env:{}});initializeRuntimeAuth({admin,env:{K_SERVICE:'api',FIREBASE_SERVICE_ACCOUNT_JSON:'existing-private-value'}});assert.equal(admin.calls.length,0);
});
test('a missing or mismatched signing identity is rejected before any Firebase access',()=>{
 for(const serviceAccountId of [undefined,'other@different-project.iam.gserviceaccount.com']){
  const admin=fake();assert.throws(()=>initializeRuntimeAuth({admin,env:{K_SERVICE:'api',GOOGLE_CLOUD_PROJECT:'taekilso',FIREBASE_ADMIN_SERVICE_ACCOUNT:serviceAccountId}}),/not configured/);assert.equal(admin.calls.length,0);
 }
});
