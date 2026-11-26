'use strict';
// HTTP transport only. Authentication, entitlements, generation and payment handlers stay unchanged.
const http=require('node:http'),net=require('node:net');
const ROUTES=Object.freeze([
 'admin-member-security','admin-report','admin-user-action','ai-chat','date-report',
 'kakao-custom-token','member-access-status','member-last-seen','member-self-delete',
 'payapp-feedback','premium-status','premium-usage','relationship-report','seohwa-report','featured-report','report-coupons'
]);
const MAX_BODY_BYTES=4_500_000;
function fields(params){
 const result=Object.create(null);
 for(const key of new Set(params.keys())){const values=params.getAll(key);result[key]=values.length===1?values[0]:values;}
 return result;
}
async function parseBody(request,maxBytes){
 const chunks=[];let size=0;
 for await(const chunk of request){size+=chunk.length;if(size>maxBytes)throw Object.assign(new Error('BODY_TOO_LARGE'),{status:413});chunks.push(chunk);}
 if(!size)return {};
 const raw=Buffer.concat(chunks).toString('utf8'),type=String(request.headers['content-type']||'').split(';')[0].trim().toLowerCase();
 if(type==='application/json'){
  try{return JSON.parse(raw);}catch(_){throw Object.assign(new Error('INVALID_JSON'),{status:400});}
 }
 if(type==='application/x-www-form-urlencoded')return fields(new URLSearchParams(raw));
 return raw;
}
function decorate(response){
 response.status=code=>{response.statusCode=code;return response;};
 response.json=data=>{if(!response.headersSent)response.setHeader('Content-Type','application/json; charset=utf-8');response.end(JSON.stringify(data));return response;};
 response.send=data=>{if(typeof data==='object'&&data!==null&&!Buffer.isBuffer(data))return response.json(data);if(!response.headersSent&&!response.hasHeader('Content-Type'))response.setHeader('Content-Type','text/html; charset=utf-8');response.end(data);return response;};
 return response;
}
function sanitizeProxyHeaders(request){
 // Google Cloud Run supplies the final client address for a direct run.app ingress.
 // Do not trust a caller-supplied Vercel-only header on this replacement platform.
 delete request.headers['x-vercel-forwarded-for'];
 const last=String(request.headers['x-forwarded-for']||'').split(',').at(-1).trim();
 if(net.isIP(last))request.headers['x-forwarded-for']=last;else delete request.headers['x-forwarded-for'];
}
function loadProductionHandler(name){
 require('./runtime-auth.cjs').initializeRuntimeAuth();
 return require('./api/'+name+'.js');
}
function createServer({loadHandler=loadProductionHandler,maxBodyBytes=MAX_BODY_BYTES}={}){
 const allowed=new Set(ROUTES);
 const server=http.createServer(async(request,rawResponse)=>{
  const response=decorate(rawResponse);response.setHeader('Cache-Control','no-store');response.setHeader('X-Content-Type-Options','nosniff');
  try{
   const url=new URL(request.url,'http://localhost');
   // Cloud Run reserves some paths ending in z, including externally requested /healthz.
   if(url.pathname==='/health-check'&&['GET','HEAD'].includes(request.method))return response.status(200).json({status:'ok'});
   const name=url.pathname.match(/^\/api\/([a-z][a-z-]*)$/)?.[1];
   if(!allowed.has(name))return response.status(404).json({error:'NOT_FOUND'});
   sanitizeProxyHeaders(request);request.query=fields(url.searchParams);
   request.body=await parseBody(request,maxBodyBytes);
   await loadHandler(name)(request,response);
   if(!response.writableEnded)response.end();
  }catch(error){
   if(response.writableEnded)return;
   if(response.headersSent){response.destroy();return;}
   if(error.status===400||error.status===413)return response.status(error.status).json({error:error.message});
   // Never log the request body, authorization header, profile, or provider key.
   console.error('[http-transport] request handler failed');
   response.status(500).json({error:'INTERNAL_ERROR'});
  }
 });
 server.requestTimeout=300000;server.headersTimeout=15000;server.keepAliveTimeout=5000;
 return server;
}
if(require.main===module){
 const port=Number(process.env.PORT||8080);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
 const server=createServer();server.listen(port,'0.0.0.0',()=>console.info('[http-transport] listening'));
 const stop=()=>server.close(()=>process.exit(0));process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
module.exports={createServer,ROUTES,MAX_BODY_BYTES};
