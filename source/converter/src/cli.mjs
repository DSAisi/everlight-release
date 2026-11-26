#!/usr/bin/env node
import {status} from './status.mjs';
import {submitTrial} from "./rc6.mjs";
import fsp from 'node:fs/promises';
import path from 'node:path';
import {prepare,runChunks,approveCalibration,verifyResults,merge} from './core.mjs';

const args=process.argv.slice(2), command=args.shift();
const value=(flag,fallback)=>{const i=args.indexOf(flag);return i>=0?args[i+1]:fallback};
const configPath=path.resolve(value('--config','config.json'));
async function load(){const c=JSON.parse(await fsp.readFile(configPath,'utf8')); c.input=path.resolve(path.dirname(configPath),c.input); c.workDir=path.resolve(path.dirname(configPath),c.workDir); return c;}
try{
  const config=await load(); let result;
  if(command==='submit-trial') result=await submitTrial(config,{url:process.env.EVERLIGHT_TRIAL_URL,token:process.env.EVERLIGHT_CORE_TOKEN,hostToken:process.env.EVERLIGHT_SHARED_HOST_TOKEN,confirmed:args.includes('--confirm-isolated-trial')});
  else
  if(command==='status') result=await status(config.workDir);
  else if(command==='prepare') result=await prepare(config);
  else if(command==='calibrate') result=await runChunks(config,'calibration');
  else if(command==='approve-calibration') result=await approveCalibration(config,value('--reviewer'),value('--note'));
  else if(command==='run') result=await runChunks(config,'full');
  else if(command==='verify') result=await verifyResults(config,value('--mode','full'));
  else if(command==='merge') result=await merge(config);
  else throw new Error('Usage: prepare | calibrate | approve-calibration --reviewer NAME --note TEXT | run | verify [--mode calibration] | merge');
  console.log(JSON.stringify(result,null,2));
}catch(error){console.error(error.stack||error);process.exitCode=1;}
