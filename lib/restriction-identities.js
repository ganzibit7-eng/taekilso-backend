'use strict';
// Profile documents are editable by their owner and cannot establish identity.
function restrictionIdentifiers(uid, decoded = {}, userRecord = {}) {
  const ids = new Set();
  if (uid) ids.add(`uid:${uid}`);
  const email = value => String(value || '').trim().toLowerCase();
  if (decoded?.email_verified === true && email(decoded.email)) ids.add(`email:${email(decoded.email)}`);
  if (userRecord?.emailVerified === true && email(userRecord.email)) ids.add(`email:${email(userRecord.email)}`);
  for (const provider of userRecord?.providerData || []) {
    if (provider?.providerId && provider?.uid) ids.add(`provider:${provider.providerId}:${provider.uid}`);
  }
  if (/^kakao_\d+$/.test(String(uid || ''))) ids.add(`provider:kakao:${String(uid).slice(6)}`);
  return [...ids];
}
module.exports = {restrictionIdentifiers};
