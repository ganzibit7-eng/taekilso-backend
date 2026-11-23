'use strict';

const ADMIN_EMAIL = 'green092432@gmail.com';
const isAdminEmail = email => String(email || '').trim().toLowerCase() === ADMIN_EMAIL;

function canOpenAdminReports(identity) {
  return !!identity?.uid && identity.email_verified === true &&
    identity.signInProvider === 'google.com' && isAdminEmail(identity.email);
}

module.exports = {ADMIN_EMAIL,isAdminEmail,canOpenAdminReports};
