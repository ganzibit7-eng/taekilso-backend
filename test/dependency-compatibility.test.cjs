const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createRequire}=require('node:module');

test('patched UUID preserves CommonJS v4 identifiers for every Google request client',()=>{
 for(const dependency of ['google-gax','gaxios','teeny-request']){
  const requireFromClient=createRequire(require.resolve(dependency));
  const uuid=requireFromClient('uuid');
  const id=uuid.v4();
  assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(uuid.validate(id),true);
  assert.throws(()=>uuid.v5('test',uuid.v5.DNS,new Uint8Array(8),4),RangeError);
 }
});

test('Firebase namespaced auth and Firestore writes still initialize and serialize without sending requests',async()=>{
 const admin=require('firebase-admin');
 const app=admin.initializeApp({projectId:'demo-taekilso-dependency-check'},'dependency-compatibility');
 try{
  assert.equal(typeof app.auth().verifyIdToken,'function');
  const db=app.firestore(),reference=db.collection('dependencyChecks').doc('local-only');
  const batch=db.batch();
  assert.equal(batch.set(reference,{count:admin.firestore.FieldValue.increment(1),createdAt:admin.firestore.Timestamp.fromMillis(0)}),batch);
  assert.equal(reference.path,'dependencyChecks/local-only');
 }finally{await app.delete();}
});
