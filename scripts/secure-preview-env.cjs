'use strict';
const fs=require('node:fs'),{spawnSync}=require('node:child_process'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const cli='C:/Users/김도윤/AppData/Roaming/npm/node_modules/vercel/dist/index.js';
const auth=path.resolve(root,'../vercel-auth');
const match=fs.readFileSync(path.join(root,'.env.local'),'utf8').match(/^OPENAI_API_KEY=(.+)$/m);
if(!match)throw new Error('OPENAI_KEY_MISSING');
const args=[cli,'--global-config',auth,'--scope','taekilso','env','add','OPENAI_API_KEY','preview','--git-branch','add-openai-comparison','--project','prj_QRQCcvVWXcAdH9vTh8vmAklm09xj','--type','secret','--yes'];
const result=spawnSync(process.execPath,args,{cwd:root,input:match[1].trim()+'\n',encoding:'utf8',windowsHide:true});
if(result.status!==0){console.error('PREVIEW_SECRET_REGISTRATION_FAILED; '+String((result.stderr||'')+'\n'+(result.stdout||'')).replaceAll(match[1].trim(),'[REDACTED]').replace(/sk-[A-Za-z0-9_-]+/g,'[REDACTED]').slice(-2200));process.exitCode=1;}
else console.log('OPENAI_API_KEY registered as branch-scoped preview Secret; production unchanged');
