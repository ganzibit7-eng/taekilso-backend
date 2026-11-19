'use strict';
// Kakao REST application identifier used by the existing public OAuth client.
const kakaoClientId = '189da591834b8e3edfffa2c7afa41c0d';
const callback = 'https://taekilso.com/';

async function recentlyAuthenticated(decoded, body, {now=Date.now, transport=fetch}={}) {
  if (!decoded?.uid || body?.confirm !== true) return false;
  const provider = decoded.firebase?.sign_in_provider;
  if (provider !== 'custom') {
    const age = now()/1000 - decoded.auth_time;
    return ['google.com','password'].includes(provider) && Number.isInteger(decoded.auth_time) && age >= -30 && age <= 300;
  }
  const code = body.kakaoCode;
  if (!decoded.uid.startsWith('kakao_') || typeof code !== 'string' || !code || code.length > 1024) return false;
  // Require a new, single-use authorization code; an existing Kakao bearer
  // token or a newly minted Firebase custom session alone cannot delete an account.
  const token = await transport('https://kauth.kakao.com/oauth/token', {
    method:'POST', redirect:'error', signal:AbortSignal.timeout(8000),
    body:new URLSearchParams({grant_type:'authorization_code',client_id:kakaoClientId,redirect_uri:callback,code})
  });
  if (!token.ok) return false;
  const {access_token:accessToken} = await token.json();
  if (typeof accessToken !== 'string' || !accessToken) return false;
  const profile = await transport('https://kapi.kakao.com/v2/user/me', {
    method:'GET', redirect:'error', signal:AbortSignal.timeout(8000),headers:{Authorization:'Bearer '+accessToken}
  });
  if (!profile.ok) return false;
  const me = await profile.json();
  return !!me.id && 'kakao_'+String(me.id) === decoded.uid;
}
module.exports={recentlyAuthenticated};
