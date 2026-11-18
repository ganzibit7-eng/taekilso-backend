# Dependency compatibility patch

The post-release audit found GHSA-w5hq-g745-h8pq in the UUID dependency inherited through Google request clients. Pin the supported CommonJS patch version 11.1.1 with an npm override and keep Firebase Admin 13's existing namespaced API. Firebase Admin 14 removes that API, so an automatic major upgrade would break the current handlers.

The affected clients use `uuid.v4()` without caller buffers. No exploit or customer data exposure was observed. The patch removes the vulnerable implementation rather than relying on that limited use. The lockfile is committed and clean installation must preserve the override.

Compatibility tests resolve UUID from each actual Google client, generate valid v4 identifiers, check rejection of undersized v5 buffers, initialize namespaced Firebase Auth and serialize a Firestore batch without committing it. No production database writes, API keys, user logins or payments are used in these tests.

Sources: https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq and https://firebase.google.com/support/release-notes/admin/node#version_1400_-_8_june_2026
