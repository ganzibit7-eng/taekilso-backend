const {test}=require('node:test'),assert=require('node:assert/strict');
const {createServer,ROUTES}=require('../server.cjs');
async function withServer(fn,options={}){
 const server=createServer(options);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{return await fn('http://127.0.0.1:'+server.address().port);}finally{await new Promise(resolve=>server.close(resolve));}
}
test('only declared API routes are dispatched; health exposes no account or configuration data',()=>withServer(async base=>{
 assert.deepEqual(await(await fetch(base+'/health-check')).json(),{status:'ok'});
 for(const path of ['/api/_ban','/api/../server.cjs','/.env','/api/unknown','/api/ai-chat/extra'])assert.equal((await fetch(base+path)).status,404);
 assert.equal(ROUTES.includes('_ban'),false);
},{loadHandler:()=>{throw Error('must not load handlers');}}));
test('JSON, authorization, method and repeated query values reach the unchanged API handler',()=>withServer(async base=>{
 const r=await fetch(base+'/api/ai-chat?tag=a&tag=b',{method:'POST',headers:{authorization:'Bearer test-token','content-type':'application/json'},body:JSON.stringify({message:'내 사주와 진로',history:[]})});
 assert.equal(r.status,201);assert.deepEqual(await r.json(),{name:'ai-chat',auth:'Bearer test-token',method:'POST',query:{tag:['a','b']},body:{message:'내 사주와 진로',history:[]}});
},{loadHandler:name=>(req,res)=>res.status(201).json({name,auth:req.headers.authorization,method:req.method,query:req.query,body:req.body})}));
test('PayApp form fields and plain SUCCESS response retain their transport contract',()=>withServer(async base=>{
 const r=await fetch(base+'/api/payapp-feedback',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({price:'8900',goodname:'택일소 프리미엄',var1:'order-1'})});
 assert.equal(r.status,200);assert.equal(await r.text(),'SUCCESS');
},{loadHandler:name=>(req,res)=>{assert.equal(name,'payapp-feedback');assert.equal(req.body.price,'8900');assert.equal(req.body.goodname,'택일소 프리미엄');assert.equal(req.body.var1,'order-1');res.status(200).send('SUCCESS');}}));
test('malformed JSON and excessive bodies are rejected before any business handler runs',()=>withServer(async base=>{
 assert.equal((await fetch(base+'/api/ai-chat',{method:'POST',headers:{'content-type':'application/json'},body:'{broken'})).status,400);
 assert.equal((await fetch(base+'/api/ai-chat',{method:'POST',body:'x'.repeat(100)})).status,413);
},{maxBodyBytes:20,loadHandler:()=>{throw Error('must not dispatch');}}));
test('caller-controlled Vercel IP header cannot replace the final managed ingress address',()=>withServer(async base=>{
 const r=await fetch(base+'/api/admin-report',{headers:{'x-vercel-forwarded-for':'1.1.1.1','x-forwarded-for':'9.9.9.9, 192.0.2.10'}});
 assert.deepEqual(await r.json(),{forwarded:'192.0.2.10'});
},{loadHandler:()=>(req,res)=>res.json({vercel:req.headers['x-vercel-forwarded-for'],forwarded:req.headers['x-forwarded-for']})}));

test('overlapping consultation requests retain their own member token, profile and response',()=>withServer(async base=>{
 const calls=Array.from({length:30},(_,index)=>({index,authorization:'Bearer synthetic-member-'+index,profile:'synthetic-profile-'+index}));
 const replies=await Promise.all(calls.map(async call=>{
  const response=await fetch(base+'/api/ai-chat',{method:'POST',headers:{authorization:call.authorization,'content-type':'application/json'},body:JSON.stringify({index:call.index,profile:call.profile})});
  assert.equal(response.status,200);return response.json();
 }));
 for(const call of calls)assert.deepEqual(replies[call.index],call);
},{loadHandler:()=>async(req,res)=>{
 await new Promise(resolve=>setTimeout(resolve,(29-req.body.index)%10));
 res.json({index:req.body.index,authorization:req.headers.authorization,profile:req.body.profile});
}}));
