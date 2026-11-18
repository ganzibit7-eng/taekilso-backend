'use strict';
// Server-only adapter. Both providers pass through the same calculation,
// source binding, prose validation, character renderer and entitlement gates.
const MODEL='gpt-6.2-sol';
const fail=(code,status=502)=>Object.assign(new Error(code),{code,status});
function inputMessages(messages){
 return messages.flatMap(m=>{
  if(typeof m.content==='string')return [{role:m.role,content:m.content}];
  if(!Array.isArray(m.content))throw fail('AI_MESSAGE_FORMAT');
  return m.content.map(b=>{
   if(b.type==='tool_use')return {type:'function_call',call_id:b.id,name:b.name,arguments:JSON.stringify(b.input)};
   if(b.type==='tool_result')return {type:'function_call_output',call_id:b.tool_use_id,output:b.content};
   if(b.type==='text')return {role:m.role,content:b.text};
   throw fail('AI_MESSAGE_FORMAT');
  });
 });
}
function openaiPayload(payload,previous){
 const toolName=payload.tool_choice.name;
 const toolResult=payload.messages.at(-1)?.content?.find?.(b=>b.type==='tool_result');
 const resumes=previous&&toolResult&&previous.output.some(b=>b.type==='function_call'&&b.call_id===toolResult.tool_use_id);
 const input=resumes?[...previous.input,...previous.output,{type:'function_call_output',call_id:toolResult.tool_use_id,output:toolResult.content}]:inputMessages(payload.messages);
 return {model:MODEL,instructions:payload.system,input,max_output_tokens:payload.max_tokens,
  reasoning:{effort:'low'},store:false,include:['reasoning.encrypted_content'],service_tier:'default',parallel_tool_calls:false,
  tools:payload.tools.map(t=>({type:'function',name:t.name,description:t.description,parameters:t.input_schema,strict:true})),
  tool_choice:{type:'function',name:toolName}};
}
function normalize(data,name){
 const functions=(data.output||[]).filter(b=>b.type==='function_call');
 const refusal=(data.output||[]).some(b=>(b.content||[]).some(c=>c.type==='refusal'));
 let content=[];
 if(!refusal&&data.status==='completed'&&functions.length===1&&functions[0].name===name){
  try{content=[{type:'tool_use',id:functions[0].call_id,name,input:JSON.parse(functions[0].arguments)}];}catch(_){}
 }
 return {model:data.model||MODEL,usage:data.usage||{},stop_reason:content.length?'tool_use':'incomplete',content};
}
function estimate(provider,usage){
 if(!Number.isFinite(usage?.input_tokens)||!Number.isFinite(usage?.output_tokens))return null;
 // Conservative standard short-context estimate: no cached-input discount.
 const input=usage.input_tokens+(usage.cache_creation_input_tokens||0)*1.25+(usage.cache_read_input_tokens||0)*.1;
 return (provider==='openai'?usage.input_tokens*2+usage.output_tokens*10:input+usage.output_tokens*5)/1e6;
}
function create({env=process.env,fetchImpl=fetch,kind='chat'}={}){
 const enabled=env.AI_PRIMARY_PROVIDER==='openai',records=[];
 if(enabled&&env.OPENAI_MODEL!==MODEL)throw fail('AI_MODEL_NOT_ALLOWED',503);
 if(enabled&&!env.OPENAI_API_KEY)throw fail('AI_PROVIDER_KEY_MISSING',503);
 let previous;
 async function routed(url,options){
  if(!enabled)return fetchImpl(url,options);
  const payload=JSON.parse(options.body);
  // One primary and, only on transport/availability error, one fallback per
  // generation/repair step. A refusal or failed evidence check never triggers it.
  for(const provider of ['openai','anthropic']){
   if(options.signal?.aborted)throw fail('AI_TIMEOUT',504);
   const key=provider==='openai'?env.OPENAI_API_KEY:options.headers['x-api-key'];
   if(!key)throw fail('AI_PROVIDER_KEY_MISSING',503);
   const request=provider==='openai'?openaiPayload(payload,previous):payload;
   const record={provider,model:provider==='openai'?MODEL:payload.model,status:'started',usage:null,estimated_usd:null},start=Date.now();records.push(record);
   // Leave time inside the existing request for Claude on an actual timeout.
   const local=AbortSignal.timeout(provider==='openai'?(kind==='annual'?100000:28000):(kind==='annual'?100000:25000));
   const signal=options.signal?AbortSignal.any([options.signal,local]):local;
   try{
    const response=await fetchImpl(provider==='openai'?'https://api.openai.com/v1/responses':url,{
     ...options,signal,headers:provider==='openai'?{'Content-Type':'application/json',Authorization:'Bearer '+key}:options.headers,
     body:JSON.stringify(request)});
    if(!response.ok){
     record.http_status=response.status;
     // Bad schemas/invalid arguments require a fix, not an invisible second call.
     const availability=response.status===408||response.status===409||response.status===429||response.status===401||response.status===403||response.status>=500;
     if(!availability)throw fail('AI_REQUEST_REJECTED');
     throw fail('AI_UPSTREAM_ERROR');
    }
    let data;
    try{data=await response.json();}catch(_){throw fail('AI_UPSTREAM_ERROR');}
    record.usage=data.usage||null;record.estimated_usd=estimate(provider,data.usage);record.status='received';
    if(provider==='openai'){
     previous={input:request.input,output:data.output||[]};
     return {ok:true,status:response.status,json:async()=>normalize(data,payload.tool_choice.name)};
    }
    previous=null;
    return {ok:true,status:response.status,json:async()=>data};
   }catch(error){
    const timeout=error.name==='AbortError'||error.name==='TimeoutError'||error.code==='AI_TIMEOUT';
    record.status=timeout?'timeout':'failed';
    const code=timeout?'AI_TIMEOUT':String(error.code||'').startsWith('AI_')?error.code:'AI_UPSTREAM_ERROR';
    if(provider==='openai'&&!options.signal?.aborted&&['AI_UPSTREAM_ERROR','AI_TIMEOUT'].includes(code))continue;
    throw fail(code,timeout?504:502);
   }finally{record.latency_ms=Date.now()-start;}
  }
  throw fail('AI_UPSTREAM_ERROR');
 }
 function summarize(original={}){
  if(!enabled||!records.length)return original;
  const received=records.filter(r=>r.status==='received'),last=received.at(-1),usage={};
  for(const r of received)for(const k of ['input_tokens','output_tokens','cache_creation_input_tokens','cache_read_input_tokens'])usage[k]=(usage[k]||0)+(r.usage?.[k]||0);
  const known=records.every(r=>Number.isFinite(r.estimated_usd));
  return {...original,selected_provider:last?.provider||'openai',fallback_used:records.some(r=>r.provider==='anthropic'),
   provider_calls:records.length,models:[...new Set(records.map(r=>r.model))],latency_ms:records.reduce((n,r)=>n+r.latency_ms,0),usage,usage_known:known,
   estimated_usd:known?records.reduce((n,r)=>n+r.estimated_usd,0):null,
   cost_basis:'Conservative standard USD estimate: GPT-6.2 Sol input 2/output 10, Claude Haiku 4.5 input 1/output 5 per million tokens. No GPT cache discount. Failed calls may be billed; totals unknown after transport failure. Excludes tax/FX.',
   routing_calls:records.map(({usage,...safe})=>safe)};
 }
 return {fetch:routed,summarize,enabled};
}
module.exports={create,openaiPayload,normalize,estimate,MODEL};
