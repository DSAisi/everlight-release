const slots=Array.from({length:12},(_,i)=>'S'+String(i+1).padStart(2,'0'));
export function validateRecall(run){
 if(!run||typeof run.run_id!=='string'||!run.run_id||!Array.isArray(run.checked)||run.checked.length!==12||!slots.every(s=>run.checked.includes(s))||!Array.isArray(run.selected))throw Error('invalid recall receipt');
}
