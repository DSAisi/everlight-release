import fs from 'node:fs';
import path from 'node:path';
export class Budget {
 constructor(dir,config){this.file=path.join(dir,'budget.jsonl');this.limit=config?.maxTokens;this.used=0; if(!Number.isSafeInteger(this.limit)||this.limit<=0)throw Error('budget.maxTokens must be a positive integer');if(fs.existsSync(this.file))for(const line of fs.readFileSync(this.file,'utf8').trim().split('\n').filter(Boolean)){const r=JSON.parse(line);if(!Number.isSafeInteger(r.delta))throw Error('Invalid budget ledger');this.used+=r.delta;} }
 record(delta){const fd=fs.openSync(this.file,'a',0o600);try{fs.writeSync(fd,JSON.stringify({delta,at:new Date().toISOString()})+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}this.used+=delta;}
 reserve(n){if(!Number.isSafeInteger(n)||n<=0)throw Error('Invalid reservation');if(this.used+n>this.limit){const e=Error('Token reservation budget exhausted');e.budget=true;throw e;}this.record(n);return n;}
 settle(n,usage){const actual=usage?.total_tokens;if(Number.isSafeInteger(actual)&&actual>=0)this.record(actual-n);}
}
