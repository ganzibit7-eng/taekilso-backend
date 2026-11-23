'use strict';

const { ms } = require('./payment-entitlements');
const FIELD = 'reportExpiresAt';
const KST = 9 * 60 * 60 * 1000;

function anniversary(approvedAtMs) {
  const korean = new Date(approvedAtMs + KST);
  const year = korean.getUTCFullYear() + 1;
  const month = korean.getUTCMonth();
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  korean.setUTCFullYear(year, month, Math.min(korean.getUTCDate(), lastDay));
  return +korean - KST;
}

function expiresAtMs(document) {
  return ms(document?.[FIELD]);
}

function expired(document, now = Date.now()) {
  const until = expiresAtMs(document);
  return until > 0 && now >= until;
}

function display(document) {
  const until = expiresAtMs(document);
  return until > 0 ? { expiresAtMs:until } : {};
}

module.exports = { FIELD, anniversary, expiresAtMs, expired, display };
