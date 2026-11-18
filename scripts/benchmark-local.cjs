'use strict';
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const name of ['.env.local','.env.claude-test.local']){const file=path.join(root,name);if(fs.existsSync(file))for(const line of fs.readFileSync(file,'utf8').split(/\r?\n/)){const m=line.match(/^([A-Z_]+)=(.*)$/);if(m&&m[2].trim())process.env[m[1]]=m[2].trim().replace(/^(["'])(.*)\1$/,'$2');}}
const cmp=require('../lib/openai-comparison'),service=require('../lib/consultation-service');
const stateFile=path.join(root,'.env-benchmark-ledger.json');
function fileDb(){let serial=Promise.resolve();const read=()=>fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{};const write=data=>{fs.writeFileSync(stateFile+'.tmp',JSON.stringify(data),{mode:0o600});fs.renameSync(stateFile+'.tmp',stateFile);};
 const reference=(name,id)=>({path:name+'/'+id,set:async function(value,options){const all=read();all[this.path]=options?.merge?{...all[this.path],...value}:value;write(all);}});
 return {collection:name=>({doc:id=>reference(name,id)}),runTransaction(callback){const run=serial.then(async()=>{const before=read(),writes=[];const result=await callback({get:async ref=>({exists:Object.hasOwn(before,ref.path),data:()=>before[ref.path]}),set:(ref,data)=>writes.push([ref.path,data])});for(const [k,v]of writes)before[k]=v;write(before);return result;});serial=run.catch(()=>{});return run;}};
}
async function main(){
 const fixtureId=process.argv[2]||'career',provider=process.argv[3]||'openai';
 if(!Object.hasOwn(cmp.FIXTURES,fixtureId))throw new Error('INVALID_FIXTURE');
 const env={...process.env,AI_COMPARE_ENABLED:'true',OPENAI_COMPARE_MODEL:cmp.MODEL,AI_COMPARE_DAILY_USD:'1',AI_COMPARE_MONTHLY_USD:'1',AI_COMPARE_TOTAL_USD:'1',AI_COMPARE_APPROVED_UNTIL:'2026-11-19T00:00:00Z'};
 const db=fileDb(),now=new Date(),start=Date.now();let result;
 if(provider==='both')result=await cmp.compare({fixtureId,db,env,now});
 else{
  if(!['openai','anthropic'].includes(provider))throw new Error('INVALID_PROVIDER');
  const key=provider==='openai'?env.OPENAI_API_KEY:env.ANTHROPIC_API_KEY;if(!key)throw new Error('TEST_KEY_MISSING');
  const body=structuredClone(cmp.FIXTURES[fixtureId]),records=[];
  try{const generated=await service.generate({body,messages:[{role:'user',content:body.message}],model:provider==='openai'?cmp.MODEL:cmp.CLAUDE,key:'server-transport',consultantId:'yeonwoo',annualAllowed:false,annualContext:'',scope:'일반 상담입니다. 제공된 계산 자료만 사용합니다.',now,fetchImpl:cmp.transport({provider,key,db,env,fetchImpl:fetch,now,records})});result={fixture_id:fixtureId,provider,status:'passed',reply:generated.reply,evidence:generated.evidence,calls:records,diagnostics:generated.diagnostics};}
  catch(error){result={fixture_id:fixtureId,provider,status:'failed',code:error.code||'AI_ERROR',calls:records};}
 }
 result.wall_ms=Date.now()-start;result.reference_time=now.toISOString();
 const out=path.resolve(root,'../../benchmark-results');fs.mkdirSync(out,{recursive:true});const file=path.join(out,fixtureId+'-'+provider+'-'+Date.now()+'.json');fs.writeFileSync(file,JSON.stringify(result,null,2));
 const records=result.calls||[];console.log(JSON.stringify({file,status:result.status,results:result.results?Object.fromEntries(Object.entries(result.results).map(([k,v])=>[k,{status:v.status,code:v.code}])):undefined,code:result.code,provider_calls:records.length,reserved_usd:records.reduce((n,c)=>n+c.reserved_usd,0),estimated_usd:records.every(c=>Number.isFinite(c.estimated_usd))?records.reduce((n,c)=>n+c.estimated_usd,0):null,wall_ms:result.wall_ms}));
}
main().catch(()=>{console.error('BENCHMARK_SETUP_FAILED; no secret values logged');process.exitCode=1;});
