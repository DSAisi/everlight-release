export async function waitReady(probe,{timeout=20000,interval=100,stopped=()=>false}={}){
 const deadline=Date.now()+timeout;
 while(!stopped()&&Date.now()<deadline){
  try{if(await probe())return;}catch{}
  await new Promise(r=>setTimeout(r,interval));
 }
 throw Error('service readiness failed or startup cancelled');
}
