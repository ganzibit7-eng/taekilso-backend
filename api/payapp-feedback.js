rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function signedIn() { return request.auth != null; }
    function isAdmin() {
      return signedIn() && request.auth.token.email == 'green092432@gmail.com';
    }

    match /stats/counters {
      allow read: if isAdmin();
      allow create: if request.resource.data.keys().hasOnly(['visits', 'signups', 'purchases']);
      allow update: if request.resource.data.diff(resource.data).affectedKeys().hasOnly(['visits', 'signups', 'purchases']);
    }

    match /users/{uid} {
      allow read: if isAdmin() || (signedIn() && request.auth.uid == uid);

      allow create: if (signedIn() && request.auth.uid == uid && request.resource.data.premium == false)
                    || uid.matches('kakao_.*');

      allow update: if isAdmin()
                    || uid.matches('kakao_.*')
                    || (signedIn() && request.auth.uid == uid
                        && (
                          request.resource.data.diff(resource.data).affectedKeys()
                            .hasOnly(['email', 'nickname', 'provider', 'createdAt'])
                          || (
                            request.resource.data.diff(resource.data).affectedKeys().hasOnly(['premiumUsageCount'])
                            && request.resource.data.premiumUsageCount == resource.data.premiumUsageCount + 1
                          )
                        ));

      allow delete: if isAdmin() || (signedIn() && request.auth.uid == uid);
    }

    match /paymentOrders/{orderId} {
      allow create: if (signedIn() && request.resource.data.uid == request.auth.uid || request.resource.data.uid.matches('kakao_.*'))
                    && request.resource.data.amount == 4900
                    && request.resource.data.product == 'taekilso_premium_30days'
                    && request.resource.data.status == 'pending';
      allow read: if isAdmin() || (signedIn() && resource.data.uid == request.auth.uid) || resource.data.uid.matches('kakao_.*');
      allow update, delete: if false;
    }

    match /inquiries/{inquiryId} {
      allow get: if true;
      allow list: if isAdmin();
      allow create: if request.resource.data.keys().hasAll(['uid','title','message','status','createdAt']);
      allow update: if isAdmin();
      allow delete: if isAdmin() || resource.data.status != '답변완료';
    }

    match /debugLogs/{docId} {
      allow read: if isAdmin();
      allow write: if false;
    }
  }
}
